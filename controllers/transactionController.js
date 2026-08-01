const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Investment = require('../models/Investment');
const { sendAdminEmail, emailTemplates } = require('../config/mailer');

const isOperatingHours = () => {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
};

exports.requestDeposit = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 3000) return res.status(400).json({ success: false, message: 'Minimum deposit is ₦3,000.' });

    // Max 5 pending deposits
    const pendingCount = await Transaction.countDocuments({ user: req.user.id, type: 'deposit', status: 'pending' });
    if (pendingCount >= 5) return res.status(400).json({ success: false, message: 'You have too many pending deposits. Wait for admin to process them first.' });

    const transaction = await Transaction.create({
      user: req.user.id, type: 'deposit', amount: Number(amount), status: 'pending',
      description: 'Deposit request pending admin approval',
    });

    const user = await User.findById(req.user.id);
    const emailData = emailTemplates.newDeposit(user, amount, transaction.reference);
    sendAdminEmail(emailData.subject, emailData.html);

    res.status(201).json({ success: true, message: 'Deposit request submitted. Upload your payment proof.', transaction });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.uploadProof = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const transaction = await Transaction.findOne({ _id: transactionId, user: req.user.id, type: 'deposit', status: 'pending' });
    if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found.' });
    if (!req.file) return res.status(400).json({ success: false, message: 'Please upload a payment proof.' });
    transaction.paymentProof = req.file.path;
    await transaction.save();

    const user = await User.findById(req.user.id);
    const emailData = emailTemplates.proofUploaded(user, transaction.amount, req.file.path);
    sendAdminEmail(emailData.subject, emailData.html);

    res.json({ success: true, message: 'Payment proof uploaded. Admin will confirm shortly.', transaction });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.requestWithdrawal = async (req, res) => {
  try {
    const { amount, bankName, bankAccount, bankAccountName } = req.body;
    if (!amount || amount < 1500) return res.status(400).json({ success: false, message: 'Minimum withdrawal is ₦1,500.' });
    if (!bankName || !bankAccount || !bankAccountName) return res.status(400).json({ success: false, message: 'Bank details are required.' });

    // Check operating hours - weekdays 8am-6pm
    if (!isOperatingHours()) {
      return res.status(400).json({ success: false, message: 'Withdrawals are only processed Monday–Friday, 8:00 AM – 6:00 PM.' });
    }

    // Check user has at least one active investment plan
    const activePlan = await Investment.findOne({ user: req.user.id, status: 'active' });
    if (!activePlan) {
      return res.status(400).json({ success: false, message: 'You must have an active investment plan before you can withdraw. Please invest first.' });
    }

    const user = await User.findById(req.user.id);
    if (user.walletBalance < amount) return res.status(400).json({ success: false, message: 'Insufficient wallet balance.' });

    user.walletBalance -= amount;
    await user.save();

    const transaction = await Transaction.create({
      user: req.user.id, type: 'withdrawal', amount: Number(amount), status: 'pending',
      description: `Withdrawal request. After 10% charge you receive ₦${(amount * 0.9).toFixed(0)}`,
      bankName, bankAccount, bankAccountName,
    });

    const emailData = emailTemplates.newWithdrawal(user, amount, { bankName, bankAccount, bankAccountName });
    sendAdminEmail(emailData.subject, emailData.html);

    res.status(201).json({ success: true, message: `Withdrawal request submitted. You will receive ₦${(amount * 0.9).toFixed(0)} after 10% charge.`, transaction });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getMyTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, transactions });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
