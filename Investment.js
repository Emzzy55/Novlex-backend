const mongoose = require('mongoose');

const investmentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planName: { type: String, required: true },
  amount: { type: Number, required: true },
  dailyEarning: { type: Number, required: true },
  totalDays: { type: Number, default: 30 },
  daysCompleted: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
  lastCreditDate: { type: Date },
}, { timestamps: true });

investmentSchema.pre('save', function (next) {
  if (this.isNew) {
    const end = new Date();
    end.setDate(end.getDate() + 30);
    this.endDate = end;
  }
  next();
});

module.exports = mongoose.model('Investment', investmentSchema);
