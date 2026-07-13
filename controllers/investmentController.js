const Investment = require('../models/Investment');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

const PLANS = [
  { name: 'Novlex 1', amount: 3000, dailyEarning: 600 },
  { name: 'Novlex 2', amount: 5000, dailyEarning: 1000 },
  { name: 'Novlex 3', amount: 10000, dailyEarning: 2000 },
  { name: 'Novlex 4', amount: 30000, dailyEarning: 3500 },
  { name: 'Novlex 5', amount: 50000, dailyEarning: 5000 },
  { name: 'Novlex 6', amount: 150000, dailyEarning: 10000 },
  { name: 'Novlex 7', amount: 500000, dailyEarning: 30000 },
  { name: 'Novlex 8', amount: 1000000, dailyEarning: 60000 },
];

exports.getPlans = (req, res) => res.json({ success: true, plans: PLANS });

exports.invest = async (req, res) => {
  try {
    const { planName, fromWallet } = req.body;
    const plan = PLANS.find(p => p.name === planName);
    if (!plan) return res.status(400).json({ success: false, message: 'Invalid plan.' });

    const user = await User.findById(req.user.id);

    // Check operating hours: Mon-Sun 10am-6pm
    const now = new Date();
    const hours = now.getHours();
    if (hours < 10 || hours >= 18) {
      return res.status(400).json({ success: false, message: 'Investments are only accepted between 10:00 AM and 6:00 PM.' });
    }

    // Atomic balance check-and-deduct to prevent race conditions from concurrent requests
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.user.id, walletBalance: { $gte: plan.amount } },
      { $inc: { walletBalance: -plan.amount, totalDeposited: plan.amount } },
      { new: true }
    );
    if (!updatedUser) {
      return res.status(400).json({ success: false, message: fromWallet ? 'Insufficient wallet balance.' : 'Insufficient wallet balance. Please make a deposit first.' });
    }
    await Transaction.create({ user: user._id, type: 'reinvestment', amount: plan.amount, status: 'completed', description: fromWallet ? `Invested in ${plan.name} plan (from wallet)` : `Invested in ${plan.name} plan` });

    const investment = await Investment.create({ user: user._id, planName: plan.name, amount: plan.amount, dailyEarning: plan.dailyEarning });

    // Pay referral commissions on investment
    if (user.referredBy) {
      const level1 = await User.findByIdAndUpdate(user.referredBy, { $inc: { walletBalance: plan.amount * 0.15, totalReferralEarnings: plan.amount * 0.15 } }, { new: true });
      if (level1) {
        const commission1 = plan.amount * 0.15;
        await Transaction.create({ user: level1._id, type: 'referral_bonus', amount: commission1, status: 'completed', description: `Level 1 referral bonus from ${user.fullName}`, fromUser: user._id, referralLevel: 1 });

        if (level1.referredBy) {
          const commission2 = plan.amount * 0.03;
          const level2 = await User.findByIdAndUpdate(level1.referredBy, { $inc: { walletBalance: commission2, totalReferralEarnings: commission2 } }, { new: true });
          if (level2) {
            await Transaction.create({ user: level2._id, type: 'referral_bonus', amount: commission2, status: 'completed', description: `Level 2 referral bonus from ${user.fullName}`, fromUser: user._id, referralLevel: 2 });

            if (level2.referredBy) {
              const commission3 = plan.amount * 0.02;
              const level3 = await User.findByIdAndUpdate(level2.referredBy, { $inc: { walletBalance: commission3, totalReferralEarnings: commission3 } }, { new: true });
              if (level3) {
                await Transaction.create({ user: level3._id, type: 'referral_bonus', amount: commission3, status: 'completed', description: `Level 3 referral bonus from ${user.fullName}`, fromUser: user._id, referralLevel: 3 });
              }
            }
          }
        }
      }
    }

    res.status(201).json({ success: true, message: `Successfully invested in ${plan.name} plan!`, investment });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getMyInvestments = async (req, res) => {
  try {
    const investments = await Investment.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, investments });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
