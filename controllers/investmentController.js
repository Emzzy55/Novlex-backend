const Investment = require('../models/Investment');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { sendAdminEmail, emailTemplates } = require('../config/mailer');

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

const isOperatingHours = () => {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
};

exports.getPlans = (req, res) => res.json({ success: true, plans: PLANS });

exports.invest = async (req, res) => {
  try {
    const { planName } = req.body;
    const plan = PLANS.find(p => p.name === planName);
    if (!plan) return res.status(400).json({ success: false, message: 'Invalid plan selected.' });

    if (!isOperatingHours()) {
      return res.status(400).json({ success: false, message: 'Investments only accepted Monday–Friday, 8:00 AM – 6:00 PM.' });
    }

    // Bug 15 Fix: Validate amount is positive
    if (plan.amount <= 0) return res.status(400).json({ success: false, message: 'Invalid plan amount.' });

    // Atomic wallet deduction to prevent race conditions
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, walletBalance: { $gte: plan.amount } },
      { $inc: { walletBalance: -plan.amount, totalDeposited: plan.amount } },
      { new: true }
    );

    if (!user) return res.status(400).json({ success: false, message: `Insufficient wallet balance. You need ${formatN(plan.amount)}.` });

    const investment = await Investment.create({
      user: user._id, planName: plan.name, amount: plan.amount, dailyEarning: plan.dailyEarning
    });

    await Transaction.create({
      user: user._id, type: 'reinvestment', amount: plan.amount,
      status: 'completed', description: `Invested in ${plan.name} plan`
    });

    // Bug 2 Fix: Referral commissions - properly await each level
    if (user.referredBy) {
      try {
        const level1 = await User.findById(user.referredBy);
        if (level1 && !level1.isBanned) {
          const c1 = Math.floor(plan.amount * 0.15);
          await User.findByIdAndUpdate(level1._id, { $inc: { walletBalance: c1, totalReferralEarnings: c1 } });
          await Transaction.create({ user: level1._id, type: 'referral_bonus', amount: c1, status: 'completed', description: `Level 1 referral bonus from ${user.fullName}`, fromUser: user._id, referralLevel: 1 });

          if (level1.referredBy) {
            const level2 = await User.findById(level1.referredBy);
            if (level2 && !level2.isBanned) {
              const c2 = Math.floor(plan.amount * 0.03);
              await User.findByIdAndUpdate(level2._id, { $inc: { walletBalance: c2, totalReferralEarnings: c2 } });
              await Transaction.create({ user: level2._id, type: 'referral_bonus', amount: c2, status: 'completed', description: `Level 2 referral bonus from ${user.fullName}`, fromUser: user._id, referralLevel: 2 });

              if (level2.referredBy) {
                const level3 = await User.findById(level2.referredBy);
                if (level3 && !level3.isBanned) {
                  const c3 = Math.floor(plan.amount * 0.02);
                  await User.findByIdAndUpdate(level3._id, { $inc: { walletBalance: c3, totalReferralEarnings: c3 } });
                  await Transaction.create({ user: level3._id, type: 'referral_bonus', amount: c3, status: 'completed', description: `Level 3 referral bonus from ${user.fullName}`, fromUser: user._id, referralLevel: 3 });
                }
              }
            }
          }
        }
      } catch (refErr) { console.error('Referral commission error:', refErr.message); }
    }

    // Notify admin
    try {
      const emailData = emailTemplates.newInvestment(user, plan.name, plan.amount, plan.dailyEarning);
      sendAdminEmail(emailData.subject, emailData.html);
    } catch (e) { console.error('Email error:', e.message); }

    res.status(201).json({ success: true, message: `${plan.name} activated! Claim your first earnings in 24 hours.`, investment });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const formatN = (n) => '₦' + Number(n).toLocaleString('en-NG');

exports.getMyInvestments = async (req, res) => {
  try {
    const investments = await Investment.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, investments });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Bug 16 Fix: Atomic claim with lock to prevent race condition
exports.claimEarnings = async (req, res) => {
  try {
    const now = new Date();

    // Atomic lock - set isClaiming to true only if it's currently false
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, isClaiming: false },
      { $set: { isClaiming: true } },
      { new: true }
    );

    if (!user) return res.status(429).json({ success: false, message: 'Claim already in progress. Please wait.' });

    try {
      const activeInvestments = await Investment.find({ user: user._id, status: 'active' });
      if (!activeInvestments.length) {
        await User.findByIdAndUpdate(user._id, { isClaiming: false });
        return res.status(400).json({ success: false, message: 'No active investment plans to claim from.' });
      }

      // Bug 3 Fix: Single clean 24hr check using server time
      if (user.lastClaimDate) {
        const msSinceLast = now - new Date(user.lastClaimDate);
        const hoursSinceLast = msSinceLast / (1000 * 60 * 60);
        if (hoursSinceLast < 24) {
          const hoursLeft = Math.ceil(24 - hoursSinceLast);
          const minutesLeft = Math.ceil((24 * 60) - (msSinceLast / 60000));
          await User.findByIdAndUpdate(user._id, { isClaiming: false });
          return res.status(400).json({
            success: false,
            message: `Already claimed today. Next claim in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}.`,
            hoursLeft,
            minutesLeft,
            nextClaimTime: new Date(new Date(user.lastClaimDate).getTime() + 24 * 60 * 60 * 1000)
          });
        }
      }

      let totalClaim = 0;
      const claimedPlans = [];

      for (const inv of activeInvestments) {
        if (inv.daysCompleted >= inv.totalDays) {
          await Investment.findByIdAndUpdate(inv._id, { status: 'completed' });
          continue;
        }
        // Only claim if investment started more than 24hrs ago
        const hoursSinceStart = (now - new Date(inv.startDate)) / (1000 * 60 * 60);
        if (hoursSinceStart < 24) continue;

        totalClaim += inv.dailyEarning;
        const newDays = inv.daysCompleted + 1;
        const newStatus = newDays >= inv.totalDays ? 'completed' : 'active';
        await Investment.findByIdAndUpdate(inv._id, {
          daysCompleted: newDays,
          totalEarned: inv.totalEarned + inv.dailyEarning,
          lastCreditDate: now,
          status: newStatus
        });
        claimedPlans.push(inv.planName);
      }

      if (totalClaim === 0) {
        await User.findByIdAndUpdate(user._id, { isClaiming: false });
        return res.status(400).json({ success: false, message: 'Nothing to claim yet. Wait 24 hours after activating a plan.' });
      }

      // Update user balance atomically and release lock
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        { $inc: { walletBalance: totalClaim, totalEarnings: totalClaim }, lastClaimDate: now, isClaiming: false },
        { new: true }
      );

      await Transaction.create({
        user: user._id, type: 'earning', amount: totalClaim, status: 'completed',
        description: `Daily earnings claimed from: ${claimedPlans.join(', ')}`
      });

      res.json({
        success: true,
        message: `Successfully claimed ${formatN(totalClaim)}!`,
        amountClaimed: totalClaim,
        newBalance: updatedUser.walletBalance,
        nextClaimTime: new Date(now.getTime() + 24 * 60 * 60 * 1000)
      });

    } catch (innerErr) {
      // Always release lock on error
      await User.findByIdAndUpdate(req.user.id, { isClaiming: false });
      throw innerErr;
    }
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getClaimStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const activeInvestments = await Investment.find({ user: user._id, status: 'active' });
    const now = new Date();

    // If no active investments - return canClaim false immediately
    if (!activeInvestments.length) {
      return res.json({
        success: true, canClaim: false,
        hoursLeft: 0, minutesLeft: 0, totalClaimable: 0,
        lastClaimDate: user.lastClaimDate, nextClaimTime: null,
        activeInvestments: 0, totalEarnings: user.totalEarnings
      });
    }

    let canClaim = false;
    let hoursLeft = 0;
    let minutesLeft = 0;
    let nextClaimTime = null;
    let totalClaimable = 0;

    if (user.lastClaimDate) {
      const msSinceLast = now - new Date(user.lastClaimDate);
      const hoursSinceLast = msSinceLast / (1000 * 60 * 60);
      hoursLeft = Math.max(0, 24 - hoursSinceLast);
      minutesLeft = Math.max(0, Math.ceil((24 * 60) - (msSinceLast / 60000)));
      canClaim = hoursSinceLast >= 24;
      nextClaimTime = new Date(new Date(user.lastClaimDate).getTime() + 24 * 60 * 60 * 1000);
    } else {
      // Never claimed - can only claim if investment started > 24hrs ago
      canClaim = activeInvestments.some(inv => {
        const hrs = (now - new Date(inv.startDate)) / (1000 * 60 * 60);
        return hrs >= 24 && inv.daysCompleted < inv.totalDays;
      });
    }

    // Calculate claimable only from eligible investments
    for (const inv of activeInvestments) {
      if (inv.daysCompleted < inv.totalDays) {
        const hrs = (now - new Date(inv.startDate)) / (1000 * 60 * 60);
        if (hrs >= 24) totalClaimable += inv.dailyEarning;
      }
    }

    // If canClaim is true but nothing is actually claimable, set to false
    if (totalClaimable === 0) canClaim = false;

    res.json({
      success: true, canClaim,
      hoursLeft: Number(hoursLeft.toFixed(2)),
      minutesLeft,
      totalClaimable,
      lastClaimDate: user.lastClaimDate,
      nextClaimTime,
      activeInvestments: activeInvestments.length,
      totalEarnings: user.totalEarnings
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
