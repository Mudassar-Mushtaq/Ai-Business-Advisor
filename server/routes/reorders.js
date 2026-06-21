const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');

const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/asyncHandler');
const escapeRegex = require('../utils/escapeRegex');

const PurchaseOrder = require('../models/PurchaseOrder');
const InventoryItem = require('../models/InventoryItem');
const Alert = require('../models/Alert');
const Forecast = require('../models/Forecast');
const { computeReorderLevel } = require('../services/reorderRecommender');
const cache = require('../config/cache');

const VALID_STATUSES = ['draft', 'ordered', 'received', 'cancelled'];

const invKey = (uid) => `inventory:${uid}:list`;
const recKey = (uid) => `inventory:${uid}:recommendations`;
const invalidateInventory = (uid) => cache.delPattern(`inventory:${uid}:*`);

// Suggest a quantity for a product the user wants to reorder.
// Mirrors the dashboard "reorder recommendation" math.
async function suggestQuantity(userId, inventoryItem) {
  if (!inventoryItem) return 1;
  const fc = await Forecast.findOne({ userId, product: inventoryItem.product })
    .sort({ generatedAt: -1 })
    .select('forecastedSales')
    .lean();

  const recommended = computeReorderLevel({
    forecasted30dQty: fc?.forecastedSales,
    leadTimeDays: inventoryItem.leadTimeDays,
    safetyStockPct: inventoryItem.safetyStockPct,
  });

  // Order enough to reach the recommended threshold + cover the deficit.
  const deficit = Math.max(0, (recommended ?? inventoryItem.reorderLevel ?? 10) - inventoryItem.stock);
  return Math.max(1, deficit || recommended || 10);
}

// GET /api/reorders — list, optionally filtered by status / search
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { status, q } = req.query;
  const filter = { userId: req.user._id };

  if (status) {
    const list = String(status).split(',').map(s => s.trim()).filter(Boolean);
    const invalid = list.find(s => !VALID_STATUSES.includes(s));
    if (invalid) throw new AppError(`Invalid status: ${invalid}`, 400, 'invalid_status');
    filter.status = { $in: list };
  }
  if (q && String(q).trim()) {
    filter.product = { $regex: escapeRegex(String(q).trim()), $options: 'i' };
  }

  const items = await PurchaseOrder.find(filter).sort({ createdAt: -1 }).lean();
  res.json(items);
}));

// GET /api/reorders/stats — counts by status for the header summary
router.get('/stats', requireAuth, asyncHandler(async (req, res) => {
  const rows = await PurchaseOrder.aggregate([
    { $match: { userId: req.user._id } },
    { $group: { _id: '$status', count: { $sum: 1 }, totalCost: { $sum: '$totalCost' } } },
  ]);
  const out = { draft: 0, ordered: 0, received: 0, cancelled: 0, total: 0, totalCost: 0 };
  for (const r of rows) {
    out[r._id] = r.count;
    out.total += r.count;
    if (r._id !== 'cancelled') out.totalCost += r.totalCost || 0;
  }
  out.totalCost = +out.totalCost.toFixed(2);
  res.json(out);
}));

// POST /api/reorders — create one manually
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const {
    product, category, unit, quantity, costPerUnit,
    supplier, notes, expectedDate, inventoryId,
  } = req.body || {};

  if (!product || !String(product).trim()) {
    throw new AppError('Product name is required', 400, 'product_required');
  }
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty < 1) {
    throw new AppError('Quantity must be at least 1', 400, 'invalid_quantity');
  }

  const po = await PurchaseOrder.create({
    userId: req.user._id,
    inventoryId: inventoryId || null,
    product: String(product).trim(),
    category: category || 'General',
    unit: unit || 'units',
    quantity: qty,
    costPerUnit: Number.isFinite(+costPerUnit) ? +costPerUnit : 0,
    supplier: supplier || '',
    notes: notes || '',
    expectedDate: expectedDate ? new Date(expectedDate) : null,
    source: 'manual',
  });
  res.status(201).json(po);
}));

// POST /api/reorders/from-alert/:alertId — create a draft PO from a low-stock alert
router.post('/from-alert/:alertId', requireAuth, asyncHandler(async (req, res) => {
  const { quantity: overrideQty, supplier, notes, expectedDate } = req.body || {};

  const alert = await Alert.findOne({ _id: req.params.alertId, userId: req.user._id });
  if (!alert) throw new AppError('Alert not found', 404, 'alert_not_found');

  let inventoryItem = null;
  if (alert.product) {
    inventoryItem = await InventoryItem.findOne({
      userId: req.user._id,
      product: alert.product,
    });
  }

  const suggestedQty = await suggestQuantity(req.user._id, inventoryItem);
  const qty = Number.isFinite(+overrideQty) && +overrideQty >= 1 ? +overrideQty : suggestedQty;

  const po = await PurchaseOrder.create({
    userId: req.user._id,
    inventoryId: inventoryItem?._id || null,
    product: alert.product || alert.title.slice(0, 80),
    category: inventoryItem?.category || 'General',
    unit: inventoryItem?.unit || 'units',
    quantity: qty,
    costPerUnit: inventoryItem?.costPerUnit || 0,
    supplier: supplier || inventoryItem?.supplier || '',
    notes: notes || `Auto-created from alert: ${alert.title}`,
    expectedDate: expectedDate ? new Date(expectedDate) : null,
    source: 'alert',
    sourceAlertId: alert._id,
  });

  // Auto-mark the alert read once it's been acted on — keeps the alerts panel clean.
  alert.read = true;
  await alert.save();

  res.status(201).json(po);
}));

// POST /api/reorders/suggest — returns suggested quantity + supplier for a product
// (used by the "Reorder" modal to pre-fill fields)
router.post('/suggest', requireAuth, asyncHandler(async (req, res) => {
  const { product, inventoryId } = req.body || {};
  if (!product && !inventoryId) {
    throw new AppError('product or inventoryId is required', 400, 'product_required');
  }

  const inv = inventoryId
    ? await InventoryItem.findOne({ _id: inventoryId, userId: req.user._id })
    : await InventoryItem.findOne({ userId: req.user._id, product });

  const suggestedQty = await suggestQuantity(req.user._id, inv);

  res.json({
    suggestedQty,
    product:     inv?.product || product,
    category:    inv?.category || 'General',
    unit:        inv?.unit || 'units',
    costPerUnit: inv?.costPerUnit || 0,
    supplier:    inv?.supplier || '',
    currentStock: inv?.stock ?? null,
    reorderLevel: inv?.reorderLevel ?? null,
    inventoryId: inv?._id || null,
  });
}));

// PUT /api/reorders/:id — update fields (quantity, supplier, notes, costPerUnit, expectedDate)
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
  const allowed = ['quantity', 'costPerUnit', 'supplier', 'notes', 'expectedDate', 'unit', 'category'];
  const update = {};
  for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];

  if (update.quantity != null) {
    const q = +update.quantity;
    if (!Number.isFinite(q) || q < 1) {
      throw new AppError('Quantity must be at least 1', 400, 'invalid_quantity');
    }
    update.quantity = q;
  }
  if (update.costPerUnit != null) {
    const c = +update.costPerUnit;
    if (!Number.isFinite(c) || c < 0) {
      throw new AppError('Cost per unit must be non-negative', 400, 'invalid_cost');
    }
    update.costPerUnit = c;
  }
  if (update.expectedDate) update.expectedDate = new Date(update.expectedDate);

  // Use save() so the pre('save') hook recomputes totalCost.
  const po = await PurchaseOrder.findOne({ _id: req.params.id, userId: req.user._id });
  if (!po) throw new AppError('Reorder not found', 404, 'not_found');
  Object.assign(po, update);
  await po.save();

  res.json(po);
}));

// PUT /api/reorders/:id/status — transition status with safety rules
// Body: { status: 'ordered' | 'received' | 'cancelled' | 'draft' }
router.put('/:id/status', requireAuth, asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) {
    throw new AppError('Invalid status', 400, 'invalid_status');
  }

  const po = await PurchaseOrder.findOne({ _id: req.params.id, userId: req.user._id });
  if (!po) throw new AppError('Reorder not found', 404, 'not_found');

  if (po.status === 'received' && status !== 'received') {
    throw new AppError('Received orders cannot be reopened', 409, 'already_received');
  }
  if (po.status === status) return res.json(po);

  const now = new Date();
  po.status = status;
  if (status === 'ordered')   po.orderedAt   = po.orderedAt   || now;
  if (status === 'received')  po.receivedAt  = now;
  if (status === 'cancelled') po.cancelledAt = now;
  if (status === 'draft')   { po.orderedAt = null; po.cancelledAt = null; }

  await po.save();

  // Receiving an order bumps inventory stock and busts the cache so the
  // dashboard/alerts reflect the new on-hand quantity immediately.
  if (status === 'received' && po.inventoryId) {
    await InventoryItem.findOneAndUpdate(
      { _id: po.inventoryId, userId: req.user._id },
      { $inc: { stock: po.quantity }, $set: { lastUpdated: now } }
    );
    await invalidateInventory(req.user._id);
  }

  res.json(po);
}));

// DELETE /api/reorders/:id — hard delete (draft / cancelled only)
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, userId: req.user._id });
  if (!po) throw new AppError('Reorder not found', 404, 'not_found');
  if (!['draft', 'cancelled'].includes(po.status)) {
    throw new AppError('Only draft or cancelled reorders can be deleted', 409, 'cannot_delete');
  }
  await po.deleteOne();
  res.json({ message: 'Reorder deleted.' });
}));

// GET /api/reorders/export?format=xlsx|csv|json&status=draft,ordered
// Returns the file as an attachment.
router.get('/export', requireAuth, asyncHandler(async (req, res) => {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  if (!['xlsx', 'csv', 'json'].includes(format)) {
    throw new AppError('format must be xlsx, csv or json', 400, 'invalid_format');
  }

  const filter = { userId: req.user._id };
  if (req.query.status) {
    const list = String(req.query.status).split(',').map(s => s.trim()).filter(Boolean);
    const invalid = list.find(s => !VALID_STATUSES.includes(s));
    if (invalid) throw new AppError(`Invalid status: ${invalid}`, 400, 'invalid_status');
    filter.status = { $in: list };
  }

  const items = await PurchaseOrder.find(filter).sort({ createdAt: -1 }).lean();

  const rows = items.map(po => ({
    Product:        po.product,
    Category:       po.category,
    Quantity:       po.quantity,
    Unit:           po.unit,
    'Cost / unit':  +(po.costPerUnit || 0).toFixed(2),
    'Total cost':   +(po.totalCost || 0).toFixed(2),
    Supplier:       po.supplier || '',
    Status:         po.status,
    'Expected':     po.expectedDate ? new Date(po.expectedDate).toISOString().slice(0, 10) : '',
    'Ordered at':   po.orderedAt   ? new Date(po.orderedAt).toISOString().slice(0, 10)   : '',
    'Received at':  po.receivedAt  ? new Date(po.receivedAt).toISOString().slice(0, 10)  : '',
    'Created at':   new Date(po.createdAt).toISOString().slice(0, 10),
    Notes:          po.notes || '',
  }));

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'json') {
    res.setHeader('Content-Disposition', `attachment; filename="reorders-${stamp}.json"`);
    return res.json(rows);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, {
    header: rows[0] ? Object.keys(rows[0]) : [
      'Product','Category','Quantity','Unit','Cost / unit','Total cost',
      'Supplier','Status','Expected','Ordered at','Received at','Created at','Notes',
    ],
  });

  // Column widths for readability
  ws['!cols'] = [
    { wch: 26 }, { wch: 14 }, { wch: 10 }, { wch: 10 },
    { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Reorders');

  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(ws);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reorders-${stamp}.csv"`);
    return res.send(csv);
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="reorders-${stamp}.xlsx"`);
  return res.send(buf);
}));

module.exports = router;
