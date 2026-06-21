const InventoryItem = require('../models/InventoryItem');
const SalesData = require('../models/SalesData');
const Forecast = require('../models/Forecast');
const Alert = require('../models/Alert');
const { checkGoalAlerts } = require('./goalService');

/**
 * Run the full automated alert pipeline for a user.
 * Called after every file upload and forecast generation.
 */
async function runAlertPipeline(userId) {
  const newAlerts = [];

  // Batch-load all recent alerts (last 48h) to avoid N+1 queries
  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const recentAlerts = await Alert.find({
    userId,
    createdAt: { $gte: cutoff48h },
  }).select('type product createdAt').lean();

  // Build a lookup: 'type:product' => most recent createdAt
  const alertLookup = new Map();
  for (const a of recentAlerts) {
    const key = `${a.type}:${a.product || ''}`;
    const existing = alertLookup.get(key);
    if (!existing || a.createdAt > existing) {
      alertLookup.set(key, a.createdAt);
    }
  }

  function hasRecentAlert(type, product, withinMs = 24 * 60 * 60 * 1000) {
    const key = `${type}:${product || ''}`;
    const last = alertLookup.get(key);
    if (!last) return false;
    return (Date.now() - last.getTime()) < withinMs;
  }

  // 1. Low-stock / out-of-stock alerts
  const lowStockItems = await InventoryItem.find({
    userId,
    $expr: { $lte: ['$stock', '$reorderLevel'] }
  }).lean();

  for (const item of lowStockItems) {
    const severity = item.stock <= 0 ? 'critical' : 'warning';
    const title = item.stock <= 0
      ? `Out of Stock: ${item.product}`
      : `Low Stock: ${item.product}`;
    const message = item.stock <= 0
      ? `${item.product} is completely out of stock. Restock immediately.`
      : `${item.product} has only ${item.stock} ${item.unit || 'units'} left (reorder level: ${item.reorderLevel}).`;

    if (!hasRecentAlert('low_stock', item.product)) {
      const alert = await Alert.create({ userId, type: 'low_stock', severity, title, message, product: item.product, value: item.stock });
      newAlerts.push(alert);
    }
  }

  // 2. High-sales / above-expectation alerts
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const [recentSales, previousSales] = await Promise.all([
    SalesData.aggregate([
      { $match: { userId, date: { $gte: thirtyDaysAgo } } },
      { $group: { _id: '$product', revenue: { $sum: '$revenue' }, qty: { $sum: '$quantity' } } }
    ]),
    SalesData.aggregate([
      { $match: { userId, date: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } } },
      { $group: { _id: '$product', revenue: { $sum: '$revenue' }, qty: { $sum: '$quantity' } } }
    ])
  ]);

  const previousMap = {};
  previousSales.forEach(p => { previousMap[p._id] = p; });

  for (const curr of recentSales) {
    const prev = previousMap[curr._id];
    if (!prev || prev.revenue === 0) continue;

    const growthPct = ((curr.revenue - prev.revenue) / prev.revenue) * 100;

    if (growthPct >= 20) {
      if (!hasRecentAlert('high_sales', curr._id)) {
        const alert = await Alert.create({
          userId,
          type: 'high_sales',
          severity: 'info',
          title: `Sales Surge: ${curr._id}`,
          message: `${curr._id} sales grew by ${growthPct.toFixed(1)}% this month ($${curr.revenue.toFixed(0)} vs $${prev.revenue.toFixed(0)}). Consider increasing stock.`,
          product: curr._id,
          value: growthPct,
        });
        newAlerts.push(alert);
      }
    }
  }

  // 3. Forecast-based anomaly alerts
  const forecasts = await Forecast.find({ userId }).lean();
  for (const forecast of forecasts) {
    if (forecast.confidence < 50) {
      if (!hasRecentAlert('anomaly', forecast.product, 48 * 60 * 60 * 1000)) {
        const alert = await Alert.create({
          userId,
          type: 'anomaly',
          severity: 'warning',
          title: `Low Forecast Confidence: ${forecast.product}`,
          message: `The forecast for ${forecast.product} has low confidence (${forecast.confidence}%). Sales patterns may be irregular. Review historical data.`,
          product: forecast.product,
          value: forecast.confidence,
        });
        newAlerts.push(alert);
      }
    }
  }

  // 4. Goal progress alerts (off-track / achieved)
  try {
    const goalAlerts = await checkGoalAlerts(userId);
    newAlerts.push(...goalAlerts);
  } catch (err) {
    console.warn('Goal alert check failed:', err.message);
  }

  return newAlerts;
}

module.exports = { runAlertPipeline };
