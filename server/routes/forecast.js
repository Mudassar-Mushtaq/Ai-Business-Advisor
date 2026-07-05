const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../middleware/asyncHandler');
const Forecast = require('../models/Forecast');
const SalesData = require('../models/SalesData');
const cache = require('../config/cache');
const forecastTracker = require('../services/forecastTracker');
const { runForecastForUser, runForecastForSingleProduct, triggerForecastGeneration } = require('../services/forecastRunner');

// GET /api/forecast/status
router.get('/status', requireAuth, (req, res) => {
  const job = forecastTracker.getJob(req.user._id.toString());
  res.json(job);
});

// POST /api/forecast/reset-status
router.post('/reset-status', requireAuth, (req, res) => {
  forecastTracker.clearJob(req.user._id.toString());
  res.json({ status: 'idle' });
});

// POST /api/forecast/generate
router.post('/generate', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const forecastDays = Math.max(1, Math.min(180, Number(req.body?.forecastDays) || 30));
  const requestedModel = String(req.body?.model || 'rf').toLowerCase();
  const model = ['rf', 'prophet'].includes(requestedModel) ? requestedModel : 'rf';

  const result = await triggerForecastGeneration(userId, { forecastDays, model, trigger: 'manual' });

  if (result.status === 'already_running') {
    return res.status(400).json({ error: 'A forecast generation is already in progress.' });
  }
  if (result.status === 'skipped') {
    return res.status(400).json({ error: result.reason });
  }

  res.json({
    status: 'started',
    message: 'Forecast generation started in the background.'
  });
}));

// GET /api/forecast — cached 10 min
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const key = `forecast:${req.user._id}:list`;
  const forecasts = await cache.wrap(key, 600, () =>
    Forecast.find({ userId: req.user._id }).sort({ forecastedRevenue: -1 }).lean()
  );
  res.json(forecasts);
}));

// GET /api/forecast/product/:product — cached 10 min
router.get('/product/:product', requireAuth, asyncHandler(async (req, res) => {
  const key = `forecast:${req.user._id}:product:${req.params.product}`;
  let forecast = await cache.wrap(key, 600, async () => {
    let doc = await Forecast.findOne({ userId: req.user._id, product: req.params.product }).lean();
    if (!doc) {
      // Try to generate on the fly
      try {
        const generated = await runForecastForSingleProduct(req.user._id, req.params.product, {
          forecastDays: 30,
          model: 'rf'
        });
        if (generated && !generated.skipped) {
          doc = generated.toObject ? generated.toObject() : generated;
        }
      } catch (err) {
        console.error(`On-demand forecast failed for product ${req.params.product}:`, err.message);
      }
    }
    return doc;
  });

  if (!forecast) return res.status(404).json({ error: 'No forecast found for this product.' });
  res.json(forecast);
}));

module.exports = router;
