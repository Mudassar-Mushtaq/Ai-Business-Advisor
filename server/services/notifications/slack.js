// Slack delivery adapter — posts to a user-supplied incoming webhook URL.
// No SDK required; Slack accepts a JSON POST.

const KIND_EMOJI = {
  win:            ':rocket:',
  risk:           ':warning:',
  anomaly:        ':eyes:',
  recommendation: ':bulb:',
  goal:           ':dart:',
  info:           ':bar_chart:',
};

function isWebhookUrl(url) {
  return typeof url === 'string' && /^https:\/\/hooks\.slack\.com\/services\//.test(url);
}

function buildBlocks({ headline, bullets, weekStart, weekEnd }) {
  const fmt = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📊 Weekly Business Brief', emoji: true },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*${fmt(weekStart)} – ${fmt(weekEnd)}*` }],
    },
  ];
  if (headline) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${headline}*` } });
  }
  blocks.push({ type: 'divider' });
  for (const b of bullets) {
    const emoji = KIND_EMOJI[b.kind] || KIND_EMOJI.info;
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `${emoji}  ${b.text}` },
    });
  }
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '_AI Business Advisor · auto-generated_' }],
  });
  return blocks;
}

async function send({ webhookUrl, headline, bullets, weekStart, weekEnd }) {
  if (!webhookUrl) return { skipped: true, reason: 'no_webhook' };
  if (!isWebhookUrl(webhookUrl)) {
    throw new Error('Invalid Slack webhook URL.');
  }

  const blocks = buildBlocks({ headline, bullets, weekStart, weekEnd });
  const fallbackText = headline || 'Your weekly business brief is ready.';

  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: fallbackText, blocks }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Slack HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }
  return { ok: true };
}

module.exports = { send, isWebhookUrl, buildBlocks };
