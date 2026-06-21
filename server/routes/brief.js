const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../middleware/asyncHandler');
const Brief = require('../models/Brief');
const User = require('../models/User');
const { generateAndDeliver } = require('../services/briefService');
const email = require('../services/notifications/email');
const slack = require('../services/notifications/slack');

const VALID_CHANNELS = ['in_app', 'email', 'slack'];

function serializeSettings(user) {
  const s = user.briefSettings || {};
  return {
    enabled:         Boolean(s.enabled),
    channels:        Array.isArray(s.channels) ? s.channels : ['in_app'],
    dayOfWeek:       Number(s.dayOfWeek ?? 1),
    hour:            Number(s.hour ?? 8),
    timezone:        s.timezone || 'UTC',
    emailOverride:   s.emailOverride || '',
    slackConfigured: Boolean(s.slackWebhookEnc),
    lastDeliveredAt: s.lastDeliveredAt || null,
  };
}

// GET /api/brief — list recent briefs
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
  const briefs = await Brief.find({ userId: req.user._id })
    .sort({ weekStart: -1 })
    .limit(limit)
    .lean();
  res.json(briefs);
}));

// GET /api/brief/latest — most recent brief or null
router.get('/latest', requireAuth, asyncHandler(async (req, res) => {
  const brief = await Brief.findOne({ userId: req.user._id }).sort({ weekStart: -1 }).lean();
  res.json(brief || null);
}));

// GET /api/brief/settings
router.get('/settings', requireAuth, asyncHandler(async (req, res) => {
  res.json(serializeSettings(req.user));
}));

// PUT /api/brief/settings
router.put('/settings', requireAuth, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user.briefSettings) user.briefSettings = {};
  const s = user.briefSettings;

  if (req.body.enabled !== undefined)   s.enabled = Boolean(req.body.enabled);
  if (Array.isArray(req.body.channels)) {
    const cleaned = req.body.channels.filter((c) => VALID_CHANNELS.includes(c));
    s.channels = cleaned.length ? cleaned : ['in_app'];
  }
  if (req.body.dayOfWeek !== undefined) {
    const v = Number(req.body.dayOfWeek);
    if (Number.isInteger(v) && v >= 0 && v <= 6) s.dayOfWeek = v;
  }
  if (req.body.hour !== undefined) {
    const v = Number(req.body.hour);
    if (Number.isInteger(v) && v >= 0 && v <= 23) s.hour = v;
  }
  if (typeof req.body.timezone === 'string' && req.body.timezone.trim()) {
    s.timezone = req.body.timezone.trim();
  }
  if (req.body.emailOverride !== undefined) {
    s.emailOverride = String(req.body.emailOverride || '').trim();
  }
  if (req.body.slackWebhook !== undefined) {
    // null / '' clears it; anything else encrypts and stores it
    user.set('slackWebhook', req.body.slackWebhook || null);
  }

  await user.save();
  res.json(serializeSettings(user));
}));

// POST /api/brief/generate-now — manual trigger
router.post('/generate-now', requireAuth, asyncHandler(async (req, res) => {
  const result = await generateAndDeliver(req.user._id, { trigger: 'manual' });
  res.json({
    brief: result.brief,
    delivered: result.delivered,
  });
}));

// POST /api/brief/settings/test — fire a test message on a single channel
router.post('/settings/test', requireAuth, asyncHandler(async (req, res) => {
  const channel = req.body.channel;
  if (!VALID_CHANNELS.includes(channel)) {
    return res.status(400).json({ error: `channel must be one of: ${VALID_CHANNELS.join(', ')}` });
  }

  const sample = {
    headline: 'This is a test brief — your delivery channel is working.',
    bullets: [
      { kind: 'info',           text: 'Channel: ' + channel + '. If you can read this, you\'re wired up.' },
      { kind: 'win',            text: 'You\'ll receive real briefs once per week with your business\'s actual numbers.' },
      { kind: 'recommendation', text: 'You can change the day/time and channels at any time on the Briefs page.' },
    ],
    weekStart: new Date(),
    weekEnd: new Date(),
  };

  if (channel === 'email') {
    const to = req.user.briefSettings?.emailOverride || req.user.email;
    const result = await email.send({
      to,
      subject: 'Test · AI Business Advisor weekly brief',
      ...sample,
      userName: req.user.name,
    });
    return res.json({ ok: !result.skipped, ...result });
  }

  if (channel === 'slack') {
    const webhookUrl = req.user.get('slackWebhook');
    if (!webhookUrl) return res.status(400).json({ error: 'No Slack webhook configured.' });
    await slack.send({ webhookUrl, ...sample });
    return res.json({ ok: true });
  }

  // in_app — nothing to send, just confirm the path is reachable
  return res.json({ ok: true, info: 'In-app delivery is implicit — briefs always appear here.' });
}));

module.exports = router;
