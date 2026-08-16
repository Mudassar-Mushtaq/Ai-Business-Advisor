const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/asyncHandler');
const InventoryItem = require('../models/InventoryItem');
const Alert = require('../models/Alert');
const cache = require('../config/cache');
const {
  computeReorderLevel,
  buildRecommendations,
  recomputeForUser,
} = require('../services/reorderRecommender');

const invKey   = (uid) => `inventory:${uid}:list`;
const recKey   = (uid) => `inventory:${uid}:recommendations`;
const invalidate = (uid) => cache.delPattern(`inventory:${uid}:*`);

// GET /api/inventory — cached 2 min
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const items = await cache.wrap(invKey(req.user._id), 120, async () => {
    const list = await InventoryItem.find({ userId: req.user._id }).sort({ product: 1 }).lean();
    return list.map((item) => ({
      ...item,
      status: item.stock <= 0 ? 'out_of_stock'
        : item.stock <= item.reorderLevel ? 'low_stock'
        : 'in_stock',
    }));
  });
  res.json(items);
}));

// POST /api/inventory — add new item
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { product, category, stock, reorderLevel, unit, costPerUnit, supplier } = req.body;
  if (!product || !String(product).trim()) {
    throw new AppError('Product name is required', 400, 'product_required');
  }
  const item = await InventoryItem.findOneAndUpdate(
    { userId: req.user._id, product },
    { userId: req.user._id, product, category, stock, reorderLevel, unit, costPerUnit, supplier, lastUpdated: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
  await invalidate(req.user._id);
  res.json(item);
}));

// PUT /api/inventory/:id
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
  // Don't let this generic edit endpoint silently change alert config — that
  // has its own endpoint (/:id/alert-config) so the auto/manual mode and the
  // derived reorderLevel stay consistent.
  const { alertMode, manualReorderLevel, leadTimeDays, safetyStockPct, ...rest } = req.body;
  const item = await InventoryItem.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { ...rest, lastUpdated: new Date() },
    { new: true, runValidators: true }
  );
  if (!item) throw new AppError('Item not found', 404, 'not_found');
  await invalidate(req.user._id);
  res.json(item);
}));

// DELETE /api/inventory/:id
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const deleted = await InventoryItem.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!deleted) throw new AppError('Item not found', 404, 'not_found');
  await invalidate(req.user._id);
  res.json({ message: 'Item deleted.' });
}));

// PUT /api/inventory/:id/alert-config — set per-product alert configuration
// Body: { alertMode, manualReorderLevel?, leadTimeDays?, safetyStockPct? }
router.put('/:id/alert-config', requireAuth, asyncHandler(async (req, res) => {
  const { alertMode, manualReorderLevel, leadTimeDays, safetyStockPct } = req.body || {};

  if (alertMode && !['auto', 'manual'].includes(alertMode)) {
    throw new AppError('alertMode must be "auto" or "manual"', 400, 'invalid_alert_mode');
  }
  if (manualReorderLevel != null && (!Number.isFinite(+manualReorderLevel) || +manualReorderLevel < 0)) {
    throw new AppError('manualReorderLevel must be a non-negative number', 400, 'invalid_manual_level');
  }
  if (leadTimeDays != null && (!Number.isFinite(+leadTimeDays) || +leadTimeDays < 0 || +leadTimeDays > 365)) {
    throw new AppError('leadTimeDays must be 0–365', 400, 'invalid_lead_time');
  }
  if (safetyStockPct != null && (!Number.isFinite(+safetyStockPct) || +safetyStockPct < 0 || +safetyStockPct > 500)) {
    throw new AppError('safetyStockPct must be 0–500', 400, 'invalid_safety_pct');
  }

  const item = await InventoryItem.findOne({ _id: req.params.id, userId: req.user._id });
  if (!item) throw new AppError('Item not found', 404, 'not_found');

  if (alertMode) item.alertMode = alertMode;
  if (leadTimeDays != null) item.leadTimeDays = +leadTimeDays;
  if (safetyStockPct != null) item.safetyStockPct = +safetyStockPct;
  if (manualReorderLevel != null) item.manualReorderLevel = +manualReorderLevel;

  // Decide the effective reorderLevel right away so alerts reflect the change
  // immediately, without waiting for the next forecast run.
  if (item.alertMode === 'manual') {
    if (item.manualReorderLevel != null) item.reorderLevel = item.manualReorderLevel;
  } else {
    // auto — look up the latest forecast and recompute
    const Forecast = require('../models/Forecast');
    const fc = await Forecast.findOne({ userId: req.user._id, product: item.product })
      .sort({ generatedAt: -1 }).select('forecastedSales').lean();
    const recommended = computeReorderLevel({
      forecasted30dQty: fc?.forecastedSales,
      leadTimeDays: item.leadTimeDays,
      safetyStockPct: item.safetyStockPct,
    });
    if (recommended != null) item.reorderLevel = recommended;
  }
  item.lastUpdated = new Date();
  await item.save();

  await invalidate(req.user._id);
  res.json(item);
}));

// GET /api/inventory/recommendations — per-product reorder recommendations
// Cached 5 min. Single $lookup aggregation under the hood.
router.get('/recommendations', requireAuth, asyncHandler(async (req, res) => {
  const data = await cache.wrap(recKey(req.user._id), 300, () =>
    buildRecommendations(req.user._id)
  );
  res.json(data);
}));

// GET /api/inventory/categories — distinct categories the user has, with counts
router.get('/categories', requireAuth, asyncHandler(async (req, res) => {
  const key = `inventory:${req.user._id}:categories`;
  const cats = await cache.wrap(key, 300, () =>
    InventoryItem.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: { $ifNull: ['$category', 'General'] }, count: { $sum: 1 } } },
      { $project: { _id: 0, value: '$_id', label: '$_id', count: 1 } },
      { $sort: { count: -1 } },
    ])
  );
  res.json(cats);
}));

// POST /api/inventory/bulk-alert-config — apply alert config to many items at once
// Body shapes:
//   { scope:'all',      alertMode:'manual', manualReorderLevel }
//   { scope:'category', alertMode:'manual', category, manualReorderLevel }
//   { scope:'all',      alertMode:'auto',   leadTimeDays?, safetyStockPct? }
//   { scope:'category', alertMode:'auto',   category, leadTimeDays?, safetyStockPct? }
router.post('/bulk-alert-config', requireAuth, asyncHandler(async (req, res) => {
  const {
    scope, alertMode, category,
    manualReorderLevel, leadTimeDays, safetyStockPct,
  } = req.body || {};

  if (!['all', 'category'].includes(scope)) {
    throw new AppError('scope must be "all" or "category"', 400, 'invalid_scope');
  }
  if (!['auto', 'manual'].includes(alertMode)) {
    throw new AppError('alertMode must be "auto" or "manual"', 400, 'invalid_alert_mode');
  }
  if (scope === 'category' && (!category || !String(category).trim())) {
    throw new AppError('category is required when scope is "category"', 400, 'category_required');
  }
  if (alertMode === 'manual') {
    const m = +manualReorderLevel;
    if (!Number.isFinite(m) || m < 0) {
      throw new AppError('manualReorderLevel must be a non-negative number', 400, 'invalid_manual_level');
    }
  }
  if (leadTimeDays != null && (!Number.isFinite(+leadTimeDays) || +leadTimeDays < 0 || +leadTimeDays > 365)) {
    throw new AppError('leadTimeDays must be 0–365', 400, 'invalid_lead_time');
  }
  if (safetyStockPct != null && (!Number.isFinite(+safetyStockPct) || +safetyStockPct < 0 || +safetyStockPct > 500)) {
    throw new AppError('safetyStockPct must be 0–500', 400, 'invalid_safety_pct');
  }

  const filter = { userId: req.user._id };
  if (scope === 'category') filter.category = String(category).trim();

  const set = { alertMode, lastUpdated: new Date() };
  if (leadTimeDays != null)   set.leadTimeDays   = +leadTimeDays;
  if (safetyStockPct != null) set.safetyStockPct = +safetyStockPct;
  if (alertMode === 'manual') {
    set.manualReorderLevel = +manualReorderLevel;
    set.reorderLevel = +manualReorderLevel; // applies immediately
  }

  const result = await InventoryItem.updateMany(filter, { $set: set });

  // For auto mode, the manual level is irrelevant — the recompute below will
  // derive reorderLevel from each product's forecast.
  let recomputed = 0;
  if (alertMode === 'auto') {
    const r = await recomputeForUser(req.user._id);
    recomputed = r.updated || 0;
  }

  await invalidate(req.user._id);
  res.json({
    matched: result.matchedCount || result.n || 0,
    modified: result.modifiedCount || result.nModified || 0,
    recomputed,
  });
}));

// GET /api/inventory/alerts — low stock & out of stock (cached 2 min)
router.get('/alerts', requireAuth, asyncHandler(async (req, res) => {
  const key = `inventory:${req.user._id}:alerts`;
  const items = await cache.wrap(key, 120, () =>
    InventoryItem.find({
      userId: req.user._id,
      $expr: { $lte: ['$stock', '$reorderLevel'] }
    }).lean()
  );
  res.json(items);
}));

// GET /api/inventory/notifications — fetch stored alert docs
router.get('/notifications', requireAuth, asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const alerts = await Alert.find({ userId: req.user._id })
    .sort({ createdAt: -1 }).limit(limit).lean();
  res.json(alerts);
}));

// PUT /api/inventory/notifications/read-all — mark all notifications read
router.put('/notifications/read-all', requireAuth, asyncHandler(async (req, res) => {
  await Alert.updateMany(
    { userId: req.user._id, read: false },
    { read: true }
  );
  res.json({ message: 'All notifications marked as read.' });
}));

// PUT /api/inventory/notifications/:id/read
router.put('/notifications/:id/read', requireAuth, asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.json({ message: 'Client-derived alert marked read.' });
  }
  const updated = await Alert.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { read: true },
    { new: true }
  );
  if (!updated) {
    return res.json({ message: 'Notification not found or already read.' });
  }
  res.json({ message: 'Marked as read.', alert: updated });
}));

module.exports = router;
