const Forecast = require('../models/Forecast');
const SalesData = require('../models/SalesData');
const cache = require('../config/cache');
const { callForecastService } = require('./forecastClient');
const { runAlertPipeline } = require('./alertService');
const { recomputeForUser: recomputeReorderLevels } = require('./reorderRecommender');
const forecastTracker = require('./forecastTracker');

const FORECAST_CONCURRENCY = Number(process.env.FORECAST_CONCURRENCY) || 1;

const invalidateForUser = (uid) => Promise.all([
  cache.delPattern(`forecast:${uid}:*`),
  cache.delPattern(`sales:${uid}:*`),
  cache.delPattern(`inventory:${uid}:*`),
]);

// ── Outlier removal using IQR (Interquartile Range) ──────────────────
// Clips extreme quantity/revenue values to Q1 - 1.5·IQR .. Q3 + 1.5·IQR.
// This prevents random bulk-order spikes from inflating the forecast.
function removeOutliers(rows) {
  if (rows.length < 4) return rows;

  const quantities = rows.map(r => r.quantity).sort((a, b) => a - b);
  const revenues   = rows.map(r => r.revenue).sort((a, b) => a - b);

  function iqrBounds(sorted) {
    const n  = sorted.length;
    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const iqr = q3 - q1;
    return { lo: q1 - 1.5 * iqr, hi: q3 + 1.5 * iqr };
  }

  const qBounds = iqrBounds(quantities);
  const rBounds = iqrBounds(revenues);

  return rows.map(r => ({
    ...r,
    quantity: Math.max(0, Math.min(r.quantity, qBounds.hi)),
    revenue:  Math.max(0, Math.min(r.revenue,  rBounds.hi)),
  }));
}

// ── Tier 1: Exponential Moving Average (5–14 rows) ──────────────────
// Gives more weight to recent days. Used when data is too sparse for
// lag features but enough to compute a weighted baseline.
function emaFallback(rows, forecastDays) {
  const cleaned = removeOutliers(rows);
  const alpha = 2 / (Math.min(cleaned.length, 10) + 1); // smoothing factor

  let emaQty = cleaned[0].quantity;
  let emaRev = cleaned[0].revenue;
  for (let i = 1; i < cleaned.length; i++) {
    emaQty = alpha * cleaned[i].quantity + (1 - alpha) * emaQty;
    emaRev = alpha * cleaned[i].revenue  + (1 - alpha) * emaRev;
  }

  const lastRowDateStr = rows.length > 0 ? rows[rows.length - 1].date : null;
  const baseDate = lastRowDateStr ? new Date(lastRowDateStr) : new Date();

  const daily = [];
  for (let i = 1; i <= forecastDays; i++) {
    const d = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    daily.push({
      date: d.toISOString().split('T')[0],
      quantity: Math.round(Math.max(0, emaQty)),
      revenue:  Math.round(Math.max(0, emaRev)),
    });
  }

  return {
    forecastedSales:   Math.round(Math.max(0, emaQty) * forecastDays),
    forecastedRevenue: Math.round(Math.max(0, emaRev) * forecastDays),
    confidence: 45,
    modelAccuracy: 45,
    dailyBreakdown: daily,
    model: 'fallback',
    forecastMethod: 'ema',
  };
}

// ── Tier 2: EMA + Trend Projection (15–34 rows) ─────────────────────
// Computes EMA and overlays a linear trend slope so the forecast can
// capture upward/downward momentum, not just a flat line.
function emaTrendFallback(rows, forecastDays) {
  const cleaned = removeOutliers(rows);
  const n = cleaned.length;
  const alpha = 2 / (Math.min(n, 14) + 1);

  let emaQty = cleaned[0].quantity;
  let emaRev = cleaned[0].revenue;
  for (let i = 1; i < n; i++) {
    emaQty = alpha * cleaned[i].quantity + (1 - alpha) * emaQty;
    emaRev = alpha * cleaned[i].revenue  + (1 - alpha) * emaRev;
  }

  // Linear trend from the last 14 days (or all available)
  const window = Math.min(14, n);
  const tail = cleaned.slice(-window);
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  let sumYr = 0, sumXYr = 0;
  for (let i = 0; i < tail.length; i++) {
    sumX   += i;
    sumY   += tail[i].quantity;
    sumYr  += tail[i].revenue;
    sumXY  += i * tail[i].quantity;
    sumXYr += i * tail[i].revenue;
    sumX2  += i * i;
  }
  const denom = window * sumX2 - sumX * sumX;
  const slopeQty = denom !== 0 ? (window * sumXY  - sumX * sumY)  / denom : 0;
  const slopeRev = denom !== 0 ? (window * sumXYr - sumX * sumYr) / denom : 0;

  const lastRowDateStr = rows.length > 0 ? rows[rows.length - 1].date : null;
  const baseDate = lastRowDateStr ? new Date(lastRowDateStr) : new Date();

  const daily = [];
  for (let i = 1; i <= forecastDays; i++) {
    const d = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
    // Project forward from EMA + trend slope, floored at 0
    const qty = Math.max(0, emaQty + slopeQty * i);
    const rev = Math.max(0, emaRev + slopeRev * i);
    daily.push({
      date: d.toISOString().split('T')[0],
      quantity: Math.round(qty),
      revenue:  Math.round(rev),
    });
  }

  const totalQty = daily.reduce((s, d) => s + d.quantity, 0);
  const totalRev = daily.reduce((s, d) => s + d.revenue, 0);

  return {
    forecastedSales:   totalQty,
    forecastedRevenue: totalRev,
    confidence: 55,
    modelAccuracy: 55,
    dailyBreakdown: daily,
    model: 'fallback',
    forecastMethod: 'ema_trend',
  };
}

// ── Process a single product using the appropriate tier ──────────────
async function processProduct(userId, product, rows, forecastDays, period, model) {
  const cleanRowCount = rows.length;
  let prediction;
  let forecastMethod = 'ml';

  if (cleanRowCount < 5) {
    // Tier 0: Not enough data — skip entirely
    return null;
  } else if (cleanRowCount < 15) {
    // Tier 1: EMA only (too few rows for lag features or trend)
    prediction = emaFallback(rows, forecastDays);
    forecastMethod = 'ema';
  } else if (cleanRowCount < 35) {
    // Tier 2: EMA + trend projection (enough for short trend, not for ML)
    prediction = emaTrendFallback(rows, forecastDays);
    forecastMethod = 'ema_trend';
  } else {
    // Tier 3: Full ML model (Random Forest / Prophet)
    try {
      prediction = await callForecastService(product, rows, forecastDays, model);
      forecastMethod = 'ml';
    } catch (mlErr) {
      // If ML service fails (e.g. 422 from feature engineering edge case),
      // fall back to Tier 2 instead of a dumb average
      console.warn(`ML service unavailable for ${product}, using EMA+trend fallback:`, mlErr.message);
      prediction = emaTrendFallback(rows, forecastDays);
      forecastMethod = 'ema_trend';
    }
  }

  if (!prediction) return null;

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
      forecastMethod,
      isStale: false,
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

  // Enable multi-product concurrency (defaults to 3 parallel product fits)
  const concurrency = Number(process.env.FORECAST_CONCURRENCY) || 3;

  const results = await runWithConcurrency(
    productsToForecast,
    concurrency,
    async ([product, rows], i) => {
      if (opts.onProgress) {
        const cleanRowCount = rows.length;
        let method = 'ema';
        if (cleanRowCount < 15) {
          method = 'ema';
        } else if (cleanRowCount < 35) {
          method = 'ema_trend';
        } else {
          method = model;
        }
        opts.onProgress(i + 1, productsToForecast.length, product, method);
      }
      return processProduct(userId, product, rows, forecastDays, period, model);
    },
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
    forecasts: results.filter(Boolean),
    productsForecasted: results.filter(Boolean).length,
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

/**
 * Trigger bulk forecast generation in the background.
 * Validates data eligibility, initializes the tracker, and returns immediate status.
 */
async function triggerForecastGeneration(userId, opts = {}) {
  const forecastDays = Math.max(1, Math.min(180, Number(opts.forecastDays) || 30));
  const requestedModel = String(opts.model || 'rf').toLowerCase();
  const model = ['rf', 'prophet'].includes(requestedModel) ? requestedModel : 'rf';

  // Check if job is already running
  const activeJob = forecastTracker.getJob(userId.toString());
  if (activeJob && activeJob.status === 'generating') {
    if (activeJob.elapsedTime > 90000) {
      // Job has been stuck for > 90s — clear it and allow re-trigger
      forecastTracker.clearJob(userId.toString());
    } else {
      return { status: 'already_running' };
    }
  }

  // Pre-validate that we have enough sales data
  const salesData = await SalesData.find({ userId }).sort({ date: 1 }).lean();
  if (salesData.length < 10) {
    return { status: 'skipped', reason: 'Need at least 10 sales records to generate forecasts.' };
  }

  // Find eligible products
  const byProduct = {};
  salesData.forEach((row) => {
    if (!byProduct[row.product]) byProduct[row.product] = [];
    byProduct[row.product].push({
      date: row.date.toISOString().split('T')[0],
      quantity: row.quantity,
      revenue: row.revenue,
    });
  });

  Object.keys(byProduct).forEach((product) => {
    const rows = byProduct[product];
    if (rows.length === 0) return;
    const lastDateStr = rows[rows.length - 1].date;
    const lastDate = new Date(lastDateStr);
    const cutoff = new Date(lastDate.getTime() - 730 * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    byProduct[product] = rows.filter(r => r.date >= cutoffStr);
  });

  const eligibleProducts = Object.entries(byProduct)
    .map(([product, rows]) => {
      const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
      return { product, rows, totalRevenue };
    })
    .filter(p => p.rows.length >= 5);

  if (!eligibleProducts.length) {
    return { status: 'skipped', reason: 'No products have enough data (at least 5 sales records in last 730 days) for forecasting.' };
  }

  eligibleProducts.sort((a, b) => b.totalRevenue - a.totalRevenue);
  const limit = Number(process.env.FORECAST_MAX_PRODUCTS) || 100;
  const productsToForecast = eligibleProducts.slice(0, limit);

  // Initialize the progress tracker
  forecastTracker.startJob(userId.toString(), productsToForecast.length);

  // Trigger forecast generation asynchronously in the background
  runForecastForUser(userId, {
    forecastDays,
    trigger: opts.trigger || 'manual',
    model,
    onProgress: (index, total, product, method) => {
      forecastTracker.updateProgress(userId.toString(), index, total, product, method);
    }
  })
    .then((result) => {
      if (result.skipped) {
        const reason = result.reason === 'not_enough_data'
          ? 'Need at least 10 sales records to generate forecasts.'
          : 'No products have enough data for forecasting.';
        forecastTracker.failJob(userId.toString(), reason);
      } else {
        const isLimited = result.totalEligibleProducts > limit;
        const message = isLimited
          ? `Generated forecasts for the top ${result.productsForecasted} products (by historical revenue) out of ${result.totalEligibleProducts} eligible products using ${model === 'prophet' ? 'Prophet' : 'Random Forest'}. Other products will be forecasted on-demand.`
          : `Generated forecasts for all ${result.productsForecasted} product(s) using ${model === 'prophet' ? 'Prophet' : 'Random Forest'}.`;
        
        forecastTracker.completeJob(userId.toString(), {
          message,
          productsForecasted: result.productsForecasted,
          totalEligibleProducts: result.totalEligibleProducts,
          model: result.model
        });
      }
    })
    .catch((err) => {
      console.error('Background forecast generation failed:', err);
      forecastTracker.failJob(userId.toString(), err.message || 'Forecast generation failed.');
    });

  return { status: 'started' };
}

module.exports = { runForecastForUser, runForecastForSingleProduct, triggerForecastGeneration };
