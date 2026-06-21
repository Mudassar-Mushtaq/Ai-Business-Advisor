const Forecast = require('../models/Forecast');
const SalesData = require('../models/SalesData');
const cache = require('../config/cache');
const { callForecastService } = require('./forecastClient');
const { runAlertPipeline } = require('./alertService');
const { recomputeForUser: recomputeReorderLevels } = require('./reorderRecommender');

const FORECAST_CONCURRENCY = Number(process.env.FORECAST_CONCURRENCY) || 4;

const invalidateForUser = (uid) => Promise.all([
  cache.delPattern(`forecast:${uid}:*`),
  cache.delPattern(`sales:${uid}:*`),
  cache.delPattern(`inventory:${uid}:*`),
]);

// Statistical fallback when the ML service is unreachable.
function statisticalFallback(rows, forecastDays) {
  const avg = rows.reduce((s, r) => s + r.quantity, 0) / rows.length;
  const avgRev = rows.reduce((s, r) => s + r.revenue, 0) / rows.length;
  const daily = [];
  for (let i = 1; i <= forecastDays; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    daily.push({
      date: d.toISOString().split('T')[0],
      quantity: Math.round(avg),
      revenue: Math.round(avgRev),
    });
  }
  return {
    forecastedSales: Math.round(avg * forecastDays),
    forecastedRevenue: Math.round(avgRev * forecastDays),
    confidence: 60,
    modelAccuracy: 60,
    dailyBreakdown: daily,
  };
}

async function processProduct(userId, product, rows, forecastDays, period, model) {
  let prediction;
  try {
    prediction = await callForecastService(product, rows, forecastDays, model);
  } catch (mlErr) {
    console.warn(`ML service unavailable for ${product}, using statistical fallback:`, mlErr.message);
    prediction = statisticalFallback(rows, forecastDays);
    prediction.model = 'fallback';
  }

  return Forecast.findOneAndUpdate(
    { userId, product },
    {
      userId,
      product,
      period,
      forecastedSales: prediction.forecastedSales,
      forecastedRevenue: prediction.forecastedRevenue,
      confidence: prediction.confidence || 75,
      dailyBreakdown: prediction.dailyBreakdown || [],
      modelAccuracy: prediction.modelAccuracy || 75,
      model: prediction.model || model || 'rf',
      generatedAt: new Date(),
    },
    { upsert: true, new: true }
  );
}

// Run jobs with bounded concurrency — keeps the ML service busy without
// stampeding it (each RF fit already pins all CPU cores).
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function pull() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, pull);
  await Promise.all(runners);
  return results;
}

/**
 * Run the forecast pipeline for a user. Used by both the manual route and the auto scheduler.
 * @param {ObjectId} userId
 * @param {object}   opts
 * @param {number}  [opts.forecastDays=30]
 * @param {string}  [opts.trigger='manual']
 * @param {string}  [opts.model='rf']        'rf' | 'prophet'
 * @returns {Promise<{ forecasts: Array, productsForecasted: number, skipped: boolean, reason?: string, model: string }>}
 */
async function runForecastForUser(userId, opts = {}) {
  const forecastDays = Number.isFinite(opts.forecastDays) ? opts.forecastDays : 30;
  const period = `${forecastDays}d`;
  const model = ['rf', 'prophet'].includes(opts.model) ? opts.model : 'rf';

  const salesData = await SalesData.find({ userId })
    .sort({ date: 1 })
    .lean();

  if (salesData.length < 10) {
    return { forecasts: [], productsForecasted: 0, skipped: true, reason: 'not_enough_data' };
  }

  const byProduct = {};
  salesData.forEach((row) => {
    if (!byProduct[row.product]) byProduct[row.product] = [];
    byProduct[row.product].push({
      date: row.date.toISOString().split('T')[0],
      quantity: row.quantity,
      revenue: row.revenue,
    });
  });

  const products = Object.entries(byProduct).filter(([, rows]) => rows.length >= 5);
  if (!products.length) {
    return { forecasts: [], productsForecasted: 0, skipped: true, reason: 'no_eligible_products' };
  }

  // Prophet fits are CPU-bound and single-threaded per model; running many
  // in parallel doesn't help (and can starve cmdstanpy). Cap concurrency at 2
  // for Prophet but keep the default for RF (which already uses all cores).
  const concurrency = model === 'prophet' ? Math.min(2, FORECAST_CONCURRENCY) : FORECAST_CONCURRENCY;

  const results = await runWithConcurrency(
    products,
    concurrency,
    ([product, rows]) => processProduct(userId, product, rows, forecastDays, period, model),
  );

  // Refresh auto-mode reorder thresholds before alerts run, so the alert
  // pipeline reads the up-to-date reorderLevel for each product.
  try {
    await recomputeReorderLevels(userId);
  } catch (err) {
    console.warn(`Reorder-level recompute failed for user ${userId}:`, err.message);
  }

  await runAlertPipeline(userId);
  await invalidateForUser(userId);

  return { forecasts: results, productsForecasted: results.length, skipped: false, model };
}

module.exports = { runForecastForUser };
