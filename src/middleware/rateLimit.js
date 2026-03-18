// ─── In-memory rate limiter ────────────────────────────────────────────────
// FIX: The original Map grew forever, leaking memory until the VPS ran out of RAM.
// Solution: Run a cleanup interval every 5 minutes to remove entries that have
// not received any requests within the last hour.
// ──────────────────────────────────────────────────────────────────────────

const buckets = new Map();

// Purge stale entries every 5 minutes to prevent memory leak
const CLEANUP_INTERVAL = 5 * 60 * 1000;   // 5 minutes
const STALE_THRESHOLD  = 60 * 60 * 1000;  // 1 hour — entries older than this are dead

const cleanup = setInterval(() => {
  const now = Date.now();
  let removed = 0;

  for (const [key, bucket] of buckets.entries()) {
    const lastSeen = bucket.length ? bucket[bucket.length - 1] : 0;
    if (now - lastSeen > STALE_THRESHOLD) {
      buckets.delete(key);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(`[RateLimit] Cleaned up ${removed} stale bucket(s). Active: ${buckets.size}`);
  }
}, CLEANUP_INTERVAL);

// Allow Node to exit cleanly even if this interval is running
cleanup.unref();

// ─── Static rate limiter (windowMs and max fixed at middleware creation) ────
const rateLimit = ({ windowMs, max, keyGenerator }) => {
  const w = Number(windowMs);
  const m = Number(max);

  return (req, res, next) => {
    const now = Date.now();
    const key = keyGenerator ? keyGenerator(req) : `${req.ip}:${req.path}`;
    const bucket = buckets.get(key) || [];

    const cutoff = now - w;
    while (bucket.length && bucket[0] < cutoff) bucket.shift();

    if (bucket.length >= m) {
      return res.status(429).json({ message: 'Too many requests, please slow down.' });
    }

    bucket.push(now);
    buckets.set(key, bucket);
    next();
  };
};

// ─── Dynamic rate limiter ───────────────────────────────────────────────────
// Only `limit` is accepted from req.query (visible in Swagger UI).
// The window size is fixed via env var or default — NOT exposed to callers.
//
// Query param:
//   limit        — max requests allowed in the window (positive integer)
//
// Config options:
//   keyPrefix     — prefix for the bucket key
//   envMaxKey     — process.env key for max       (e.g. 'FEED_RATE_LIMIT_MAX')
//   envWindowKey  — process.env key for windowMs  (e.g. 'FEED_RATE_LIMIT_WINDOW_MS')
//   defaultMax    — fallback max        (default: 60)
//   defaultWindow — fallback windowMs  (default: 60000 ms)
// ───────────────────────────────────────────────────────────────────────────
const dynamicRateLimit = ({
  keyPrefix,
  envMaxKey,
  envWindowKey,
  defaultMax    = 60,
  defaultWindow = 60 * 1000,
}) => {
  return (req, res, next) => {
    // 1. Parse only `limit` from query
    const queryMax = parseInt(req.query.limit, 10);

    // 2. Validate if provided
    if (req.query.limit !== undefined && (isNaN(queryMax) || queryMax <= 0)) {
      return res.status(400).json({ message: '`limit` must be a positive integer.' });
    }

    // 3. Resolve values — window always comes from env/default, never from query
    const max      = queryMax || parseInt(process.env[envMaxKey])    || defaultMax;
    const windowMs =            parseInt(process.env[envWindowKey]) || defaultWindow;

    // 4. Build per-user bucket key
    const userId = req.userId || req.ip;
    const key    = `${keyPrefix}:${userId}:w${windowMs}:m${max}`;

    const now    = Date.now();
    const bucket = buckets.get(key) || [];

    // Slide the window
    const cutoff = now - windowMs;
    while (bucket.length && bucket[0] < cutoff) bucket.shift();

    if (bucket.length >= max) {
      return res.status(429).json({
        message:        'Too many requests, please slow down.',
        limit:          max,
        retry_after_ms: windowMs - (now - bucket[0]),
      });
    }

    bucket.push(now);
    buckets.set(key, bucket);

    // Rate limit info in response headers
    res.set('X-RateLimit-Limit',     String(max));
    res.set('X-RateLimit-Window-Ms', String(windowMs));
    res.set('X-RateLimit-Remaining', String(max - bucket.length));

    next();
  };
};

module.exports = rateLimit;
module.exports.dynamicRateLimit = dynamicRateLimit;