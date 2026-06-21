const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../middleware/asyncHandler');
const AutoAnalysisConfig = require('../models/AutoAnalysisConfig');
const Connector = require('../models/Connector');
const SalesData = require('../models/SalesData');
const { runAutoForUser, computeNextRun } = require('../services/forecastScheduler');

// Lazy-create the per-user config so the UI always has something to render.
async function getOrCreateConfig(userId) {
  let cfg = await AutoAnalysisConfig.findOne({ userId });
  if (!cfg) cfg = await AutoAnalysisConfig.create({ userId });
  return cfg;
}

// Shape sent to the client. Hides nothing sensitive — just trims the document.
function serializeConfig(cfg) {
  return {
    setupComplete:   cfg.setupComplete,
    mode:            cfg.mode,
    enabled:         cfg.enabled,
    intervalHours:   cfg.intervalHours,
    forecastDays:    cfg.forecastDays,
    minNewRowsToRun: cfg.minNewRowsToRun,
    lastRunAt:       cfg.lastRunAt,
    nextRunAt:       cfg.nextRunAt,
    lastStatus:      cfg.lastStatus,
    lastError:       cfg.lastError,
    lastRowCount:    cfg.lastRowCount,
    runHistory:      cfg.runHistory.slice(0, 10),
    updatedAt:       cfg.updatedAt,
  };
}

// GET /api/auto-analysis — current user's config + lightweight connector status
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const [cfg, connectors, salesCount] = await Promise.all([
    getOrCreateConfig(userId),
    Connector.find({ userId }).lean({ virtuals: false }),
    SalesData.countDocuments({ userId }),
  ]);

  connectors.forEach((c) => { delete c.credentialsEnc; });

  res.json({
    config: serializeConfig(cfg),
    connectors: connectors.map((c) => ({
      _id:            c._id,
      provider:       c.provider,
      status:         c.status,
      label:          c.label,
      lastSyncAt:     c.lastSyncAt,
      lastSyncRows:   c.lastSyncRows,
      syncCount:      c.syncCount,
      intervalMinutes:c.intervalMinutes,
      lastError:      c.lastError,
      configured:     Boolean(c.config?.sheetId),
      sheetId:        c.config?.sheetId || null,
      range:          c.config?.range || null,
    })),
    salesRowCount: salesCount,
  });
}));

// PUT /api/auto-analysis — update mode / cadence / horizon
router.put('/', requireAuth, asyncHandler(async (req, res) => {
  const cfg = await getOrCreateConfig(req.user._id);
  const { mode, enabled, intervalHours, forecastDays, minNewRowsToRun } = req.body || {};

  if (mode !== undefined) {
    if (!['manual', 'auto'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "manual" or "auto"' });
    }
    cfg.mode = mode;
  }
  if (enabled !== undefined) cfg.enabled = Boolean(enabled);
  if (intervalHours !== undefined) {
    const v = Number(intervalHours);
    if (!Number.isFinite(v) || v < 1 || v > 168) {
      return res.status(400).json({ error: 'intervalHours must be between 1 and 168' });
    }
    cfg.intervalHours = v;
  }
  if (forecastDays !== undefined) {
    const v = Number(forecastDays);
    if (!Number.isFinite(v) || v < 1 || v > 180) {
      return res.status(400).json({ error: 'forecastDays must be between 1 and 180' });
    }
    cfg.forecastDays = v;
  }
  if (minNewRowsToRun !== undefined) {
    const v = Number(minNewRowsToRun);
    if (!Number.isFinite(v) || v < 0) {
      return res.status(400).json({ error: 'minNewRowsToRun must be >= 0' });
    }
    cfg.minNewRowsToRun = v;
  }

  cfg.setupComplete = true;

  // Recompute nextRunAt whenever the cadence or enabled flag changes.
  if (cfg.mode === 'auto' && cfg.enabled) {
    cfg.nextRunAt = computeNextRun(cfg.intervalHours, cfg.lastRunAt || new Date());
  } else {
    cfg.nextRunAt = null;
  }

  await cfg.save();
  res.json({ config: serializeConfig(cfg) });
}));

// POST /api/auto-analysis/run-now — trigger an auto run immediately (bypasses minNewRowsToRun guard)
router.post('/run-now', requireAuth, asyncHandler(async (req, res) => {
  const cfg = await getOrCreateConfig(req.user._id);
  const result = await runAutoForUser(cfg, { trigger: 'manual' });
  res.json({ result, config: serializeConfig(cfg) });
}));

module.exports = router;
