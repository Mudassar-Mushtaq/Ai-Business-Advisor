// Email delivery adapter. Uses Resend's REST API directly so we don't need to
// pull in another SDK — they accept a simple JSON POST. Falls back to a no-op
// (with a logged warning) if RESEND_API_KEY isn't configured, so the rest of
// the app still works in development.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const KIND_BADGE = {
  win:            { color: '#10b981', label: 'Win' },
  risk:           { color: '#ef4444', label: 'Risk' },
  anomaly:        { color: '#f59e0b', label: 'Anomaly' },
  recommendation: { color: '#6366f1', label: 'Recommendation' },
  goal:           { color: '#8b5cf6', label: 'Goal' },
  info:           { color: '#94a3b8', label: 'Info' },
};

function renderHtml({ headline, bullets, weekStart, weekEnd, userName }) {
  const fmt = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const items = bullets.map((b) => {
    const meta = KIND_BADGE[b.kind] || KIND_BADGE.info;
    return `
      <tr>
        <td style="padding: 14px 18px; border-bottom: 1px solid #1f2937;">
          <span style="display:inline-block; padding:3px 9px; font-size:11px; font-weight:600;
                       letter-spacing:0.04em; text-transform:uppercase; border-radius:999px;
                       background:${meta.color}22; color:${meta.color};">${meta.label}</span>
          <div style="margin-top:8px; color:#f1f5f9; font-size:15px; line-height:1.55;">
            ${escapeHtml(b.text)}
          </div>
        </td>
      </tr>`;
  }).join('');

  return `<!doctype html>
<html><body style="margin:0; padding:0; background:#0a0b14; font-family:'Inter',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0b14; padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; background:#1a2035; border:1px solid rgba(255,255,255,0.07); border-radius:16px; overflow:hidden;">
        <tr><td style="padding:24px 24px 8px;">
          <div style="font-size:12px; letter-spacing:0.1em; text-transform:uppercase; color:#94a3b8;">
            Weekly Brief · ${fmt(weekStart)} – ${fmt(weekEnd)}
          </div>
          <h1 style="margin:6px 0 0; color:#f1f5f9; font-size:22px; line-height:1.3;">
            ${escapeHtml(headline || `Here's your week, ${userName || 'there'}.`)}
          </h1>
        </td></tr>
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${items}
          </table>
        </td></tr>
        <tr><td style="padding:18px 24px; color:#475569; font-size:12px;">
          AI Business Advisor · auto-generated weekly summary
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function renderText({ headline, bullets, weekStart, weekEnd }) {
  const fmt = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const lines = bullets.map((b, i) => `${i + 1}. [${(KIND_BADGE[b.kind] || KIND_BADGE.info).label}] ${b.text}`);
  return [
    `Weekly Brief · ${fmt(weekStart)} – ${fmt(weekEnd)}`,
    '',
    headline || '',
    '',
    ...lines,
    '',
    '— AI Business Advisor',
  ].join('\n');
}

async function send({ to, subject, headline, bullets, weekStart, weekEnd, userName }) {
  if (!isConfigured()) {
    console.warn('[email] RESEND_API_KEY not set — skipping send to', to);
    return { skipped: true, reason: 'not_configured' };
  }
  if (!to) {
    return { skipped: true, reason: 'no_recipient' };
  }

  const from = process.env.BRIEF_EMAIL_FROM || 'AI Business Advisor <onboarding@resend.dev>';
  const html = renderHtml({ headline, bullets, weekStart, weekEnd, userName });
  const text = renderText({ headline, bullets, weekStart, weekEnd });

  const resp = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Resend HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = await resp.json().catch(() => ({}));
  return { ok: true, id: data.id || null };
}

module.exports = { send, isConfigured, renderHtml, renderText };
