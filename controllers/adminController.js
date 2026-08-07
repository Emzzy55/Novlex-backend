const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Investment = require('../models/Investment');
const Notification = require('../models/Notification');
const nodemailer = require('nodemailer');

const sendUserEmail = async (toEmail, subject, html) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
    await transporter.sendMail({ from: `"Novlex" <${process.env.GMAIL_USER}>`, to: toEmail, subject, html });
  } catch (err) { console.error('User email error:', err.message); }
};

exports.getDashboard = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const [totalDepositsAgg, totalWithdrawalsAgg, totalEarningsAgg] = await Promise.all([
      Transaction.aggregate([{ $match: { type: 'deposit', status: 'approved' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Transaction.aggregate([{ $match: { type: 'withdrawal', status: 'approved' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Transaction.aggregate([{ $match: { type: 'earning', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);
    const pendingDeposits = await Transaction.countDocuments({ type: 'deposit', status: 'pending' });
    const pendingWithdrawals = await Transaction.countDocuments({ type: 'withdrawal', status: 'pending' });
    const activeInvestments = await Investment.countDocuments({ status: 'active' });
    const recentUsers = await User.find({ role: 'user' }).sort({ createdAt: -1 }).limit(5).select('fullName email walletBalance createdAt');

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalDeposits: totalDepositsAgg[0]?.total || 0,
        totalWithdrawals: totalWithdrawalsAgg[0]?.total || 0,
        pendingDeposits, pendingWithdrawals, activeInvestments,
        totalEarningsPaid: totalEarningsAgg[0]?.total || 0,
        recentUsers,
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getAllUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const search = req.query.search?.trim() || '';
    const query = search
      ? { $or: [{ fullName: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }], role: 'user' }
      : { role: 'user' };
    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(query)
    ]);
    res.json({ success: true, users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getUserDetail = async (req, res) => {
  try {
    // Bug 14 Fix: Don't expose paymentProof in user detail view for non-admin
    const user = await User.findById(req.params.id)
      .populate('referralLevel1', 'fullName email')
      .populate('referralLevel2', 'fullName email')
      .populate('referralLevel3', 'fullName email');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const [investments, transactions] = await Promise.all([
      Investment.find({ user: user._id }).sort({ createdAt: -1 }),
      Transaction.find({ user: user._id }).sort({ createdAt: -1 }).limit(20).select('-paymentProof')
    ]);
    res.json({ success: true, user, investments, transactions });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateUserBalance = async (req, res) => {
  try {
    const { amount, action, note } = req.body;
    const num = Number(amount);
    if (!isFinite(num) || num <= 0) return res.status(400).json({ success: false, message: 'Invalid amount.' });
    if (!['add', 'deduct'].includes(action)) return res.status(400).json({ success: false, message: 'Invalid action.' });

    let user;
    if (action === 'add') {
      user = await User.findByIdAndUpdate(req.params.id, { $inc: { walletBalance: num } }, { new: true });
    } else {
      user = await User.findOneAndUpdate(
        { _id: req.params.id, walletBalance: { $gte: num } },
        { $inc: { walletBalance: -num } },
        { new: true }
      );
      if (!user) return res.status(400).json({ success: false, message: 'Insufficient balance to deduct.' });
    }

    await Transaction.create({
      user: user._id, type: 'earning', amount: num, status: 'completed',
      description: note || `Admin ${action === 'add' ? 'added' : 'deducted'} ₦${num.toLocaleString()}`,
      processedBy: req.user.id
    });

    res.json({ success: true, message: `Balance ${action === 'add' ? 'added' : 'deducted'}.`, newBalance: user.walletBalance });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.banUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot ban admin accounts.' });
    user.isBanned = !user.isBanned;
    // Clear refresh token on ban to force logout
    if (user.isBanned) user.refreshToken = null;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: `User ${user.isBanned ? 'banned' : 'unbanned'}.` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getPendingDeposits = async (req, res) => {
  try {
    // Bug 14 Fix: paymentProof only visible to admin
    const deposits = await Transaction.find({ type: 'deposit', status: 'pending' })
      .populate('user', 'fullName email phone')
      .sort({ createdAt: -1 });
    res.json({ success: true, deposits });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Bug 10 Fix: Atomic status check to prevent double approval
exports.approveDeposit = async (req, res) => {
  try {
    // Atomic findOneAndUpdate - only updates if status is still 'pending'
    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, type: 'deposit', status: 'pending' },
      { status: 'approved', processedBy: req.user.id, processedAt: new Date(), adminNote: req.body.note || 'Approved' },
      { new: true }
    ).populate('user');

    if (!transaction) return res.status(400).json({ success: false, message: 'Transaction not found or already processed.' });

    // Credit user wallet atomically
    const user = await User.findByIdAndUpdate(
      transaction.user._id || transaction.user,
      { $inc: { walletBalance: transaction.amount, totalDeposited: transaction.amount } },
      { new: true }
    );

    // Send user email + in-app notification
    try {
      const userDoc = await User.findById(transaction.user._id || transaction.user);
      sendUserEmail(userDoc.email, '✅ Deposit Confirmed — Novlex', `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#111;color:#eee;padding:32px;border-radius:12px;">
          <h2 style="color:#22C55E;">✅ Deposit Confirmed!</h2>
          <p>Hi ${userDoc.fullName}, your deposit has been confirmed and added to your wallet.</p>
          <div style="background:#1a1a1a;border-radius:8px;padding:20px;margin:16px 0;text-align:center;">
            <div style="font-size:36px;font-weight:800;color:#C9A84C;">₦${transaction.amount.toLocaleString()}</div>
            <div style="color:#888;font-size:13px;">Added to your wallet</div>
          </div>
          <p style="color:#888;font-size:13px;">Reference: ${transaction.reference}</p>
          <a href="https://novlex.com.ng/invest.html" style="display:inline-block;margin-top:16px;background:#C9A84C;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Invest Now →</a>
        </div>`);

      await Notification.create({
        user: userDoc._id, title: '✅ Deposit Confirmed',
        body: `Your deposit of ₦${transaction.amount.toLocaleString()} has been confirmed and added to your wallet.`,
        type: 'deposit'
      });
    } catch (e) { console.error('Notification error:', e.message); }

    res.json({ success: true, message: 'Deposit approved and wallet credited.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.rejectDeposit = async (req, res) => {
  try {
    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, type: 'deposit', status: 'pending' },
      { status: 'rejected', processedBy: req.user.id, processedAt: new Date(), adminNote: req.body.note || 'Rejected' },
      { new: true }
    );
    if (!transaction) return res.status(400).json({ success: false, message: 'Transaction not found or already processed.' });

    try {
      const user = await User.findById(transaction.user);
      await Notification.create({
        user: user._id, title: '❌ Deposit Rejected',
        body: `Your deposit of ₦${transaction.amount.toLocaleString()} was rejected. Reason: ${req.body.note || 'Contact support for details.'}`,
        type: 'deposit'
      });
    } catch (e) { console.error('Notification error:', e.message); }

    res.json({ success: true, message: 'Deposit rejected.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getPendingWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Transaction.find({ type: 'withdrawal', status: 'pending' })
      .populate('user', 'fullName email phone')
      .sort({ createdAt: -1 });
    res.json({ success: true, withdrawals });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Bug 10 Fix: Atomic withdrawal approval
exports.approveWithdrawal = async (req, res) => {
  try {
    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, type: 'withdrawal', status: 'pending' },
      { status: 'approved', processedBy: req.user.id, processedAt: new Date(), adminNote: req.body.note || 'Payment sent via Kuda' },
      { new: true }
    );
    if (!transaction) return res.status(400).json({ success: false, message: 'Transaction not found or already processed.' });

    const netAmount = Math.floor(transaction.amount * 0.9);
    await User.findByIdAndUpdate(transaction.user, { $inc: { totalWithdrawn: transaction.amount } });

    try {
      const user = await User.findById(transaction.user);
      sendUserEmail(user.email, '💸 Withdrawal Processed — Novlex', `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#111;color:#eee;padding:32px;border-radius:12px;">
          <h2 style="color:#C9A84C;">💸 Withdrawal Processed!</h2>
          <p>Hi ${user.fullName}, your withdrawal has been sent to your bank account.</p>
          <div style="background:#1a1a1a;border-radius:8px;padding:20px;margin:16px 0;text-align:center;">
            <div style="font-size:36px;font-weight:800;color:#22C55E;">₦${netAmount.toLocaleString()}</div>
            <div style="color:#888;font-size:13px;">Sent to ${transaction.bankName} — ${transaction.bankAccount}</div>
          </div>
          <p style="color:#888;font-size:13px;">Reference: ${transaction.reference}</p>
        </div>`);

      await Notification.create({
        user: user._id, title: '💸 Withdrawal Sent',
        body: `₦${netAmount.toLocaleString()} has been sent to your ${transaction.bankName} account (${transaction.bankAccount}).`,
        type: 'withdrawal'
      });
    } catch (e) { console.error('Notification error:', e.message); }

    res.json({ success: true, message: 'Withdrawal approved. Remember to send money via Kuda!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.rejectWithdrawal = async (req, res) => {
  try {
    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, type: 'withdrawal', status: 'pending' },
      { status: 'rejected', processedBy: req.user.id, processedAt: new Date(), adminNote: req.body.note || 'Rejected' },
      { new: true }
    );
    if (!transaction) return res.status(400).json({ success: false, message: 'Transaction not found or already processed.' });

    // Refund atomically
    await User.findByIdAndUpdate(transaction.user, { $inc: { walletBalance: transaction.amount } });

    try {
      const user = await User.findById(transaction.user);
      await Notification.create({
        user: user._id, title: '↩️ Withdrawal Rejected',
        body: `Your withdrawal of ₦${transaction.amount.toLocaleString()} was rejected and refunded to your wallet. Reason: ${req.body.note || 'Contact support.'}`,
        type: 'withdrawal'
      });
    } catch (e) { console.error('Notification error:', e.message); }

    res.json({ success: true, message: 'Withdrawal rejected and balance refunded.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getAnalytics = async (req, res) => {
  try {
    const analytics = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const start = new Date(date); start.setHours(0,0,0,0);
      const end = new Date(date); end.setHours(23,59,59,999);
      const [users, deposits, withdrawals] = await Promise.all([
        User.countDocuments({ role: 'user', createdAt: { $gte: start, $lte: end } }),
        Transaction.aggregate([{ $match: { type: 'deposit', status: 'approved', createdAt: { $gte: start, $lte: end } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Transaction.aggregate([{ $match: { type: 'withdrawal', status: 'approved', createdAt: { $gte: start, $lte: end } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      ]);
      analytics.push({ date: start.toLocaleDateString('en-NG', { weekday:'short', month:'short', day:'numeric' }), users, deposits: deposits[0]?.total || 0, withdrawals: withdrawals[0]?.total || 0 });
    }
    res.json({ success: true, analytics });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.exportUsersCSV = async (req, res) => {
  try {
    const users = await User.find({ role: 'user' }).select('fullName email phone walletBalance totalDeposited totalWithdrawn totalEarnings totalReferralEarnings referralCode createdAt isBanned');
    const headers = ['Full Name','Email','Phone','Wallet Balance','Total Deposited','Total Withdrawn','Total Earnings','Referral Earnings','Referral Code','Status','Date Joined'];
    const rows = users.map(u => [u.fullName, u.email, u.phone||'', u.walletBalance, u.totalDeposited, u.totalWithdrawn, u.totalEarnings, u.totalReferralEarnings, u.referralCode, u.isBanned?'Banned':'Active', new Date(u.createdAt).toLocaleDateString('en-NG')]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=novlex-users-${Date.now()}.csv`);
    res.send(csv);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
