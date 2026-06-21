const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../middleware/asyncHandler');
const Connector = require('../models/Connector');
const googleSheets = require('../services/connectors/googleSheets');
const { runSync } = require('../services/connectors/syncRunner');

const router = express.Router();

// GET /api/connectors — list the current user's connectors
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const connectors = await Connector.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .lean({ virtuals: false });
  // Strip the encrypted blob
  connectors.forEach((c) => { delete c.credentialsEnc; });
  res.json({ connectors });
}));

// POST /api/connectors/google_sheets/connect — returns the Google OAuth URL
// `state` carries the userId so the unauthenticated callback can attribute it.
router.post('/google_sheets/connect', requireAuth, asyncHandler(async (req, res) => {
  const url = googleSheets.getAuthUrl(String(req.user._id));
  res.json({ url });
}));

// GET /api/connectors/google_sheets/callback — Google redirects the user here.
// This route is *not* requireAuth — it's hit by the user's browser after Google's redirect,
// without our Firebase token. We trust `state` which we issued ourselves.
router.get('/google_sheets/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  if (error) return res.redirect(`${clientUrl}/connections?status=error&reason=${encodeURIComponent(error)}`);
  if (!code || !state) return res.redirect(`${clientUrl}/connections?status=error&reason=missing_code`);

  try {
    const tokens = await googleSheets.exchangeCode(code);

    await Connector.findOneAndUpdate(
      { userId: state, provider: 'google_sheets' },
      {
        $set: {
          userId: state,
          provider: 'google_sheets',
          status: 'connected',
          credentialsEnc: undefined, // overwritten via virtual setter below
          lastError: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Save creds via the virtual (handles encryption)
    const connector = await Connector.findOne({ userId: state, provider: 'google_sheets' });
    connector.credentials = tokens;
    await connector.save();

    res.redirect(`${clientUrl}/connections?status=connected&provider=google_sheets`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect(`${clientUrl}/connections?status=error&reason=${encodeURIComponent(err.message)}`);
  }
});

// PUT /api/connectors/:id/config — set sheetId / range / interval
router.put('/:id/config', requireAuth, asyncHandler(async (req, res) => {
  const { sheetId, range, intervalMinutes, label } = req.body || {};
  const connector = await Connector.findOne({ _id: req.params.id, userId: req.user._id });
  if (!connector) return res.status(404).json({ error: 'Connector not found' });

  connector.config = { ...connector.config, sheetId, range: range || 'A:Z' };
  if (typeof intervalMinutes === 'number' && intervalMinutes >= 5) {
    connector.intervalMinutes = intervalMinutes;
  }
  if (typeof label === 'string') connector.label = label;
  await connector.save();
  res.json({ connector: connector.toJSON() });
}));

// GET /api/connectors/:id/describe — preview sheet metadata (so the user can pick a tab)
router.get('/:id/describe', requireAuth, asyncHandler(async (req, res) => {
  const { sheetId } = req.query;
  const connector = await Connector.findOne({ _id: req.params.id, userId: req.user._id });
  if (!connector) return res.status(404).json({ error: 'Connector not found' });
  if (!sheetId) return res.status(400).json({ error: 'sheetId is required' });

  const meta = await googleSheets.describeSheet(connector.credentials, sheetId);
  if (meta.credentials) {
    connector.credentials = meta.credentials;
    await connector.save();
  }
  res.json({ title: meta.title, tabs: meta.tabs });
}));

// POST /api/connectors/:id/sync — manual trigger
router.post('/:id/sync', requireAuth, asyncHandler(async (req, res) => {
  const connector = await Connector.findOne({ _id: req.params.id, userId: req.user._id });
  if (!connector) return res.status(404).json({ error: 'Connector not found' });
  if (!connector.config?.sheetId) {
    return res.status(400).json({ error: 'Connector has no sheetId configured. Set one first.' });
  }

  const result = await runSync(connector._id);
  res.json({ message: 'Sync complete', ...result });
}));

// DELETE /api/connectors/:id — disconnect (does NOT delete the imported sales rows)
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const connector = await Connector.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!connector) return res.status(404).json({ error: 'Connector not found' });
  res.json({ message: 'Connector disconnected' });
}));

module.exports = router;
