const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../middleware/asyncHandler');
const Forecast = require('../models/Forecast');
const cache = require('../config/cache');
const { runForecastForUser, runForecastForSingleProduct } = require('../services/forecastRunner');

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

  const limit = Number(process.env.FORECAST_MAX_PRODUCTS) || 100;
  const isLimited = result.totalEligibleProducts > limit;
  const message = isLimited
    ? `Generated forecasts for the top ${result.productsForecasted} products (by historical revenue) out of ${result.totalEligibleProducts} eligible products using ${model === 'prophet' ? 'Prophet' : 'Random Forest'}. Other products will be forecasted on-demand.`
    : `Generated forecasts for all ${result.productsForecasted} product(s) using ${model === 'prophet' ? 'Prophet' : 'Random Forest'}.`;

  res.json({
    message,
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
