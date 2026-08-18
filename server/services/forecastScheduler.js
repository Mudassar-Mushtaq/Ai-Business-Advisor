const cron = require('node-cron');
const AutoAnalysisConfig = require('../models/AutoAnalysisConfig');
const SalesData = require('../models/SalesData');
const { runForecastForUser } = require('./forecastRunner');

let started = false;
const activeJobs = new Set(); // In-memory lock to prevent concurrent runs for the same user

function computeNextRun(intervalHours, from = new Date()) {
  const ms = intervalHours * 60 * 60 * 1000;
  return new Date(from.getTime() + ms);
}

// Run one user's auto-analysis tick. Exported so the manual "run now" route can reuse it.
async function runAutoForUser(config, { trigger = 'auto' } = {}) {
  const userId = config.userId.toString();

  // Prevent duplicate execution if a job for this user is already in progress
  if (activeJobs.has(userId)) {
    return { status: 'skipped', reason: 'already_running', newRows: 0 };
  }

  activeJobs.add(userId);

  try {
    const startedAt = Date.now();

    // Count current rows so we can compare against last run.
    const currentRowCount = await SalesData.countDocuments({ userId: config.userId });
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

    const result = await runForecastForUser(config.userId, {
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
    try {
      await config.save();
    } catch (saveErr) {
      console.error('Failed to save config error status:', saveErr.message);
    }
    throw err;
  } finally {
    activeJobs.delete(userId);
  }
}

// Tick every 5 minutes. For each enabled auto-mode config that's due, run a forecast.
function start() {
  if (started) return;
  started = true;

  cron.schedule('*/5 * * * *', async () => {
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

  console.log('🤖 Auto-forecast scheduler started (5-min tick)');
}

module.exports = { start, runAutoForUser, computeNextRun };
