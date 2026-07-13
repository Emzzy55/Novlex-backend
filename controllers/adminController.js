const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Investment = require('../models/Investment');

exports.getDashboard = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalDeposits = await Transaction.aggregate([{ $match: { type: 'deposit', status: 'approved' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const totalWithdrawals = await Transaction.aggregate([{ $match: { type: 'withdrawal', status: 'approved' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const pendingDeposits = await Transaction.countDocuments({ type: 'deposit', status: 'pending' });
    const pendingWithdrawals = await Transaction.countDocuments({ type: 'withdrawal', status: 'pending' });
    const activeInvestments = await Investment.countDocuments({ status: 'active' });
    const totalEarningsPaid = await Transaction.aggregate([{ $match: { type: 'earning', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const recentUsers = await User.find({ role: 'user' }).sort({ createdAt: -1 }).limit(5).select('fullName email walletBalance createdAt');

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalDeposits: totalDeposits[0]?.total || 0,
        totalWithdrawals: totalWithdrawals[0]?.total || 0,
        pendingDeposits,
        pendingWithdrawals,
        activeInvestments,
        totalEarningsPaid: totalEarningsPaid[0]?.total || 0,
        recentUsers,
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const query = search ? { $or: [{ fullName: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }], role: 'user' } : { role: 'user' };
    const users = await User.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    const total = await User.countDocuments(query);
    res.json({ success: true, users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getUserDetail = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('referralLevel1', 'fullName email').populate('referralLevel2', 'fullName email').populate('referralLevel3', 'fullName email');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const investments = await Investment.find({ user: user._id }).sort({ createdAt: -1 });
    const transactions = await Transaction.find({ user: user._id }).sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, user, investments, transactions });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateUserBalance = async (req, res) => {
  try {
    const { amount, action, note } = req.body; // action: 'add' or 'deduct'
    if (!amount || isNaN(amount) || Number(amount) <= 0) return res.status(400).json({ success: false, message: 'Valid amount is required.' });
    if (!['add', 'deduct'].includes(action)) return res.status(400).json({ success: false, message: 'Action must be "add" or "deduct".' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (action === 'add') {
      user.walletBalance += Number(amount);
      await user.save();
    } else {
      const updated = await User.findOneAndUpdate(
        { _id: req.params.id, walletBalance: { $gte: Number(amount) } },
        { $inc: { walletBalance: -Number(amount) } },
        { new: true }
      );
      if (!updated) return res.status(400).json({ success: false, message: 'Insufficient balance to deduct.' });
    }
    const finalUser = await User.findById(req.params.id);
    await Transaction.create({ user: req.params.id, type: action === 'add' ? 'admin_credit' : 'admin_debit', amount: Number(amount), status: 'completed', description: note || `Admin ${action}ed N${amount}`, processedBy: req.user.id });
    res.json({ success: true, message: `Balance ${action === 'add' ? 'added' : 'deducted'} successfully.`, newBalance: finalUser.walletBalance });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.banUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    user.isBanned = !user.isBanned;
    await user.save();
    res.json({ success: true, message: `User ${user.isBanned ? 'banned' : 'unbanned'} successfully.` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Deposits management
exports.getPendingDeposits = async (req, res) => {
  try {
    const deposits = await Transaction.find({ type: 'deposit', status: 'pending' }).populate('user', 'fullName email phone').sort({ createdAt: -1 });
    res.json({ success: true, deposits });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.approveDeposit = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id).populate('user');
    if (!transaction || transaction.type !== 'deposit') return res.status(404).json({ success: false, message: 'Transaction not found.' });
    if (transaction.status !== 'pending') return res.status(400).json({ success: false, message: 'Transaction already processed.' });
    transaction.status = 'approved';
    transaction.processedBy = req.user.id;
    transaction.processedAt = new Date();
    transaction.adminNote = req.body.note || '';
    await transaction.save();
    const user = await User.findById(transaction.user._id || transaction.user);
    user.walletBalance += transaction.amount;
    user.totalDeposited += transaction.amount;
    await user.save();
    res.json({ success: true, message: 'Deposit approved and wallet credited.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.rejectDeposit = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction || transaction.type !== 'deposit') return res.status(404).json({ success: false, message: 'Transaction not found.' });
    if (transaction.status !== 'pending') return res.status(400).json({ success: false, message: 'Transaction already processed.' });
    transaction.status = 'rejected';
    transaction.processedBy = req.user.id;
    transaction.processedAt = new Date();
    transaction.adminNote = req.body.note || 'Rejected by admin';
    await transaction.save();
    res.json({ success: true, message: 'Deposit rejected.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Withdrawals management
exports.getPendingWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Transaction.find({ type: 'withdrawal', status: 'pending' }).populate('user', 'fullName email phone').sort({ createdAt: -1 });
    res.json({ success: true, withdrawals });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.approveWithdrawal = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction || transaction.type !== 'withdrawal') return res.status(404).json({ success: false, message: 'Transaction not found.' });
    if (transaction.status !== 'pending') return res.status(400).json({ success: false, message: 'Transaction already processed.' });
    transaction.status = 'approved';
    transaction.processedBy = req.user.id;
    transaction.processedAt = new Date();
    transaction.adminNote = req.body.note || 'Approved - payment sent';
    await transaction.save();
    const user = await User.findById(transaction.user);
    user.totalWithdrawn += transaction.amount;
    await user.save();
    res.json({ success: true, message: 'Withdrawal approved. Remember to send the money via OPay.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.rejectWithdrawal = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction || transaction.type !== 'withdrawal') return res.status(404).json({ success: false, message: 'Transaction not found.' });
    if (transaction.status !== 'pending') return res.status(400).json({ success: false, message: 'Transaction already processed.' });
    // Refund the user
    const user = await User.findById(transaction.user);
    user.walletBalance += transaction.amount;
    await user.save();
    transaction.status = 'rejected';
    transaction.processedBy = req.user.id;
    transaction.processedAt = new Date();
    transaction.adminNote = req.body.note || 'Rejected by admin - balance refunded';
    await transaction.save();
    res.json({ success: true, message: 'Withdrawal rejected and balance refunded to user.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
