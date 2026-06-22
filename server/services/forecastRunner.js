const Forecast = require('../models/Forecast');
const SalesData = require('../models/SalesData');
const cache = require('../config/cache');
const { callForecastService } = require('./forecastClient');
const { runAlertPipeline } = require('./alertService');
const { recomputeForUser: recomputeReorderLevels } = require('./reorderRecommender');

const FORECAST_CONCURRENCY = Number(process.env.FORECAST_CONCURRENCY) || 1;

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

  // Limit history to the last 730 days of records (relative to each product's own latest sale date).
  // This keeps ML training fast, avoids CPU starvation, and focuses on recent sales trends.
  Object.keys(byProduct).forEach((product) => {
    const rows = byProduct[product];
    if (rows.length === 0) return;
    const lastDateStr = rows[rows.length - 1].date;
    const lastDate = new Date(lastDateStr);
    const cutoff = new Date(lastDate.getTime() - 730 * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    byProduct[product] = rows.filter(r => r.date >= cutoffStr);
  });

  // Calculate total revenue for each product to identify top products
  const productInfo = Object.entries(byProduct).map(([product, rows]) => {
    const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
    return { product, rows, totalRevenue };
  });

  // Filter for products with at least 5 sales records in the last 730 days
  const eligibleProducts = productInfo.filter(p => p.rows.length >= 5);

  if (!eligibleProducts.length) {
    return { forecasts: [], productsForecasted: 0, skipped: true, reason: 'no_eligible_products' };
  }

  // Sort by historical revenue descending so we forecast the most valuable products first
  eligibleProducts.sort((a, b) => b.totalRevenue - a.totalRevenue);

  // Limit bulk forecasts to avoid CPU starvation and browser/server timeouts.
  const limit = Number(process.env.FORECAST_MAX_PRODUCTS) || 100;
  const topProducts = eligibleProducts.slice(0, limit);
  const productsToForecast = topProducts.map(p => [p.product, p.rows]);

  // Flask runs single-process with GIL — concurrent RF/Prophet fits just queue
  // up and cause timeouts. Run sequentially for reliability.
  const concurrency = 1;

  const results = await runWithConcurrency(
    productsToForecast,
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

  return {
    forecasts: results,
    productsForecasted: results.length,
    totalEligibleProducts: eligibleProducts.length,
    skipped: false,
    model,
  };
}

/**
 * Generate a forecast for a single product on demand.
 * This is used for long-tail products that were excluded from the bulk forecast limit.
 */
async function runForecastForSingleProduct(userId, product, opts = {}) {
  const forecastDays = Number.isFinite(opts.forecastDays) ? opts.forecastDays : 30;
  const period = `${forecastDays}d`;
  const model = ['rf', 'prophet'].includes(opts.model) ? opts.model : 'rf';

  const salesData = await SalesData.find({ userId, product })
    .sort({ date: 1 })
    .lean();

  if (salesData.length < 5) {
    return { skipped: true, reason: 'not_enough_data' };
  }

  let rows = salesData.map((row) => ({
    date: row.date.toISOString().split('T')[0],
    quantity: row.quantity,
    revenue: row.revenue,
  }));

  // Limit to last 730 days of history to keep ML training fast
  if (rows.length > 0) {
    const lastDate = new Date(rows[rows.length - 1].date);
    const cutoff = new Date(lastDate.getTime() - 730 * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    rows = rows.filter(r => r.date >= cutoffStr);
  }

  if (rows.length < 5) {
    return { skipped: true, reason: 'not_enough_data' };
  }

  const result = await processProduct(userId, product, rows, forecastDays, period, model);
  await invalidateForUser(userId);
  return result;
}

module.exports = { runForecastForUser, runForecastForSingleProduct };
