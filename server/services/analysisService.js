const SalesData = require('../models/SalesData');

/**
 * Comprehensive sales insights via MongoDB aggregation pipelines
 */
async function getSalesInsights(userId) {
  const [summary, topProducts, monthlyTrend, categoryBreakdown, recentGrowth] = await Promise.all([
    // Overall summary
    SalesData.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$revenue' },
          totalQuantity: { $sum: '$quantity' },
          totalOrders: { $sum: 1 },
          avgOrderValue: { $avg: '$revenue' },
          totalCost: { $sum: '$cost' },
        }
      }
    ]),

    // Top 10 products by revenue
    SalesData.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: '$product',
          totalRevenue: { $sum: '$revenue' },
          totalQuantity: { $sum: '$quantity' },
          totalOrders: { $sum: 1 },
          avgPrice: { $avg: '$revenue' },
          category: { $first: '$category' },
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 }
    ]),

    // Monthly revenue trend (last 12 months)
    SalesData.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' } },
          totalRevenue: { $sum: '$revenue' },
          totalQuantity: { $sum: '$quantity' },
          totalOrders: { $sum: 1 },
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 }
    ]),

    // Category breakdown
    SalesData.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: '$category',
          totalRevenue: { $sum: '$revenue' },
          totalQuantity: { $sum: '$quantity' },
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]),

    // Month-over-month growth
    SalesData.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
          revenue: { $sum: '$revenue' },
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 2 }
    ])
  ]);

  const s = summary[0] || { totalRevenue: 0, totalQuantity: 0, totalOrders: 0, avgOrderValue: 0, totalCost: 0 };
  const grossProfit = s.totalRevenue - s.totalCost;
  const profitMargin = s.totalRevenue > 0 ? ((grossProfit / s.totalRevenue) * 100).toFixed(1) : 0;

  // Compute MoM growth
  let momGrowth = 0;
  if (recentGrowth.length === 2) {
    const [current, previous] = recentGrowth;
    if (previous.revenue > 0) {
      momGrowth = (((current.revenue - previous.revenue) / previous.revenue) * 100).toFixed(1);
    }
  }

  return {
    summary: {
      totalRevenue: s.totalRevenue,
      totalQuantity: s.totalQuantity,
      totalOrders: s.totalOrders,
      avgOrderValue: s.avgOrderValue,
      grossProfit,
      profitMargin: parseFloat(profitMargin),
      momGrowth: parseFloat(momGrowth),
    },
    topProducts,
    monthlyTrend: monthlyTrend.map(m => ({
      period: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
      revenue: m.totalRevenue,
      quantity: m.totalQuantity,
      orders: m.totalOrders,
    })),
    categoryBreakdown,
  };
}

module.exports = { getSalesInsights };
