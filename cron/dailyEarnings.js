const cron = require('node-cron');
const Investment = require('../models/Investment');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

const startDailyEarningsCron = () => {
  cron.schedule('0 10 * * *', async () => {
    console.log('Running daily earnings cron...');
    try {
      const activeInvestments = await Investment.find({ status: 'active' });
      let processed = 0;
      for (const investment of activeInvestments) {
        try {
          const today = new Date(); today.setHours(0,0,0,0);
          if (investment.lastCreditDate) {
            const last = new Date(investment.lastCreditDate); last.setHours(0,0,0,0);
            if (last >= today) continue;
          }
          investment.daysCompleted += 1;
          investment.totalEarned += investment.dailyEarning;
          investment.lastCreditDate = new Date();
          if (investment.daysCompleted >= investment.totalDays) investment.status = 'completed';
          await investment.save();
          const user = await User.findById(investment.user);
          if (user) {
            user.walletBalance += investment.dailyEarning;
            user.totalEarnings += investment.dailyEarning;
            await user.save();
            await Transaction.create({ user: user._id, type: 'earning', amount: investment.dailyEarning, status: 'completed', description: `Daily earning from ${investment.planName} plan (Day ${investment.daysCompleted}/${investment.totalDays})` });
          }
          processed++;
        } catch (innerErr) {
          console.error(`Cron error on investment ${investment._id}:`, innerErr.message);
        }
      }
      console.log(`Processed ${processed}/${activeInvestments.length} investments.`);
    } catch (err) { console.error('Cron error:', err.message); }
  }, { timezone: 'Africa/Lagos' });
};

module.exports = startDailyEarningsCron;
