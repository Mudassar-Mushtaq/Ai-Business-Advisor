// Weekly brief scheduler.
//
// Strategy: tick once per hour. For each user with briefs enabled, check whether
// "now" in their local timezone matches their configured (dayOfWeek, hour) AND
// no Brief exists for the current week. If so, generate + deliver.
//
// One hourly cron handles all timezones — we don't need a cron per user. The
// unique index on Brief { userId, weekStart } ensures even duplicate ticks
// (from a restart, say) won't double-send.

const cron = require('node-cron');
const User = require('../models/User');
const Brief = require('../models/Brief');
const { generateAndDeliver, startOfWeek } = require('./briefService');

let started = false;

function localParts(date, timezone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
      weekday: 'short',
    });
    const parts = fmt.formatToParts(date);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    const dayName = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
    const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dayName);
    return { hour, dayOfWeek: dayOfWeek < 0 ? 0 : dayOfWeek };
  } catch {
    return { hour: date.getUTCHours(), dayOfWeek: date.getUTCDay() };
  }
}

async function tickOnce(now = new Date()) {
  const users = await User.find({ 'briefSettings.enabled': true });
  let processed = 0;
  let delivered = 0;

  for (const user of users) {
    const settings = user.briefSettings || {};
    const tz = settings.timezone || 'UTC';
    const local = localParts(now, tz);

    // Only fire when the user's local hour AND day match. Hour granularity is
    // fine — a user who picks "Monday 8am Karachi" will get the brief at the
    // hourly tick that lands on 08:xx Karachi time on Monday.
    if (local.dayOfWeek !== Number(settings.dayOfWeek)) continue;
    if (local.hour !== Number(settings.hour)) continue;

    const weekStart = startOfWeek(now, tz);

    // Has this week already been generated? If so, skip cleanly.
    const exists = await Brief.findOne({ userId: user._id, weekStart });
    if (exists) continue;

    try {
      const result = await generateAndDeliver(user._id, { trigger: 'scheduled', timezone: tz, weekStart });
      processed += 1;
      if (result.delivered.length) delivered += 1;
      console.log(
        `[brief] user=${user._id} status=ready delivered=[${result.delivered.join(',')}]`
      );
    } catch (err) {
      console.error(`[brief] user=${user._id} failed:`, err.message);
    }
  }

  return { processed, delivered, candidates: users.length };
}

function start() {
  if (started) return;
  started = true;

  // Top-of-the-hour tick. We deliberately don't go finer than that — picking
  // a delivery time accurate to the minute isn't a feature anyone asks for.
  cron.schedule('0 * * * *', async () => {
    try {
      const r = await tickOnce();
      if (r.processed > 0) {
        console.log(`[brief scheduler] tick: ${r.processed}/${r.candidates} processed, ${r.delivered} delivered`);
      }
    } catch (err) {
      console.error('[brief scheduler] tick failed:', err.message);
    }
  });

  console.log('📰 Weekly-brief scheduler started (hourly tick)');
}

module.exports = { start, tickOnce };
