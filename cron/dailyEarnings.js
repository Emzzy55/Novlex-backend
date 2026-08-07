const cron = require('node-cron');
const Investment = require('../models/Investment');

// Bug 8 Fix: Cron ONLY marks investments as completed after 30 days
// Earnings are NEVER auto-credited here - users must manually claim via /investments/claim
const startDailyEarningsCron = () => {
  // Run every day at midnight Lagos time
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Running investment completion check...');
    try {
      const now = new Date();
      // Only mark as completed - never touch walletBalance
      const result = await Investment.updateMany(
        { status: 'active', daysCompleted: { $gte: 30 } },
        { $set: { status: 'completed' } }
      );
      console.log(`[CRON] Marked ${result.modifiedCount} investments as completed.`);
    } catch (err) {
      console.error('[CRON] Error:', err.message);
    }
  }, { timezone: 'Africa/Lagos' });

  console.log('[CRON] Daily investment completion checker started.');
};

module.exports = startDailyEarningsCron;
