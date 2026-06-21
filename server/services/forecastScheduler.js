const cron = require('node-cron');
const AutoAnalysisConfig = require('../models/AutoAnalysisConfig');
const SalesData = require('../models/SalesData');
const { runForecastForUser } = require('./forecastRunner');

let started = false;

function computeNextRun(intervalHours, from = new Date()) {
  const ms = intervalHours * 60 * 60 * 1000;
  return new Date(from.getTime() + ms);
}

// Run one user's auto-analysis tick. Exported so the manual "run now" route can reuse it.
async function runAutoForUser(config, { trigger = 'auto' } = {}) {
  const userId = config.userId;
  const startedAt = Date.now();

  // Count current rows so we can compare against last run.
  const currentRowCount = await SalesData.countDocuments({ userId });
  const newRows = Math.max(0, currentRowCount - (config.lastRowCount || 0));

  // If user requires N+ new rows and we don't have them, skip cleanly.
  if (trigger === 'auto' && config.minNewRowsToRun > 0 && newRows < config.minNewRowsToRun) {
    config.lastRunAt = new Date();
    config.nextRunAt = computeNextRun(config.intervalHours);
    config.lastStatus = 'skipped';
    config.lastError = null;
    config.recordRun({
      ranAt: new Date(),
      trigger,
      status: 'skipped',
      reason: 'no_new_data',
      productsForecasted: 0,
      durationMs: Date.now() - startedAt,
      forecastDays: config.forecastDays,
      newRowsSeen: newRows,
    });
    await config.save();
    return { status: 'skipped', reason: 'no_new_data', newRows };
  }

  try {
    const result = await runForecastForUser(userId, {
      forecastDays: config.forecastDays,
      trigger,
    });

    config.lastRunAt = new Date();
    config.nextRunAt = computeNextRun(config.intervalHours);
    config.lastRowCount = currentRowCount;

    if (result.skipped) {
      config.lastStatus = 'skipped';
      config.lastError = result.reason || null;
      config.recordRun({
        ranAt: new Date(),
        trigger,
        status: 'skipped',
        reason: result.reason || 'unknown',
        productsForecasted: 0,
        durationMs: Date.now() - startedAt,
        forecastDays: config.forecastDays,
        newRowsSeen: newRows,
      });
    } else {
      config.lastStatus = 'success';
      config.lastError = null;
      config.recordRun({
        ranAt: new Date(),
        trigger,
        status: 'success',
        productsForecasted: result.productsForecasted,
        durationMs: Date.now() - startedAt,
        forecastDays: config.forecastDays,
        newRowsSeen: newRows,
      });
    }

    await config.save();
    return { status: config.lastStatus, productsForecasted: result.productsForecasted || 0, newRows };
  } catch (err) {
    config.lastRunAt = new Date();
    config.nextRunAt = computeNextRun(config.intervalHours);
    config.lastStatus = 'error';
    config.lastError = (err.message || 'Unknown forecast error').slice(0, 500);
    config.recordRun({
      ranAt: new Date(),
      trigger,
      status: 'error',
      reason: config.lastError,
      productsForecasted: 0,
      durationMs: Date.now() - startedAt,
      forecastDays: config.forecastDays,
      newRowsSeen: newRows,
    });
    await config.save();
    throw err;
  }
}

// Tick every minute. For each enabled auto-mode config that's due, run a forecast.
function start() {
  if (started) return;
  started = true;

  cron.schedule('* * * * *', async () => {
    try {
      const due = await AutoAnalysisConfig.find({
        mode: 'auto',
        enabled: true,
        $or: [
          { nextRunAt: null },
          { nextRunAt: { $lte: new Date() } },
        ],
      });

      for (const config of due) {
        try {
          const r = await runAutoForUser(config);
          console.log(
            `[auto-forecast] user=${config.userId} status=${r.status} ` +
            `products=${r.productsForecasted || 0} newRows=${r.newRows}`
          );
        } catch (err) {
          console.error(`[auto-forecast] user=${config.userId} failed:`, err.message);
        }
      }
    } catch (err) {
      console.error('[auto-forecast scheduler] tick failed:', err.message);
    }
  });

  console.log('🤖 Auto-forecast scheduler started (1-min tick)');
}

module.exports = { start, runAutoForUser, computeNextRun };
