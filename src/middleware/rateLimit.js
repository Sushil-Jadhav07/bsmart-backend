const buckets = new Map();

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
      return res.status(429).json({ message: 'Too many requests' });
    }

    bucket.push(now);
    buckets.set(key, bucket);
    next();
  };
};

module.exports = rateLimit;

