const InventoryItem = require('../models/InventoryItem');
const Forecast = require('../models/Forecast');

const FORECAST_WINDOW_DAYS = 30; // Forecast.forecastedSales is for this horizon

// Pure formula: dailyDemand * leadTime * (1 + safety%)
// Floor at 1 so we don't silently disable alerts for very slow movers.
function computeReorderLevel({ forecasted30dQty, leadTimeDays = 7, safetyStockPct = 20 }) {
  if (!Number.isFinite(forecasted30dQty) || forecasted30dQty <= 0) return null;
  const dailyDemand = forecasted30dQty / FORECAST_WINDOW_DAYS;
  const raw = dailyDemand * leadTimeDays * (1 + safetyStockPct / 100);
  return Math.max(1, Math.ceil(raw));
}

// Recompute reorderLevel for every auto-mode item belonging to a user.
// Uses one query per collection + one bulkWrite — O(1) round-trips
// regardless of product count.
async function recomputeForUser(userId) {
  const [items, forecasts] = await Promise.all([
    InventoryItem.find({ userId, alertMode: 'auto' })
      .select('_id product leadTimeDays safetyStockPct reorderLevel')
      .lean(),
    Forecast.find({ userId })
      .select('product forecastedSales')
      .lean(),
  ]);

  if (!items.length) return { updated: 0 };

  const forecastByProduct = new Map();
  forecasts.forEach((f) => forecastByProduct.set(f.product, f.forecastedSales));

  const ops = [];
  for (const item of items) {
    const forecasted30dQty = forecastByProduct.get(item.product);
    const next = computeReorderLevel({
      forecasted30dQty,
      leadTimeDays: item.leadTimeDays,
      safetyStockPct: item.safetyStockPct,
    });
    if (next == null || next === item.reorderLevel) continue;
    ops.push({
      updateOne: {
        filter: { _id: item._id },
        update: { $set: { reorderLevel: next, lastUpdated: new Date() } },
      },
    });
  }

  if (!ops.length) return { updated: 0 };
  const result = await InventoryItem.bulkWrite(ops, { ordered: false });
  return { updated: result.modifiedCount || 0 };
}

// Build a per-product recommendation view joining inventory + forecast.
// Single aggregation — used by the /recommendations endpoint.
async function buildRecommendations(userId) {
  const docs = await InventoryItem.aggregate([
    { $match: { userId: typeof userId === 'string' ? require('mongoose').Types.ObjectId.createFromHexString(userId) : userId } },
    {
      $lookup: {
        from: 'forecasts',
        let: { product: '$product', uid: '$userId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$product', '$$product'] }, { $eq: ['$userId', '$$uid'] }] } } },
          { $sort: { generatedAt: -1 } },
          { $limit: 1 },
          { $project: { _id: 0, forecastedSales: 1, confidence: 1, generatedAt: 1 } },
        ],
        as: 'forecast',
      },
    },
    { $unwind: { path: '$forecast', preserveNullAndEmptyArrays: true } },
  ]);

  return docs.map((d) => {
    const forecasted30dQty = d.forecast?.forecastedSales || 0;
    const recommended = computeReorderLevel({
      forecasted30dQty,
      leadTimeDays: d.leadTimeDays,
      safetyStockPct: d.safetyStockPct,
    });
    const effective = d.alertMode === 'manual' && d.manualReorderLevel != null
      ? d.manualReorderLevel
      : (recommended ?? d.reorderLevel);

    return {
      _id: d._id,
      product: d.product,
      category: d.category,
      unit: d.unit,
      stock: d.stock,
      alertMode: d.alertMode,
      manualReorderLevel: d.manualReorderLevel,
      leadTimeDays: d.leadTimeDays,
      safetyStockPct: d.safetyStockPct,
      currentReorderLevel: d.reorderLevel,
      recommendedReorderLevel: recommended,
      effectiveReorderLevel: effective,
      forecasted30dQty,
      forecastConfidence: d.forecast?.confidence ?? null,
      forecastGeneratedAt: d.forecast?.generatedAt ?? null,
      hasForecast: Boolean(d.forecast),
    };
  });
}

module.exports = {
  computeReorderLevel,
  recomputeForUser,
  buildRecommendations,
  FORECAST_WINDOW_DAYS,
};
