const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'earning', 'referral_bonus', 'welcome_bonus', 'reinvestment', 'admin_credit', 'admin_debit'],
    required: true,
  },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
  description: { type: String },
  paymentProof: { type: String }, // Cloudinary URL
  adminNote: { type: String },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt: { type: Date },
  reference: { type: String, unique: true, sparse: true },
  // For withdrawals
  bankName: { type: String },
  bankAccount: { type: String },
  bankAccountName: { type: String },
  // For referral
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  referralLevel: { type: Number },
}, { timestamps: true });

// Bug 21 Fix: More unique reference using crypto-style generation
transactionSchema.pre('save', function (next) {
  if (this.isNew && !this.reference) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const random2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.reference = 'NVX' + timestamp + random1 + random2;
  }
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);
