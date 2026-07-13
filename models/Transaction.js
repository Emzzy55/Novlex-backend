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

transactionSchema.pre('save', function (next) {
  if (this.isNew && !this.reference) {
    this.reference = 'NVX' + Date.now() + Math.random().toString(36).substring(2, 6).toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);
