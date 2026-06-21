const Goal = require('../models/Goal');
const SalesData = require('../models/SalesData');
const InventoryItem = require('../models/InventoryItem');
const Alert = require('../models/Alert');

const DAY_MS = 24 * 60 * 60 * 1000;

function clampPercent(p) {
  if (!Number.isFinite(p)) return 0;
  if (p < 0) return 0;
  if (p > 999) return 999;
  return Math.round(p * 10) / 10;
}

// Window helpers — the goal's start/end define the scope of all aggregations.
function buildSalesMatch(goal) {
  const m = {
    userId: goal.userId,
    date: { $gte: goal.startDate, $lte: goal.endDate },
  };
  if (goal.productFilter) m.product = goal.productFilter;
  return m;
}

async function aggregateOne(match, group) {
  const [row] = await SalesData.aggregate([{ $match: match }, { $group: group }]);
  return row || {};
}

/**
 * Compute the live progress for a goal. Returns a normalized payload the API and
 * the alert pipeline can both consume.
 *
 * For the `stockouts_max` metric `target` is an upper bound (we want to stay below it),
 * so the on-track logic is inverted.
 */
async function computeProgress(goal) {
  const now = new Date();
  const totalMs = Math.max(1, goal.endDate - goal.startDate);
  const elapsedMs = Math.max(0, Math.min(totalMs, now - goal.startDate));
  const elapsedFraction = elapsedMs / totalMs;
  const daysLeft = Math.max(0, Math.ceil((goal.endDate - now) / DAY_MS));

  let current = 0;

  switch (goal.metric) {
    case 'revenue':
    case 'product_revenue': {
      const r = await aggregateOne(buildSalesMatch(goal), { _id: null, sum: { $sum: '$revenue' } });
      current = r.sum || 0;
      break;
    }
    case 'orders': {
      const r = await aggregateOne(buildSalesMatch(goal), { _id: null, sum: { $sum: 1 } });
      current = r.sum || 0;
      break;
    }
    case 'units': {
      const r = await aggregateOne(buildSalesMatch(goal), { _id: null, sum: { $sum: '$quantity' } });
      current = r.sum || 0;
      break;
    }
    case 'profit': {
      const r = await aggregateOne(buildSalesMatch(goal), {
        _id: null,
        revenue: { $sum: '$revenue' },
        cost:    { $sum: '$cost' },
      });
      current = (r.revenue || 0) - (r.cost || 0);
      break;
    }
    case 'stockouts_max': {
      // Count distinct products currently at or below zero stock.
      const items = await InventoryItem.find({
        userId: goal.userId,
        stock: { $lte: 0 },
      }).countDocuments();
      current = items;
      break;
    }
    default:
      current = 0;
  }

  const inverted = goal.metric === 'stockouts_max';
  const targetSafe = goal.target || (inverted ? 1 : 1);
  const percent = inverted
    ? clampPercent(((targetSafe - current) / targetSafe) * 100) // higher % = doing better
    : clampPercent((current / targetSafe) * 100);

  // Pace: how much progress should we have made by now to land on target?
  const paceTargetPercent = clampPercent(elapsedFraction * 100);
  const onTrack = inverted
    ? current <= goal.target
    : percent >= paceTargetPercent - 10; // 10pt tolerance for noise

  // Project end-of-period landing using current pace (not used for `inverted`).
  const projected = inverted
    ? current
    : (elapsedFraction > 0.05 ? current / elapsedFraction : null);

  let status = goal.status;
  if (status === 'active') {
    if (inverted) {
      if (now >= goal.endDate && current <= goal.target) status = 'achieved';
      else if (now >= goal.endDate && current > goal.target) status = 'missed';
    } else {
      if (current >= goal.target) status = 'achieved';
      else if (now >= goal.endDate) status = 'missed';
    }
  }

  return {
    goalId: goal._id,
    label: goal.label,
    metric: goal.metric,
    target: goal.target,
    current,
    percent,
    paceTargetPercent,
    onTrack,
    inverted,
    daysLeft,
    elapsedFraction: Math.round(elapsedFraction * 1000) / 1000,
    projected: projected != null ? Math.round(projected * 100) / 100 : null,
    status,
    period: goal.period,
    startDate: goal.startDate,
    endDate: goal.endDate,
    productFilter: goal.productFilter,
  };
}

async function computeAllForUser(userId, { onlyActive = true } = {}) {
  const filter = { userId };
  if (onlyActive) filter.status = 'active';
  const goals = await Goal.find(filter).sort({ endDate: 1 }).lean();
  return Promise.all(goals.map((g) => computeProgress(g)));
}

/**
 * Persist live progress + status onto the Goal document so the list view doesn't
 * require recomputation. Idempotent.
 */
async function persistProgress(goalDoc, progress) {
  goalDoc.lastEvaluatedAt = new Date();
  goalDoc.lastProgress = progress.percent;
  if (progress.status !== goalDoc.status) goalDoc.status = progress.status;
  await goalDoc.save();
}

/**
 * Generate Alert records for goals that have just slipped off-track or just landed.
 * Called from runAlertPipeline. Dedupes within 48h on (type, productFilter, label).
 */
async function checkGoalAlerts(userId) {
  const goals = await Goal.find({ userId, status: 'active' });
  const created = [];
  const now = new Date();

  for (const goal of goals) {
    const progress = await computeProgress(goal);
    await persistProgress(goal, progress);

    if (progress.status === 'achieved') {
      const dupe = await Alert.findOne({
        userId, type: 'goal_achieved', product: goal.label,
        createdAt: { $gte: new Date(Date.now() - 7 * DAY_MS) },
      });
      if (!dupe) {
        const alert = await Alert.create({
          userId,
          type: 'goal_achieved',
          severity: 'info',
          title: `Goal hit: ${goal.label}`,
          message: `You've reached ${progress.percent}% of "${goal.label}" (${progress.current} / ${goal.target}). Nice work.`,
          product: goal.label,
          value: progress.percent,
        });
        created.push(alert);
      }
      continue;
    }

    // Off-track only matters mid-period and only if the gap is meaningful.
    if (
      progress.status === 'active' &&
      !progress.onTrack &&
      progress.daysLeft > 1 &&
      progress.elapsedFraction > 0.15
    ) {
      const dupe = await Alert.findOne({
        userId, type: 'goal_off_track', product: goal.label,
        createdAt: { $gte: new Date(Date.now() - 2 * DAY_MS) },
      });
      if (!dupe) {
        const gap = Math.max(0, progress.paceTargetPercent - progress.percent);
        const alert = await Alert.create({
          userId,
          type: 'goal_off_track',
          severity: gap >= 30 ? 'critical' : 'warning',
          title: `Off track: ${goal.label}`,
          message: `At ${progress.percent}% of target with ${progress.daysLeft} day(s) left. Pace would expect ${progress.paceTargetPercent}%.`,
          product: goal.label,
          value: progress.percent,
        });
        created.push(alert);
      }
    }

  }

  return created;
}

module.exports = {
  computeProgress,
  computeAllForUser,
  persistProgress,
  checkGoalAlerts,
};
