const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  type: { type: String, enum: ['deposit', 'withdrawal', 'earning', 'referral', 'announcement', 'system'], default: 'system' },
  isRead: { type: Boolean, default: false },
  data: { type: Object, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
