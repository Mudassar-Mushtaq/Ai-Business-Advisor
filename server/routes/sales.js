const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../middleware/asyncHandler');
const SalesData = require('../models/SalesData');
const cache = require('../config/cache');
const { getSalesInsights } = require('../services/analysisService');
const escapeRegex = require('../utils/escapeRegex');

// GET /api/sales?page=1&limit=20&product=&startDate=&endDate=
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, product, startDate, endDate, category } = req.query;
  const query = { userId: req.user._id };

  if (product) query.product = { $regex: escapeRegex(product), $options: 'i' };
  if (category) query.category = { $regex: escapeRegex(category), $options: 'i' };
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [data, total] = await Promise.all([
    SalesData.find(query).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    SalesData.countDocuments(query),
  ]);

  res.json({ data, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
}));

// GET /api/sales/insights — cached 5 min
router.get('/insights', requireAuth, asyncHandler(async (req, res) => {
  const key = `sales:${req.user._id}:insights`;
  const insights = await cache.wrap(key, 300, () => getSalesInsights(req.user._id));
  res.json(insights);
}));

// GET /api/sales/trend?period=30 — cached 5 min
router.get('/trend', requireAuth, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.period || 30);
  const key = `sales:${req.user._id}:trend:${days}`;

  const trend = await cache.wrap(key, 300, async () => {
    const latestDoc = await SalesData.findOne({ userId: req.user._id })
      .sort({ date: -1 })
      .select('date')
      .lean();

    const anchorDate = latestDoc ? new Date(latestDoc.date) : new Date();
    const since = new Date(anchorDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    since.setHours(0, 0, 0, 0);

    return SalesData.aggregate([
      { $match: { userId: req.user._id, date: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          totalRevenue: { $sum: '$revenue' },
          totalQuantity: { $sum: '$quantity' },
          count: { $sum: 1 },
        }
      },
      { $sort: { _id: 1 } }
    ]);
  });

  res.json(trend);
}));


// GET /api/sales/products — cached 5 min
router.get('/products', requireAuth, asyncHandler(async (req, res) => {
  const key = `sales:${req.user._id}:products`;
  const products = await cache.wrap(key, 300, () =>
    SalesData.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: '$product',
          totalRevenue: { $sum: '$revenue' },
          totalQuantity: { $sum: '$quantity' },
          category: { $first: '$category' },
          lastSold: { $max: '$date' },
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 20 }
    ])
  );
  res.json(products);
}));

// GET /api/sales/categories — cached 5 min
router.get('/categories', requireAuth, asyncHandler(async (req, res) => {
  const key = `sales:${req.user._id}:categories`;
  const cats = await cache.wrap(key, 300, () =>
    SalesData.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: '$category',
          totalRevenue: { $sum: '$revenue' },
          totalQuantity: { $sum: '$quantity' },
        }
      },
      { $sort: { totalRevenue: -1 } }
    ])
  );
  res.json(cats);
}));

module.exports = router;
