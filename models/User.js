const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 60 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  phone: { type: String, trim: true },
  bankName: { type: String, trim: true },
  bankAccount: { type: String, trim: true },
  bankAccountName: { type: String, trim: true },

  walletBalance: { type: Number, default: 200 },
  totalEarnings: { type: Number, default: 0 },
  totalDeposited: { type: Number, default: 0 },
  totalWithdrawn: { type: Number, default: 0 },

  referralCode: { type: String, unique: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referralLevel1: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  referralLevel2: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  referralLevel3: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  totalReferralEarnings: { type: Number, default: 0 },

  isActive: { type: Boolean, default: true },
  isBanned: { type: Boolean, default: false },
  refreshToken: { type: String, select: false },
  lastLogin: { type: Date },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (this.isNew) {
    this.referralCode = Math.random().toString(36).substring(2, 8).toUpperCase() + Date.now().toString(36).toUpperCase();
  }
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

userSchema.methods.incrementLoginAttempts = async function () {
  this.loginAttempts += 1;
  if (this.loginAttempts >= 5) {
    this.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    this.loginAttempts = 0;
  }
  await this.save();
};

userSchema.methods.resetLoginAttempts = async function () {
  this.loginAttempts = 0;
  this.lockUntil = undefined;
  this.lastLogin = new Date();
  await this.save();
};

module.exports = mongoose.model('User', userSchema);
