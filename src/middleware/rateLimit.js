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
    // If the most recent request in this bucket is older than the stale threshold, delete it
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

const rateLimit = ({ windowMs, max, keyGenerator }) => {
  const w = Number(windowMs);
  const m = Number(max);

  return (req, res, next) => {
    const now = Date.now();
    const key = keyGenerator ? keyGenerator(req) : `${req.ip}:${req.path}`;
    const bucket = buckets.get(key) || [];

    // Slide the window — remove timestamps older than windowMs
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

module.exports = rateLimit;