const cron = require('node-cron');
const { syncAllWebsites } = require('../services/snapshotService');

let started = false;

const startScheduler = () => {
  if (started) return;
  started = true;

  // ── Daily at 03:00 UTC — sync analytics + search console for all websites
  cron.schedule('0 3 * * *', async () => {
    console.log('[Scheduler] Starting daily sync...');
    try {
      const result = await syncAllWebsites();
      console.log(`[Scheduler] Daily sync complete: ${JSON.stringify(result)}`);
    } catch (err) {
      console.error('[Scheduler] Daily sync error:', err.message);
    }
  }, { timezone: 'UTC' });

  // ── Hourly — retry any websites stuck in 'syncing' or 'error' state < 1h
  cron.schedule('30 * * * *', async () => {
    const Website = require('../models/Website');
    const stuckCutoff = new Date(Date.now() - 60 * 60 * 1000);
    const stuck = await Website.find({
      syncStatus: { $in: ['syncing', 'error'] },
      updatedAt:  { $lt: stuckCutoff },
    }).limit(10);

    if (stuck.length > 0) {
      console.log(`[Scheduler] Retrying ${stuck.length} stuck websites`);
      const { syncWebsite } = require('../services/snapshotService');
      for (const w of stuck) {
        syncWebsite(w._id).catch(() => {});
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }, { timezone: 'UTC' });

  console.log('[Scheduler] Jobs registered (daily 03:00 UTC + hourly retry)');
};

module.exports = { startScheduler };
