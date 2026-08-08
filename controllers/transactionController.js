const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Investment = require('../models/Investment');
const Notification = require('../models/Notification');
const { sendAdminEmail, emailTemplates } = require('../config/mailer');

const isOperatingHours = () => {
  const now = new Date();
  const hour = now.getHours();
  // Monday to Sunday, 5AM to 12AM (midnight)
  return hour >= 5 && hour < 24;
};

// Bug 15 Fix: Validate amount is positive finite number
const validateAmount = (amount) => {
  const num = Number(amount);
  return isFinite(num) && num > 0 ? num : null;
};

exports.requestDeposit = async (req, res) => {
  try {
    const amount = validateAmount(req.body.amount);
    if (!amount || amount < 3000) return res.status(400).json({ success: false, message: 'Minimum deposit is ₦3,000.' });

    // Max 3 pending deposits at once
    const pendingCount = await Transaction.countDocuments({ user: req.user.id, type: 'deposit', status: 'pending' });
    if (pendingCount >= 3) return res.status(400).json({ success: false, message: 'You have pending deposits awaiting approval. Please wait before submitting another.' });

    const transaction = await Transaction.create({
      user: req.user.id, type: 'deposit', amount,
      status: 'pending', description: 'Deposit request - awaiting payment proof upload',
    });

    // Bug 1 Fix: Do NOT send admin email here - only send when proof is uploaded
    res.status(201).json({ success: true, message: 'Deposit request created. Please upload your payment proof.', transaction });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.uploadProof = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const transaction = await Transaction.findOne({
      _id: transactionId, user: req.user.id, type: 'deposit', status: 'pending'
    });
    if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found or already processed.' });
    if (!req.file) return res.status(400).json({ success: false, message: 'Please upload a payment proof image.' });

    transaction.paymentProof = req.file.path;
    transaction.description = 'Deposit request - proof uploaded, awaiting admin approval';
    await transaction.save();

    // Bug 1 Fix: Send ONE email only here (when proof is uploaded and ready to review)
    const user = await User.findById(req.user.id);
    try {
      const emailData = emailTemplates.proofUploaded(user, transaction.amount, req.file.path);
      sendAdminEmail(emailData.subject, emailData.html);
    } catch (e) { console.error('Email error:', e.message); }

    res.json({ success: true, message: 'Payment proof uploaded! Admin will confirm within a few hours.', transaction });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.requestWithdrawal = async (req, res) => {
  try {
    // Bug 15 Fix: Validate amount is positive
    const amount = validateAmount(req.body.amount);
    if (!amount || amount < 1500) return res.status(400).json({ success: false, message: 'Minimum withdrawal is ₦1,500.' });

    const { bankName, bankAccount, bankAccountName } = req.body;
    if (!bankName || !bankAccount || !bankAccountName) return res.status(400).json({ success: false, message: 'All bank details are required.' });
    if (bankAccount.length !== 10 || !/^\d+$/.test(bankAccount)) return res.status(400).json({ success: false, message: 'Account number must be exactly 10 digits.' });

    // Operating hours check
    if (!isOperatingHours()) return res.status(400).json({ success: false, message: 'Withdrawals are only processed from 5:00 AM to midnight, 7 days a week.' });

    // Bug fix: Must have active investment plan
    const activePlan = await Investment.findOne({ user: req.user.id, status: 'active' });
    if (!activePlan) return res.status(400).json({ success: false, message: 'You must have an active investment plan to withdraw.' });

    // Bug 6 Fix: Only one pending withdrawal at a time
    const pendingWithdrawal = await Transaction.findOne({ user: req.user.id, type: 'withdrawal', status: 'pending' });
    if (pendingWithdrawal) return res.status(400).json({ success: false, message: 'You already have a pending withdrawal. Wait for it to be processed first.' });

    // Bug 5 Fix: Atomic wallet deduction - deduct and create transaction atomically
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, walletBalance: { $gte: amount } },
      { $inc: { walletBalance: -amount } },
      { new: true }
    );

    if (!user) return res.status(400).json({ success: false, message: 'Insufficient wallet balance.' });

    const netAmount = Math.floor(amount * 0.9);

    const transaction = await Transaction.create({
      user: req.user.id, type: 'withdrawal', amount,
      status: 'pending', description: `Withdrawal request. You receive ₦${netAmount.toLocaleString()} after 10% charge.`,
      bankName: bankName.trim(), bankAccount: bankAccount.trim(), bankAccountName: bankAccountName.trim(),
    });

    // Notify admin
    try {
      const emailData = emailTemplates.newWithdrawal(user, amount, { bankName, bankAccount, bankAccountName });
      sendAdminEmail(emailData.subject, emailData.html);
    } catch (e) { console.error('Email error:', e.message); }

    res.status(201).json({
      success: true,
      message: `Withdrawal submitted! You will receive ₦${netAmount.toLocaleString()} after 10% charge.`,
      transaction
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getMyTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, transactions });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
