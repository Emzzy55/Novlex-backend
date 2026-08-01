const cron = require('node-cron');
const Investment = require('../models/Investment');

// This cron now only marks investments as completed after 30 days
// Earnings are credited manually via the /investments/claim endpoint
const startDailyEarningsCron = () => {
  // Run every day at midnight to mark completed investments
  cron.schedule('0 0 * * *', async () => {
    console.log('Running investment completion check...');
    try {
      const now = new Date();
      const investments = await Investment.find({ status: 'active' });
      let completed = 0;
      for (const inv of investments) {
        if (inv.daysCompleted >= inv.totalDays) {
          inv.status = 'completed';
          await inv.save();
          completed++;
        }
      }
      console.log(`Completed ${completed} investments.`);
    } catch (err) { console.error('Cron error:', err.message); }
  }, { timezone: 'Africa/Lagos' });
};

module.exports = startDailyEarningsCron;
