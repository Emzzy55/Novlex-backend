const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { sendAdminEmail, emailTemplates } = require('../config/mailer');

const generateTokens = (id) => {
  const accessToken = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

// Validate positive finite amount (Bug 15)
const validateAmount = (amount, min) => {
  const num = Number(amount);
  if (!isFinite(num) || num <= 0 || num < min) return false;
  return num;
};

exports.register = async (req, res) => {
  try {
    // Bug 11 Fix: NEVER accept role from request body
    const { fullName, email, password, phone, referralCode } = req.body;
    if (!fullName || !email || !password) return res.status(400).json({ success: false, message: 'Please fill all required fields.' });
    if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered.' });

    let referrer = null, referrerParent = null, referrerGrandParent = null;
    if (referralCode) {
      referrer = await User.findOne({ referralCode: referralCode.toUpperCase().trim() });
      if (!referrer) return res.status(400).json({ success: false, message: 'Invalid referral code.' });
      if (referrer.isBanned) return res.status(400).json({ success: false, message: 'Invalid referral code.' });

      if (referrer.referredBy) {
        referrerParent = await User.findById(referrer.referredBy);
        if (referrerParent && referrerParent.referredBy) {
          referrerGrandParent = await User.findById(referrerParent.referredBy);
        }
      }
    }

    // Bug 11 Fix: role is NOT taken from req.body - always 'user'
    const user = await User.create({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password,
      phone: phone ? phone.trim() : '',
      role: 'user', // Always force user role
      referredBy: referrer ? referrer._id : null,
    });

    // Welcome bonus transaction
    await Transaction.create({
      user: user._id, type: 'welcome_bonus', amount: 200,
      status: 'completed', description: 'Welcome bonus credited to your wallet'
    });

    // Update referral chains
    if (referrer) {
      await User.findByIdAndUpdate(referrer._id, { $push: { referralLevel1: user._id } });
    }
    if (referrerParent) {
      await User.findByIdAndUpdate(referrerParent._id, { $push: { referralLevel2: user._id } });
    }
    if (referrerGrandParent) {
      await User.findByIdAndUpdate(referrerGrandParent._id, { $push: { referralLevel3: user._id } });
    }

    const { accessToken, refreshToken } = generateTokens(user._id);
    await User.findByIdAndUpdate(user._id, { refreshToken });

    // Notify admin
    try {
      const emailData = emailTemplates.newUser(user);
      sendAdminEmail(emailData.subject, emailData.html);
    } catch (e) { console.error('Email error:', e.message); }

    res.status(201).json({
      success: true,
      message: 'Account created! ₦200 welcome bonus added.',
      accessToken, refreshToken,
      user: { id: user._id, fullName: user.fullName, email: user.email, role: 'user', walletBalance: 200, referralCode: user.referralCode }
    });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Email already registered.' });
    res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required.' });

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password +refreshToken');
    if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    if (user.isBanned) return res.status(403).json({ success: false, message: 'Your account has been suspended. Contact support.' });
    if (user.isLocked()) return res.status(423).json({ success: false, message: 'Account locked due to too many failed attempts. Try again in 15 minutes.' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incrementLoginAttempts();
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    await user.resetLoginAttempts();

    // Save login history
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'Unknown';
    const device = (req.headers['user-agent'] || 'Unknown').substring(0, 100);
    const { accessToken, refreshToken } = generateTokens(user._id);

    await User.findByIdAndUpdate(user._id, {
      refreshToken,
      lastLogin: new Date(),
      $push: { loginHistory: { $each: [{ timestamp: new Date(), ip, device }], $slice: -10 } }
    });

    res.json({
      success: true, message: 'Login successful.',
      accessToken, refreshToken,
      user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role, walletBalance: user.walletBalance, referralCode: user.referralCode }
    });
  } catch (err) { res.status(500).json({ success: false, message: 'Login failed. Please try again.' }); }
};

exports.adminLogin = async (req, res) => {
  try {
    const { email, password, adminPin } = req.body;

    // Bug 12 Fix: Check PIN first with brute force protection
    if (!adminPin) return res.status(403).json({ success: false, message: 'Admin PIN is required.' });

    const user = await User.findOne({ email: email?.toLowerCase()?.trim(), role: 'admin' }).select('+password +refreshToken');
    if (!user) return res.status(403).json({ success: false, message: 'Access denied.' });

    // Bug 12 Fix: Admin-specific lock
    if (user.adminLockUntil && user.adminLockUntil > Date.now()) {
      return res.status(423).json({ success: false, message: 'Admin account locked. Try again in 30 minutes.' });
    }

    if (adminPin !== process.env.ADMIN_SECRET_PIN) {
      user.adminLoginAttempts = (user.adminLoginAttempts || 0) + 1;
      if (user.adminLoginAttempts >= 3) {
        user.adminLockUntil = new Date(Date.now() + 30 * 60 * 1000);
        user.adminLoginAttempts = 0;
        await user.save({ validateBeforeSave: false });
        console.warn(`SECURITY: Admin PIN brute force detected for ${email}`);
        return res.status(423).json({ success: false, message: 'Too many wrong PINs. Admin locked for 30 minutes.' });
      }
      await user.save({ validateBeforeSave: false });
      return res.status(403).json({ success: false, message: `Invalid admin PIN. ${3 - user.adminLoginAttempts} attempts remaining.` });
    }

    if (user.isLocked()) return res.status(423).json({ success: false, message: 'Account locked. Try again in 15 minutes.' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incrementLoginAttempts();
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // Reset admin attempts on success
    user.adminLoginAttempts = 0;
    user.adminLockUntil = undefined;
    user.loginAttempts = 0;
    user.lockUntil = undefined;

    const { accessToken, refreshToken } = generateTokens(user._id);
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true, message: 'Admin login successful.',
      accessToken, refreshToken,
      user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role }
    });
  } catch (err) { res.status(500).json({ success: false, message: 'Login failed.' }); }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ success: false, message: 'No refresh token.' });
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    }
    const tokens = generateTokens(user._id);
    await User.findByIdAndUpdate(user._id, { refreshToken: tokens.refreshToken });
    res.json({ success: true, ...tokens });
  } catch (err) { res.status(401).json({ success: false, message: 'Session expired. Please login again.', expired: true }); }
};

exports.logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { refreshToken: null });
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
