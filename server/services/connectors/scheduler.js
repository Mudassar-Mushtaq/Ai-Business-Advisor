const cron = require('node-cron');
const Connector = require('../../models/Connector');
const { runSync } = require('./syncRunner');

let started = false;

// Tick every 5 minutes. For each connected connector, sync if it's been longer
// than its `intervalMinutes` since the last successful sync.
function start() {
  if (started) return;
  started = true;

  cron.schedule('*/5 * * * *', async () => {
    try {
      const connectors = await Connector.find({ status: { $in: ['connected', 'error'] } });
      const now = Date.now();

      for (const c of connectors) {
        if (!c.config?.sheetId) continue; // not yet configured
        const intervalMs = (c.intervalMinutes || 15) * 60 * 1000;
        const lastSyncMs = c.lastSyncAt ? c.lastSyncAt.getTime() : 0;
        if (now - lastSyncMs < intervalMs) continue;

        try {
          const result = await runSync(c._id);
          console.log(
            `[connector] synced ${c.provider} for user ${c.userId}: ` +
            `${result.rowsImported} rows (saw ${result.totalRowsSeen})`
          );
        } catch (err) {
          console.error(`[connector] sync failed for ${c._id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[connector scheduler] tick failed:', err.message);
    }
  });

  console.log('🔄 Connector scheduler started (5-min tick)');
}

module.exports = { start };
