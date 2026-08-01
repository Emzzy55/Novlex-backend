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
  const day = now.getDay(); // 0=Sun, 6=Sat
  const hour = now.getHours();
  const isWeekday = day >= 1 && day <= 5;
  const isInHours = hour >= 8 && hour < 18;
  return isWeekday && isInHours;
};

exports.getPlans = (req, res) => res.json({ success: true, plans: PLANS });

exports.invest = async (req, res) => {
  try {
    const { planName, fromWallet } = req.body;
    const plan = PLANS.find(p => p.name === planName);
    if (!plan) return res.status(400).json({ success: false, message: 'Invalid plan selected.' });

    if (!isOperatingHours()) {
      return res.status(400).json({ success: false, message: 'Investments are only accepted Monday–Friday, 8:00 AM – 6:00 PM.' });
    }

    const user = await User.findById(req.user.id);
    if (user.walletBalance < plan.amount) {
      return res.status(400).json({ success: false, message: `Insufficient balance. You need ${plan.amount.toLocaleString()} but have ${user.walletBalance.toLocaleString()}.` });
    }

    user.walletBalance -= plan.amount;
    user.totalDeposited += plan.amount;
    await user.save();

    if (fromWallet) {
      await Transaction.create({ user: user._id, type: 'reinvestment', amount: plan.amount, status: 'completed', description: `Invested in ${plan.name} plan (from wallet)` });
    }

    const investment = await Investment.create({
      user: user._id, planName: plan.name, amount: plan.amount, dailyEarning: plan.dailyEarning
    });

    // Referral commissions
    if (user.referredBy) {
      const level1 = await User.findById(user.referredBy);
      if (level1) {
        const c1 = plan.amount * 0.15;
        level1.walletBalance += c1; level1.totalReferralEarnings += c1;
        await level1.save();
        await Transaction.create({ user: level1._id, type: 'referral_bonus', amount: c1, status: 'completed', description: `Level 1 referral bonus from ${user.fullName}`, fromUser: user._id, referralLevel: 1 });
        if (level1.referredBy) {
          const level2 = await User.findById(level1.referredBy);
          if (level2) {
            const c2 = plan.amount * 0.03;
            level2.walletBalance += c2; level2.totalReferralEarnings += c2;
            await level2.save();
            await Transaction.create({ user: level2._id, type: 'referral_bonus', amount: c2, status: 'completed', description: `Level 2 referral bonus from ${user.fullName}`, fromUser: user._id, referralLevel: 2 });
            if (level2.referredBy) {
              const level3 = await User.findById(level2.referredBy);
              if (level3) {
                const c3 = plan.amount * 0.02;
                level3.walletBalance += c3; level3.totalReferralEarnings += c3;
                await level3.save();
                await Transaction.create({ user: level3._id, type: 'referral_bonus', amount: c3, status: 'completed', description: `Level 3 referral bonus from ${user.fullName}`, fromUser: user._id, referralLevel: 3 });
              }
            }
          }
        }
      }
    }

    const emailData = emailTemplates.newInvestment(user, plan.name, plan.amount, plan.dailyEarning);
    sendAdminEmail(emailData.subject, emailData.html);

    res.status(201).json({ success: true, message: `${plan.name} plan activated! You can claim your first earnings in 24 hours.`, investment });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getMyInvestments = async (req, res) => {
  try {
    const investments = await Investment.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, investments });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Manual daily claim
exports.claimEarnings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const now = new Date();

    // Check if user has active investments
    const activeInvestments = await Investment.find({ user: user._id, status: 'active' });
    if (!activeInvestments.length) {
      return res.status(400).json({ success: false, message: 'You have no active investment plans to claim from.' });
    }

    // Check 24hr cooldown
    if (user.lastClaimDate) {
      const hoursSinceLast = (now - new Date(user.lastClaimDate)) / (1000 * 60 * 60);
      if (hoursSinceLast < 24) {
        const hoursLeft = (24 - hoursSinceLast).toFixed(1);
        return res.status(400).json({ success: false, message: `You already claimed today. Next claim available in ${hoursLeft} hours.`, hoursLeft: Number(hoursLeft) });
      }
    }

    // Calculate claimable amount from all active investments
    let totalClaim = 0;
    const claimedPlans = [];

    for (const inv of activeInvestments) {
      // Check if investment started more than 24hrs ago
      const hoursSinceStart = (now - new Date(inv.startDate)) / (1000 * 60 * 60);
      if (hoursSinceStart < 24) continue;

      // Check days not exceeded
      if (inv.daysCompleted >= inv.totalDays) {
        inv.status = 'completed';
        await inv.save();
        continue;
      }

      totalClaim += inv.dailyEarning;
      inv.daysCompleted += 1;
      inv.totalEarned += inv.dailyEarning;
      inv.lastCreditDate = now;
      if (inv.daysCompleted >= inv.totalDays) inv.status = 'completed';
      await inv.save();
      claimedPlans.push(inv.planName);
    }

    if (totalClaim === 0) {
      return res.status(400).json({ success: false, message: 'Nothing to claim yet. Wait 24 hours after activating a plan.' });
    }

    user.walletBalance += totalClaim;
    user.totalEarnings += totalClaim;
    user.lastClaimDate = now;
    await user.save();

    await Transaction.create({
      user: user._id, type: 'earning', amount: totalClaim, status: 'completed',
      description: `Daily earnings claimed from: ${claimedPlans.join(', ')}`
    });

    res.json({
      success: true,
      message: `Successfully claimed ₦${totalClaim.toLocaleString()}!`,
      amountClaimed: totalClaim,
      newBalance: user.walletBalance,
      nextClaimIn: 24
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getClaimStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const activeInvestments = await Investment.find({ user: user._id, status: 'active' });
    const now = new Date();

    let canClaim = false;
    let hoursLeft = 0;
    let totalClaimable = 0;
    let nextClaimTime = null;

    if (user.lastClaimDate) {
      const hoursSinceLast = (now - new Date(user.lastClaimDate)) / (1000 * 60 * 60);
      hoursLeft = Math.max(0, 24 - hoursSinceLast);
      canClaim = hoursSinceLast >= 24;
      nextClaimTime = new Date(new Date(user.lastClaimDate).getTime() + 24 * 60 * 60 * 1000);
    } else {
      canClaim = activeInvestments.some(inv => {
        const hrs = (now - new Date(inv.startDate)) / (1000 * 60 * 60);
        return hrs >= 24;
      });
    }

    for (const inv of activeInvestments) {
      if (inv.daysCompleted < inv.totalDays) totalClaimable += inv.dailyEarning;
    }

    res.json({
      success: true,
      canClaim,
      hoursLeft: Number(hoursLeft.toFixed(2)),
      totalClaimable,
      lastClaimDate: user.lastClaimDate,
      nextClaimTime,
      activeInvestments: activeInvestments.length,
      totalEarnings: user.totalEarnings
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
