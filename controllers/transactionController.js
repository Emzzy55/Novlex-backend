const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { sendAdminEmail, emailTemplates } = require('../config/mailer');

exports.requestDeposit = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 3000) return res.status(400).json({ success: false, message: 'Minimum deposit is N3,000.' });
    const transaction = await Transaction.create({
      user: req.user.id, type: 'deposit', amount: Number(amount), status: 'pending',
      description: 'Deposit request pending admin approval',
    });
    const user = await User.findById(req.user.id);

    // Notify admin
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

    // Notify admin about proof upload
    const user = await User.findById(req.user.id);
    const emailData = emailTemplates.proofUploaded(user, transaction.amount, req.file.path);
    sendAdminEmail(emailData.subject, emailData.html);

    res.json({ success: true, message: 'Payment proof uploaded. Admin will confirm shortly.', transaction });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.requestWithdrawal = async (req, res) => {
  try {
    const { amount, bankName, bankAccount, bankAccountName } = req.body;
    if (!amount || amount < 1500) return res.status(400).json({ success: false, message: 'Minimum withdrawal is N1,500.' });
    if (!bankName || !bankAccount || !bankAccountName) return res.status(400).json({ success: false, message: 'Bank details are required.' });

    const now = new Date();
    const hours = now.getHours();
    if (hours < 10 || hours >= 18) return res.status(400).json({ success: false, message: 'Withdrawals are only processed between 10:00 AM and 6:00 PM.' });

    const user = await User.findById(req.user.id);
    const charge = amount * 0.10;
    const netAmount = amount - charge;
    if (user.walletBalance < amount) return res.status(400).json({ success: false, message: 'Insufficient wallet balance.' });

    user.walletBalance -= amount;
    await user.save();

    const transaction = await Transaction.create({
      user: req.user.id, type: 'withdrawal', amount: Number(amount), status: 'pending',
      description: `Withdrawal request (10% charge applied, you receive N${netAmount.toFixed(0)})`,
      bankName, bankAccount, bankAccountName,
    });

    // Notify admin
    const emailData = emailTemplates.newWithdrawal(user, amount, { bankName, bankAccount, bankAccountName });
    sendAdminEmail(emailData.subject, emailData.html);

    res.status(201).json({ success: true, message: `Withdrawal request submitted. You will receive N${netAmount.toFixed(0)} after 10% charge.`, transaction });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getMyTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, transactions });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
