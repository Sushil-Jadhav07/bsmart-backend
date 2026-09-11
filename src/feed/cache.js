// ─── Small in-process TTL cache ─────────────────────────────────────────────
// Same trade-off as middleware/rateLimit.js: state is process-local, so with
// several API instances each keeps its own copy. Swap for Redis if the API is
// ever scaled horizontally.

class TtlCache {
  constructor({ max = 5000 } = {}) {
    this.max = max;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
    // Map keeps insertion order, so the first key is the oldest.
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return value;
  }

  delete(key) {
    this.map.delete(key);
  }

  deletePrefix(prefix) {
    for (const key of this.map.keys()) if (key.startsWith(prefix)) this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

module.exports = TtlCache;
