const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../middleware/asyncHandler');
const Forecast = require('../models/Forecast');
const cache = require('../config/cache');
const { runForecastForUser } = require('../services/forecastRunner');

// POST /api/forecast/generate
router.post('/generate', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const forecastDays = Math.max(1, Math.min(180, Number(req.body?.forecastDays) || 30));
  const requestedModel = String(req.body?.model || 'rf').toLowerCase();
  const model = ['rf', 'prophet'].includes(requestedModel) ? requestedModel : 'rf';

  const result = await runForecastForUser(userId, { forecastDays, trigger: 'manual', model });

  if (result.skipped) {
    const reason = result.reason === 'not_enough_data'
      ? 'Need at least 10 sales records to generate forecasts.'
      : 'No products have enough data for forecasting.';
    return res.status(400).json({ error: reason });
  }

  res.json({
    message: `Generated forecasts for ${result.productsForecasted} product(s) using ${model === 'prophet' ? 'Prophet' : 'Random Forest'}.`,
    forecasts: result.forecasts,
    model: result.model,
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
  const forecast = await cache.wrap(key, 600, () =>
    Forecast.findOne({ userId: req.user._id, product: req.params.product }).lean()
  );
  if (!forecast) return res.status(404).json({ error: 'No forecast found for this product.' });
  res.json(forecast);
}));

module.exports = router;
