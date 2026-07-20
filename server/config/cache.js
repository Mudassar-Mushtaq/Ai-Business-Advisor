const Redis = require('ioredis');

// Safe Redis cache wrapper.
// If REDIS_URL is unset or Redis is unreachable, all methods become no-ops
// so the app keeps working without caching — just slower.

let client = null;
let ready = false;

function init() {
  if (!process.env.REDIS_URL) {
    console.log('ℹ️  Redis disabled (REDIS_URL not set) — running without cache.');
    return;
  }

  try {
    const redisOptions = {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
    };

    // Azure Cache for Redis uses SSL (rediss://) — ioredis needs tls config
    if (process.env.REDIS_URL && process.env.REDIS_URL.startsWith('rediss://')) {
      redisOptions.tls = { rejectUnauthorized: false };
    }

    client = new Redis(process.env.REDIS_URL, redisOptions);

    client.on('connect', () => {
      ready = true;
      console.log('✅ Redis connected');
    });

    client.on('error', (err) => {
      if (ready) console.warn('⚠️  Redis error:', err.message);
      ready = false;
    });

    client.on('end', () => {
      ready = false;
    });
  } catch (err) {
    console.warn('⚠️  Redis init failed, continuing without cache:', err.message);
    client = null;
  }
}

init();

async function get(key) {
  if (!client || !ready) return null;
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function set(key, value, ttlSeconds = 300) {
  if (!client || !ready) return;
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    /* swallow — caching is best-effort */
  }
}

async function del(key) {
  if (!client || !ready) return;
  try {
    await client.del(key);
  } catch {
    /* swallow */
  }
}

// Delete every key matching a pattern, e.g. "sales:abc123:*"
async function delPattern(pattern) {
  if (!client || !ready) return;
  try {
    const stream = client.scanStream({ match: pattern, count: 100 });
    const pipeline = client.pipeline();
    let count = 0;
    for await (const keys of stream) {
      for (const k of keys) {
        pipeline.del(k);
        count++;
      }
    }
    if (count > 0) await pipeline.exec();
  } catch {
    /* swallow */
  }
}

// Cache-aside helper: returns cached value or runs `loader` and caches the result
async function wrap(key, ttlSeconds, loader) {
  const cached = await get(key);
  if (cached !== null) return cached;
  const fresh = await loader();
  await set(key, fresh, ttlSeconds);
  return fresh;
}

function isReady() {
  return ready;
}

module.exports = { get, set, del, delPattern, wrap, isReady };
