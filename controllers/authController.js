const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const generateTokens = (id) => {
  const accessToken = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

exports.register = async (req, res) => {
  try {
    const { fullName, email, password, phone, referralCode } = req.body;
    if (!fullName || !email || !password) return res.status(400).json({ success: false, message: 'Please fill all required fields.' });
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered.' });

    let referrer = null, referrerParent = null, referrerGrandParent = null;
    if (referralCode) {
      referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (!referrer) return res.status(400).json({ success: false, message: 'Invalid referral code.' });
      if (referrer.referredBy) {
        referrerParent = await User.findById(referrer.referredBy);
        if (referrerParent && referrerParent.referredBy) referrerGrandParent = await User.findById(referrerParent.referredBy);
      }
    }

    const user = await User.create({ fullName, email, password, phone, referredBy: referrer ? referrer._id : null });
    await Transaction.create({ user: user._id, type: 'welcome_bonus', amount: 200, status: 'completed', description: 'Welcome bonus credited to your wallet' });

    if (referrer) { referrer.referralLevel1.push(user._id); await referrer.save(); }
    if (referrerParent) { referrerParent.referralLevel2.push(user._id); await referrerParent.save(); }
    if (referrerGrandParent) { referrerGrandParent.referralLevel3.push(user._id); await referrerGrandParent.save(); }

    const { accessToken, refreshToken } = generateTokens(user._id);
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    res.status(201).json({ success: true, message: 'Account created! N200 welcome bonus added.', accessToken, refreshToken, user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role, walletBalance: user.walletBalance, referralCode: user.referralCode } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required.' });
    const user = await User.findOne({ email }).select('+password +refreshToken');
    if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    if (user.isBanned) return res.status(403).json({ success: false, message: 'Your account has been suspended.' });
    if (user.isLocked()) return res.status(423).json({ success: false, message: 'Account locked. Try again in 15 minutes.' });
    const isMatch = await user.comparePassword(password);
    if (!isMatch) { await user.incrementLoginAttempts(); return res.status(401).json({ success: false, message: 'Invalid email or password.' }); }
    await user.resetLoginAttempts();
    const { accessToken, refreshToken } = generateTokens(user._id);
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: 'Login successful.', accessToken, refreshToken, user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role, walletBalance: user.walletBalance, referralCode: user.referralCode } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.adminLogin = async (req, res) => {
  try {
    const { email, password, adminPin } = req.body;
    if (!adminPin || adminPin !== process.env.ADMIN_SECRET_PIN) return res.status(403).json({ success: false, message: 'Invalid admin PIN.' });
    const user = await User.findOne({ email, role: 'admin' }).select('+password +refreshToken');
    if (!user) return res.status(403).json({ success: false, message: 'Access denied.' });
    if (user.isLocked()) return res.status(423).json({ success: false, message: 'Account locked. Try again in 15 minutes.' });
    const isMatch = await user.comparePassword(password);
    if (!isMatch) { await user.incrementLoginAttempts(); return res.status(401).json({ success: false, message: 'Invalid credentials.' }); }
    await user.resetLoginAttempts();
    const { accessToken, refreshToken } = generateTokens(user._id);
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: 'Admin login successful.', accessToken, refreshToken, user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ success: false, message: 'No refresh token.' });
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== refreshToken) return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    const tokens = generateTokens(user._id);
    user.refreshToken = tokens.refreshToken;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, ...tokens });
  } catch (err) { res.status(401).json({ success: false, message: 'Refresh token expired. Please login again.' }); }
};

exports.logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { refreshToken: null });
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
