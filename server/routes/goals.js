const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../middleware/asyncHandler');
const Goal = require('../models/Goal');
const { computeProgress, computeAllForUser, persistProgress } = require('../services/goalService');
const cache = require('../config/cache');

const invalidate = (uid) => cache.delPattern(`goals:${uid}:*`);

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function startOfQuarter(d = new Date()) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}
function endOfQuarter(d = new Date()) {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
}

function resolveDates({ period, startDate, endDate }) {
  if (period === 'month') return { startDate: startOfMonth(), endDate: endOfMonth() };
  if (period === 'quarter') return { startDate: startOfQuarter(), endDate: endOfQuarter() };
  if (!startDate || !endDate) {
    const err = new Error('startDate and endDate are required for custom periods.');
    err.status = 400;
    throw err;
  }
  return { startDate: new Date(startDate), endDate: new Date(endDate) };
}

function validatePayload(body) {
  const { label, metric, target, period } = body;
  if (!label || !label.trim()) {
    const err = new Error('label is required.'); err.status = 400; throw err;
  }
  if (!Goal.METRICS.includes(metric)) {
    const err = new Error(`metric must be one of: ${Goal.METRICS.join(', ')}`); err.status = 400; throw err;
  }
  if (!Goal.PERIODS.includes(period)) {
    const err = new Error(`period must be one of: ${Goal.PERIODS.join(', ')}`); err.status = 400; throw err;
  }
  if (!Number.isFinite(Number(target)) || Number(target) < 0) {
    const err = new Error('target must be a non-negative number.'); err.status = 400; throw err;
  }
  if (metric === 'product_revenue' && !body.productFilter) {
    const err = new Error('productFilter is required when metric is product_revenue.'); err.status = 400; throw err;
  }
}

// GET /api/goals — list with live progress
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const onlyActive = req.query.status !== 'all';
  const progress = await computeAllForUser(req.user._id, { onlyActive });
  res.json(progress);
}));

// POST /api/goals — create
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  validatePayload(req.body);
  const { startDate, endDate } = resolveDates(req.body);

  const goal = await Goal.create({
    userId:        req.user._id,
    label:         req.body.label.trim(),
    metric:        req.body.metric,
    target:        Number(req.body.target),
    period:        req.body.period,
    productFilter: req.body.productFilter || null,
    startDate,
    endDate,
  });

  // Compute once so the dashboard doesn't show 0% on first load.
  const progress = await computeProgress(goal);
  await persistProgress(goal, progress);

  await invalidate(req.user._id);
  res.status(201).json(progress);
}));

// PUT /api/goals/:id — update
router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
  const goal = await Goal.findOne({ _id: req.params.id, userId: req.user._id });
  if (!goal) return res.status(404).json({ error: 'Goal not found.' });

  if (req.body.label != null) goal.label = String(req.body.label).trim();
  if (req.body.target != null) goal.target = Number(req.body.target);
  if (req.body.productFilter !== undefined) goal.productFilter = req.body.productFilter || null;
  if (req.body.status && Goal.STATUSES.includes(req.body.status)) goal.status = req.body.status;

  if (req.body.period && Goal.PERIODS.includes(req.body.period)) {
    goal.period = req.body.period;
    const { startDate, endDate } = resolveDates({
      period: req.body.period,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
    });
    goal.startDate = startDate;
    goal.endDate = endDate;
  } else if (req.body.startDate || req.body.endDate) {
    if (req.body.startDate) goal.startDate = new Date(req.body.startDate);
    if (req.body.endDate)   goal.endDate   = new Date(req.body.endDate);
  }

  await goal.save();
  const progress = await computeProgress(goal);
  await persistProgress(goal, progress);
  await invalidate(req.user._id);
  res.json(progress);
}));

// DELETE /api/goals/:id
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const result = await Goal.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!result) return res.status(404).json({ error: 'Goal not found.' });
  await invalidate(req.user._id);
  res.json({ message: 'Goal deleted.' });
}));

// GET /api/goals/:id/progress — single live computation
router.get('/:id/progress', requireAuth, asyncHandler(async (req, res) => {
  const goal = await Goal.findOne({ _id: req.params.id, userId: req.user._id });
  if (!goal) return res.status(404).json({ error: 'Goal not found.' });
  const progress = await computeProgress(goal);
  await persistProgress(goal, progress);
  res.json(progress);
}));

module.exports = router;
