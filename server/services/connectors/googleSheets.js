const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];

function requireEnv() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error(
      'Google OAuth env vars missing. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.'
    );
  }
  return { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI };
}

function makeOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = requireEnv();
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

// Build the URL the user is redirected to in order to grant access.
// `state` carries the userId so the callback can attribute the connection.
function getAuthUrl(state) {
  const oauth2 = makeOAuthClient();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force refresh_token on every connect
    scope: SCOPES,
    state,
  });
}

// Exchange the auth code for { access_token, refresh_token, expiry_date }.
async function exchangeCode(code) {
  const oauth2 = makeOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

// Build an authed client from stored credentials, refreshing if needed.
// Returns the (possibly updated) credentials so the caller can persist them.
async function getAuthedClient(credentials) {
  const oauth2 = makeOAuthClient();
  oauth2.setCredentials(credentials);

  let updated = credentials;
  oauth2.on('tokens', (t) => {
    updated = { ...updated, ...t };
  });

  // Force-refresh if the token has expired
  if (credentials.expiry_date && credentials.expiry_date < Date.now() + 60_000) {
    const { credentials: fresh } = await oauth2.refreshAccessToken();
    oauth2.setCredentials(fresh);
    updated = fresh;
  }

  return { client: oauth2, credentials: updated };
}

// Parse the row using the same heuristic as routes/upload.js so the sheet
// can use loose column names (Date / Order Date / Product / Item / Qty / etc.)
function normalizeRow(row) {
  const keys = Object.keys(row).reduce((acc, k) => {
    acc[String(k).toLowerCase().replace(/\s+/g, '_')] = row[k];
    return acc;
  }, {});

  const dateRaw = keys.date || keys.sale_date || keys.order_date;
  const productRaw = keys.product || keys.product_name || keys.item;
  if (!productRaw) return null;

  const date = dateRaw ? new Date(dateRaw) : new Date();
  if (isNaN(date.getTime())) return null;

  const quantity = parseFloat(keys.quantity || keys.qty || keys.units_sold || 1) || 0;
  const revenue = parseFloat(keys.revenue || keys.sales || keys.amount || keys.total || 0) || 0;

  return {
    date,
    product: String(productRaw).trim(),
    quantity,
    revenue,
    category: (keys.category || keys.type || 'General').trim(),
    cost: parseFloat(keys.cost || keys.cogs || 0) || 0,
    region: (keys.region || keys.location || 'Global').trim(),
  };
}

// Convert a 2D array (first row = headers) into objects, then normalize.
// `range` lets us produce a stable externalId per row (sheet+row index) so re-sync upserts.
function rowsFromValues(values, sheetId, range) {
  if (!values || values.length < 2) return [];
  const headers = values[0].map((h) => String(h || '').trim());
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || row.every((c) => c === '' || c == null)) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] ?? ''; });
    const normalized = normalizeRow(obj);
    if (!normalized) continue;
    // Row 1 is headers; data rows start at index 2 in sheet terms
    normalized.externalId = `${sheetId}:${range}:${i + 1}`;
    out.push(normalized);
  }
  return out;
}

// Pull all rows from the configured sheet/range.
// Returns { rows, credentials } — credentials may have been refreshed.
async function fetchDelta(connector) {
  const { sheetId, range } = connector.config || {};
  if (!sheetId) throw new Error('Connector config missing sheetId');
  const cellRange = range || 'A:Z';

  const { client, credentials } = await getAuthedClient(connector.credentials);
  const sheets = google.sheets({ version: 'v4', auth: client });

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: cellRange,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });

  const rows = rowsFromValues(resp.data.values || [], sheetId, cellRange);
  return { rows, credentials };
}

// Read sheet metadata (title, available tabs) so the user can confirm they picked the right doc.
async function describeSheet(credentials, sheetId) {
  const { client, credentials: creds } = await getAuthedClient(credentials);
  const sheets = google.sheets({ version: 'v4', auth: client });
  const resp = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: 'properties.title,sheets.properties(title,gridProperties)',
  });
  return {
    title: resp.data.properties?.title,
    tabs: (resp.data.sheets || []).map((s) => ({
      title: s.properties?.title,
      rows: s.properties?.gridProperties?.rowCount,
      cols: s.properties?.gridProperties?.columnCount,
    })),
    credentials: creds,
  };
}

module.exports = {
  SCOPES,
  getAuthUrl,
  exchangeCode,
  fetchDelta,
  describeSheet,
};
