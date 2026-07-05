const OpenAI = require('openai');
const Brief = require('../models/Brief');
const SalesData = require('../models/SalesData');
const InventoryItem = require('../models/InventoryItem');
const Forecast = require('../models/Forecast');
const Goal = require('../models/Goal');
const User = require('../models/User');

const { computeAllForUser } = require('./goalService');
const email = require('./notifications/email');
const slack = require('./notifications/slack');

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_BULLETS = 3;
const MAX_BULLETS = 5;

let openaiClient = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_API_BASE || undefined
    });
  }
  return openaiClient;
}

// ---------- Time helpers ----------

// Returns the start (Monday 00:00) of the ISO week containing `now`, expressed in UTC.
// Timezone is honored for the boundary calculation; the result is still a UTC Date.
function startOfWeek(now = new Date(), timezone = 'UTC') {
  // Get the calendar weekday in the user's timezone.
  let dow = 0;
  try {
    const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone }).format(now);
    dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dayName);
    if (dow < 0) dow = now.getUTCDay();
  } catch {
    dow = now.getUTCDay();
  }
  const daysSinceMonday = (dow + 6) % 7; // Mon=0, Sun=6
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function endOfWeek(start) {
  return new Date(start.getTime() + 7 * DAY_MS - 1);
}

// ---------- Context collection ----------

async function aggregateBucket(userId, gte, lt) {
  const [row] = await SalesData.aggregate([
    { $match: { userId, date: { $gte: gte, $lt: lt } } },
    { $group: {
      _id: null,
      revenue: { $sum: '$revenue' },
      cost:    { $sum: '$cost' },
      orders:  { $sum: 1 },
      units:   { $sum: '$quantity' },
    } },
  ]);
  return row || { revenue: 0, cost: 0, orders: 0, units: 0 };
}

function pctChange(curr, prev) {
  if (!prev || prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

async function topMovers(userId, currStart, currEnd, prevStart, prevEnd) {
  const [curr, prev] = await Promise.all([
    SalesData.aggregate([
      { $match: { userId, date: { $gte: currStart, $lt: currEnd } } },
      { $group: { _id: '$product', revenue: { $sum: '$revenue' }, units: { $sum: '$quantity' } } },
    ]),
    SalesData.aggregate([
      { $match: { userId, date: { $gte: prevStart, $lt: prevEnd } } },
      { $group: { _id: '$product', revenue: { $sum: '$revenue' }, units: { $sum: '$quantity' } } },
    ]),
  ]);
  const prevMap = Object.fromEntries(prev.map((p) => [p._id, p.revenue]));
  const merged = curr.map((c) => {
    const prevRev = prevMap[c._id] || 0;
    return {
      product: c._id,
      revenue: Math.round(c.revenue),
      units: c.units,
      delta: Math.round(c.revenue - prevRev),
      pct: pctChange(c.revenue, prevRev),
    };
  });
  merged.sort((a, b) => b.delta - a.delta);
  const gainers = merged.filter((m) => m.delta > 0).slice(0, 3);
  const losers  = merged.filter((m) => m.delta < 0).slice(-3).reverse();
  return { gainers, losers };
}

async function lowStockSnapshot(userId) {
  const items = await InventoryItem.find({
    userId,
    $expr: { $lte: ['$stock', '$reorderLevel'] },
  }).limit(8).lean();
  return items.map((i) => ({
    product: i.product,
    stock: i.stock,
    reorderLevel: i.reorderLevel,
    unit: i.unit || 'units',
  }));
}

async function projectedStockouts(userId) {
  const [items, forecasts] = await Promise.all([
    InventoryItem.find({ userId, stock: { $gt: 0 } }).lean(),
    Forecast.find({ userId }).select('product forecastedSales').lean(),
  ]);
  const fmap = Object.fromEntries(forecasts.map((f) => [f.product, f.forecastedSales]));
  const out = [];
  for (const it of items) {
    const monthly = fmap[it.product];
    if (!monthly || monthly <= 0) continue;
    const dailyDemand = monthly / 30;
    const days = Math.floor(it.stock / dailyDemand);
    if (days <= 14) out.push({ product: it.product, days, stock: it.stock });
  }
  out.sort((a, b) => a.days - b.days);
  return out.slice(0, 5);
}

async function collectWeeklyContext(userId, weekStart, weekEnd) {
  const prevStart = new Date(weekStart.getTime() - 7 * DAY_MS);
  const prevEnd   = weekStart;

  const [curr, prev, mover, lowStock, stockouts, goalsProgress, salesCount] = await Promise.all([
    aggregateBucket(userId, weekStart, weekEnd),
    aggregateBucket(userId, prevStart, prevEnd),
    topMovers(userId, weekStart, weekEnd, prevStart, prevEnd),
    lowStockSnapshot(userId),
    projectedStockouts(userId),
    computeAllForUser(userId, { onlyActive: true }).catch(() => []),
    SalesData.countDocuments({ userId }),
  ]);

  const profit     = (curr.revenue || 0) - (curr.cost || 0);
  const prevProfit = (prev.revenue || 0) - (prev.cost || 0);

  const dataSufficient = curr.orders >= 3 || salesCount >= 10;

  return {
    weekStart,
    weekEnd,
    dataSufficient,
    metrics: {
      revenue:       Math.round(curr.revenue || 0),
      revenueDeltaPct: pctChange(curr.revenue || 0, prev.revenue || 0),
      orders:        curr.orders || 0,
      ordersDeltaPct:  pctChange(curr.orders, prev.orders),
      units:         curr.units || 0,
      profit:        Math.round(profit),
      profitDeltaPct:  pctChange(profit, prevProfit),
      previous: {
        revenue: Math.round(prev.revenue || 0),
        orders:  prev.orders || 0,
        units:   prev.units || 0,
        profit:  Math.round(prevProfit),
      },
    },
    topGainers: mover.gainers,
    topLosers:  mover.losers,
    lowStock,
    projectedStockouts: stockouts,
    goals: goalsProgress.map((g) => ({
      label: g.label,
      metric: g.metric,
      percent: g.percent,
      paceTargetPercent: g.paceTargetPercent,
      onTrack: g.onTrack,
      daysLeft: g.daysLeft,
      target: g.target,
      current: g.current,
    })),
  };
}

// ---------- LLM call ----------

const BRIEF_SCHEMA = {
  name: 'weekly_brief',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['headline', 'bullets'],
    properties: {
      headline: { type: 'string', maxLength: 160 },
      bullets: {
        type: 'array',
        minItems: MIN_BULLETS,
        maxItems: MAX_BULLETS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'text'],
          properties: {
            kind: { type: 'string', enum: ['win', 'risk', 'anomaly', 'recommendation', 'goal', 'info'] },
            text: { type: 'string', maxLength: 320 },
          },
        },
      },
    },
  },
};

function fallbackBrief(context, reason) {
  // Used when LLM is unavailable or data is too thin. Keeps the feature working.
  const m = context.metrics;
  const fmt = (n) => n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${Math.round(n)}`;
  const bullets = [];

  if (!context.dataSufficient) {
    return {
      headline: 'Not enough activity this week to summarize.',
      bullets: [{
        kind: 'info',
        text: 'We need a few more days of sales data — upload a CSV or connect a source to start receiving real briefs.',
      }],
    };
  }

  bullets.push({
    kind: m.revenueDeltaPct >= 0 ? 'win' : 'risk',
    text: `Revenue this week: ${fmt(m.revenue)} (${m.revenueDeltaPct >= 0 ? '+' : ''}${m.revenueDeltaPct}% vs last week).`,
  });
  if (context.topGainers[0]) {
    bullets.push({
      kind: 'win',
      text: `Biggest gainer: ${context.topGainers[0].product} (+${fmt(context.topGainers[0].delta)}).`,
    });
  }
  if (context.projectedStockouts[0]) {
    const s = context.projectedStockouts[0];
    bullets.push({
      kind: 'risk',
      text: `${s.product} projected to stock out in ~${s.days} day(s) at current demand.`,
    });
  }
  if (context.goals[0]) {
    const g = context.goals[0];
    bullets.push({
      kind: 'goal',
      text: `Goal "${g.label}" is at ${g.percent}% with ${g.daysLeft} day(s) left — ${g.onTrack ? 'on track' : 'behind pace'}.`,
    });
  }
  while (bullets.length < MIN_BULLETS) {
    bullets.push({ kind: 'info', text: `${m.orders} orders processed this week.` });
  }

  return {
    headline: m.revenueDeltaPct >= 0
      ? `Revenue up ${m.revenueDeltaPct}% this week.`
      : `Revenue down ${Math.abs(m.revenueDeltaPct)}% this week — worth investigating.`,
    bullets: bullets.slice(0, MAX_BULLETS),
    fallbackReason: reason,
  };
}

async function generateNarrative(context) {
  if (!context.dataSufficient) return fallbackBrief(context, 'insufficient_data');

  const client = getClient();
  if (!client) return fallbackBrief(context, 'no_openai_key');

  const systemPrompt = `You are an experienced business analyst writing the executive summary of a single week.
Style:
- Concrete numbers from the provided data, never made up.
- Punchy. Each bullet a single sentence, ideally <25 words.
- Mix of: a clear win, a real risk, a forward-looking recommendation, and a goal-progress note when goals exist.
- Headline is one short line capturing the week's main story.
- Choose the "kind" tag honestly. "anomaly" only if metrics are far outside their week-on-week norm.`;

  const userPayload = {
    week: {
      start: context.weekStart.toISOString(),
      end:   context.weekEnd.toISOString(),
    },
    metrics: context.metrics,
    topGainers: context.topGainers,
    topLosers:  context.topLosers,
    lowStock:   context.lowStock,
    projectedStockouts: context.projectedStockouts,
    goals: context.goals,
  };

  try {
    const response = await client.chat.completions.create({
      model: process.env.BRIEF_MODEL || 'gpt-4o-mini',
      temperature: 0.5,
      max_tokens: 700,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate this week\'s brief from the data below. Return JSON only.\n\n' + JSON.stringify(userPayload) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: BRIEF_SCHEMA,
      },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error('Empty LLM response');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.bullets) || parsed.bullets.length < MIN_BULLETS) {
      throw new Error('LLM returned too few bullets');
    }
    return { headline: parsed.headline, bullets: parsed.bullets };
  } catch (err) {
    console.warn('[brief] LLM generation failed, using fallback:', err.message);
    return fallbackBrief(context, `llm_error: ${err.message.slice(0, 100)}`);
  }
}

// ---------- Persistence + delivery ----------

async function generateBrief(userId, { trigger = 'scheduled', timezone, weekStart: weekStartOverride } = {}) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found.');

  const tz = timezone || user.briefSettings?.timezone || 'UTC';
  const weekStart = weekStartOverride
    ? new Date(weekStartOverride)
    : startOfWeek(new Date(), tz);
  const weekEnd = endOfWeek(weekStart);

  // Race-safe: if a brief for this week already exists, return it instead of regenerating.
  const existing = await Brief.findOne({ userId, weekStart });
  if (existing && existing.status === 'ready' && trigger === 'scheduled') {
    return existing;
  }

  const context = await collectWeeklyContext(userId, weekStart, weekEnd);
  const narrative = await generateNarrative(context);

  // Upsert with idempotency: { userId, weekStart } unique index protects us if two
  // workers race. We use findOneAndUpdate(upsert) so manual re-runs replace.
  const brief = await Brief.findOneAndUpdate(
    { userId, weekStart },
    {
      userId, weekStart, weekEnd,
      headline: narrative.headline,
      bullets: narrative.bullets,
      context,
      status: 'ready',
      error: null,
      trigger,
      generatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return brief;
}

async function deliverBrief(brief, user) {
  const settings = user.briefSettings || {};
  const channels = (settings.channels || ['in_app']).filter(Boolean);
  const delivered = [];

  // In-app is implicit — the Brief document is the in-app artifact.
  if (channels.includes('in_app')) delivered.push('in_app');

  if (channels.includes('email')) {
    try {
      const to = settings.emailOverride || user.email;
      const result = await email.send({
        to,
        subject: `Your weekly business brief · ${brief.weekStart.toISOString().slice(0, 10)}`,
        headline: brief.headline,
        bullets:  brief.bullets,
        weekStart: brief.weekStart,
        weekEnd:   brief.weekEnd,
        userName:  user.name,
      });
      if (result.ok) delivered.push('email');
    } catch (err) {
      console.warn('[brief] email delivery failed:', err.message);
    }
  }

  if (channels.includes('slack')) {
    try {
      const webhookUrl = user.get('slackWebhook');
      if (webhookUrl) {
        await slack.send({
          webhookUrl,
          headline: brief.headline,
          bullets:  brief.bullets,
          weekStart: brief.weekStart,
          weekEnd:   brief.weekEnd,
        });
        delivered.push('slack');
      }
    } catch (err) {
      console.warn('[brief] slack delivery failed:', err.message);
    }
  }

  brief.deliveredVia = delivered;
  await brief.save();

  if (delivered.length) {
    user.briefSettings.lastDeliveredAt = new Date();
    await user.save();
  }

  return delivered;
}

async function generateAndDeliver(userId, opts = {}) {
  const brief = await generateBrief(userId, opts);
  const user = await User.findById(userId);
  const delivered = await deliverBrief(brief, user);
  return { brief, delivered };
}

module.exports = {
  generateBrief,
  deliverBrief,
  generateAndDeliver,
  collectWeeklyContext,
  startOfWeek,
  endOfWeek,
};
