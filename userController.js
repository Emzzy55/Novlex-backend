const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Investment = require('../models/Investment');

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('referralLevel1', 'fullName email createdAt').populate('referralLevel2', 'fullName email createdAt').populate('referralLevel3', 'fullName email createdAt');
    res.json({ success: true, user });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateProfile = async (req, res) => {
  try {
    const { fullName, phone, bankName, bankAccount, bankAccountName } = req.body;
    const user = await User.findByIdAndUpdate(req.user.id, { fullName, phone, bankName, bankAccount, bankAccountName }, { new: true, runValidators: true });
    res.json({ success: true, message: 'Profile updated.', user });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getDashboard = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const activeInvestments = await Investment.find({ user: req.user.id, status: 'active' });
    const recentTransactions = await Transaction.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(10);
    const totalReferrals = user.referralLevel1.length + user.referralLevel2.length + user.referralLevel3.length;
    res.json({
      success: true,
      dashboard: {
        walletBalance: user.walletBalance,
        totalEarnings: user.totalEarnings,
        totalDeposited: user.totalDeposited,
        totalWithdrawn: user.totalWithdrawn,
        totalReferralEarnings: user.totalReferralEarnings,
        totalReferrals,
        referralLevel1Count: user.referralLevel1.length,
        referralLevel2Count: user.referralLevel2.length,
        referralLevel3Count: user.referralLevel3.length,
        activeInvestments,
        recentTransactions,
        referralCode: user.referralCode,
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
