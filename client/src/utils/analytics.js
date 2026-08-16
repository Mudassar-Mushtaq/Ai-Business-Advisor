// Lightweight client-side analytics helpers — no extra deps.

/**
 * Detect anomalies in a daily revenue series using a rolling z-score.
 * @param {Array<{_id:string,totalRevenue:number,totalQuantity?:number}>} trend
 * @param {{ window?: number, threshold?: number }} opts
 * @returns Array of anomaly records with severity + delta
 */
export function detectRevenueAnomalies(trend, { window = 7, threshold = 2.2 } = {}) {
  if (!trend || trend.length < window + 1) return [];
  const anomalies = [];

  for (let i = window; i < trend.length; i++) {
    const slice = trend.slice(i - window, i).map(d => d.totalRevenue || 0);
    const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length;
    const std = Math.sqrt(variance);
    const value = trend[i].totalRevenue || 0;
    const z = std === 0 ? 0 : (value - mean) / std;

    if (Math.abs(z) >= threshold) {
      const direction = z > 0 ? 'spike' : 'drop';
      const pct = mean === 0 ? 0 : ((value - mean) / mean) * 100;
      anomalies.push({
        date: trend[i]._id,
        value,
        mean,
        z: Number(z.toFixed(2)),
        direction,
        pct: Number(pct.toFixed(1)),
        severity: Math.abs(z) >= 3 ? 'critical' : 'warning',
      });
    }
  }
  return anomalies;
}

/**
 * Compute days-of-stock-left and reorder recommendations.
 * @param {Array} inventory  inventory items (with stock, reorderLevel, ...)
 * @param {Array} forecasts  forecasts (with product + forecastedSales for 30d)
 * @param {number} leadTimeDays
 */
export function computeReorderRecommendations(inventory, forecasts, leadTimeDays = 7) {
  if (!inventory || inventory.length === 0) return [];
  const dailyByProduct = {};
  (forecasts || []).forEach(f => {
    const days = parseInt(f.period) || (f.dailyBreakdown?.length) || 30;
    const daily = (f.forecastedSales || 0) / Math.max(1, days);
    if (daily > 0) dailyByProduct[f.product?.toLowerCase()] = daily;
  });

  return inventory
    .map(item => {
      const key = item.product?.toLowerCase();
      const dailyDemand = dailyByProduct[key] || 0;
      const daysLeft = dailyDemand > 0 ? item.stock / dailyDemand : Infinity;
      const safetyStock = Math.ceil(dailyDemand * leadTimeDays * 1.25);
      const suggestedQty = Math.max(0, Math.ceil(dailyDemand * (leadTimeDays * 2)) - item.stock + safetyStock);

      let severity = null;
      if (item.stock <= 0) severity = 'critical';
      else if (dailyDemand > 0 && daysLeft < leadTimeDays) severity = 'critical';
      else if (item.stock <= (item.reorderLevel || 10)) severity = 'warning';
      else if (dailyDemand > 0 && daysLeft < leadTimeDays * 2) severity = 'info';

      return {
        product: item.product,
        category: item.category,
        stock: item.stock,
        unit: item.unit || 'units',
        reorderLevel: item.reorderLevel || 0,
        dailyDemand: Number(dailyDemand.toFixed(2)),
        daysLeft: dailyDemand > 0 ? Number(daysLeft.toFixed(1)) : null,
        suggestedQty,
        severity,
      };
    })
    .filter(r => r.severity)
    .sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
      return (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity);
    });
}

/**
 * Add P10/P50/P90 confidence band to a forecast daily breakdown.
 * Uses standardDeviation if provided, otherwise derives a band from confidence%.
 */
export function withConfidenceBand(daily = [], { confidence = 70, std } = {}) {
  if (!daily || daily.length === 0) return [];
  // Lower confidence → wider band. Map 95→±10%, 50→±35%.
  const spread = std ? null : Math.max(0.08, (100 - confidence) / 100 * 0.6 + 0.08);

  return daily.map(d => {
    const q = d.quantity || 0;
    const sigma = std != null ? std : q * spread;
    return {
      ...d,
      p10: Math.max(0, q - 1.28 * sigma),
      p50: q,
      p90: q + 1.28 * sigma,
      bandLow: Math.max(0, q - 1.28 * sigma),
      bandRange: 2 * 1.28 * sigma,
    };
  });
}
