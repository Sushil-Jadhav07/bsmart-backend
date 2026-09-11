// ─── Personalized feed configuration ────────────────────────────────────────
// Defaults live here. Admins can override any value at runtime through
// PUT /api/feed/admin/config (stored in the FeedSettings collection), so
// weights, half-lives and caps can be tuned without a deploy.

const SURFACES = ['home', 'sparks', 'buzz', 'spotlight', 'promotions'];
const ORGANIC_TYPES = ['post', 'reel', 'tweet'];
const PROMOTION_TYPES = ['ad', 'promote_reel'];
const CONTENT_TYPES = [...ORGANIC_TYPES, ...PROMOTION_TYPES];

const DEFAULT_CONFIG = {
  surfaces: {
    // Home — everything organic, promotions interleaved.
    home: {
      sources: ['post', 'reel', 'tweet'],
      halfLifeHours: 24,
      weights: { affinity: 0.30, interest: 0.25, freshness: 0.20, engagement: 0.15, quality: 0.05, locale: 0.05 },
      includeOwn: true,
      excludeFollowed: false,
      promotionsEvery: 5,
    },
    // Sparks — short videos (reels). Watch behaviour carries the most weight.
    sparks: {
      sources: ['reel'],
      halfLifeHours: 48,
      weights: { affinity: 0.15, interest: 0.25, freshness: 0.15, engagement: 0.20, quality: 0.20, locale: 0.05 },
      includeOwn: false,
      excludeFollowed: false,
      promotionsEvery: 4,
    },
    // Buzz — tweet-style posts. Conversation moves fast, so freshness leads.
    buzz: {
      sources: ['tweet'],
      halfLifeHours: 12,
      weights: { affinity: 0.30, interest: 0.20, freshness: 0.30, engagement: 0.15, quality: 0.00, locale: 0.05 },
      includeOwn: true,
      excludeFollowed: false,
      promotionsEvery: 0,
    },
    // Spotlight — discovery: trending content from creators the viewer does not follow yet.
    spotlight: {
      sources: ['post', 'reel', 'tweet'],
      halfLifeHours: 72,
      weights: { affinity: 0.00, interest: 0.30, freshness: 0.10, engagement: 0.35, quality: 0.15, locale: 0.10 },
      includeOwn: false,
      excludeFollowed: true,
      promotionsEvery: 0,
    },
    // Promotions — ads + promote reels, ranked by targeting fit and interest.
    promotions: {
      sources: ['ad', 'promote_reel'],
      halfLifeHours: 168,
      weights: { affinity: 0.10, interest: 0.35, freshness: 0.10, engagement: 0.20, quality: 0.05, locale: 0.20 },
      includeOwn: false,
      excludeFollowed: false,
      promotionsEvery: 0,
    },
  },
  candidates: {
    lookbackDays: 30,          // organic content older than this is never retrieved
    perSourceLimit: 120,       // docs per retrieval strategy, split across content types
    maxRanked: 200,            // length of the ranked list cached per feed session
    trendingWindowHours: 72,
    localAuthorLimit: 500,
    promotionPoolLimit: 150,
  },
  diversity: {
    window: 10,
    maxPerAuthor: 2,
    maxPerTopic: 3,
    maxConsecutiveType: 3,
  },
  exploration: {
    rate: 0.15,                // share of slots reserved for new / under-exposed content
    maxImpressions: 100,       // "under-exposed" means fewer feed impressions than this
    freshHours: 72,
  },
  penalties: {
    seenPerImpression: 0.12,
    seenMax: 0.45,
    seenWindowHours: 48,
    negativeFeedback: 0.30,    // scaled by the item's hide/skip rate
  },
  promotions: {
    firstSlot: 3,              // first promotion appears after this many organic items
    frequencyCapPerDay: 3,
    exhaustedBudgetFactor: 0.3,
    timezoneOffsetMinutes: 330, // for Ad.scheduling.delivery_time_slots (IST default)
  },
  profile: {
    cacheTtlMs: 60 * 1000,
    rebuildAfterHours: 24,
    historyDays: 90,
    halfLifeDays: 14,          // learned interest weights halve every two weeks
    maxInterests: 200,
    maxAuthors: 300,
  },
  session: {
    ttlMs: 10 * 60 * 1000,
  },
  events: {
    maxBatch: 100,
  },
};

const ALLOW_NEGATIVE = new Set(['timezoneOffsetMinutes']);
const FRACTIONS = new Set(['rate']);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Keeps only overrides whose key exists in `base` with a matching value type.
// Returns the cleaned overrides plus a readable list of what was rejected.
const sanitizeOverrides = (base, overrides, path = '') => {
  const clean = {};
  const errors = [];
  if (overrides == null) return { clean, errors };
  if (!isPlainObject(overrides)) return { clean, errors: [`${path || 'config'}: must be an object`] };

  for (const [key, value] of Object.entries(overrides)) {
    const at = path ? `${path}.${key}` : key;
    if (!Object.prototype.hasOwnProperty.call(base, key)) {
      errors.push(`${at}: unknown setting`);
      continue;
    }
    const current = base[key];

    if (isPlainObject(current)) {
      const nested = sanitizeOverrides(current, value, at);
      errors.push(...nested.errors);
      if (Object.keys(nested.clean).length) clean[key] = nested.clean;
    } else if (Array.isArray(current)) {
      const sourceMatch = at.match(/^surfaces\.(\w+)\.sources$/);
      const allowed = sourceMatch
        ? (sourceMatch[1] === 'promotions' ? PROMOTION_TYPES : ORGANIC_TYPES)
        : null;
      if (!Array.isArray(value) || !value.length || !value.every((v) => typeof v === 'string')) {
        errors.push(`${at}: must be a non-empty array of strings`);
      } else if (allowed && !value.every((v) => allowed.includes(v))) {
        errors.push(`${at}: allowed values are ${allowed.join(', ')}`);
      } else {
        clean[key] = [...new Set(value)];
      }
    } else if (typeof current === 'number') {
      const ok = typeof value === 'number' && Number.isFinite(value)
        && (value >= 0 || ALLOW_NEGATIVE.has(key))
        && (!FRACTIONS.has(key) || value <= 1);
      if (ok) clean[key] = value;
      else errors.push(`${at}: must be a ${FRACTIONS.has(key) ? 'number between 0 and 1' : 'non-negative number'}`);
    } else if (typeof current === 'boolean') {
      if (typeof value === 'boolean') clean[key] = value;
      else errors.push(`${at}: must be true or false`);
    } else {
      errors.push(`${at}: cannot be overridden`);
    }
  }

  return { clean, errors };
};

// Deep-merges sanitized overrides onto a copy of `base`.
const mergeConfig = (base, overrides) => {
  const out = structuredClone(base);
  const apply = (target, patch) => {
    for (const [key, value] of Object.entries(patch || {})) {
      if (isPlainObject(value) && isPlainObject(target[key])) apply(target[key], value);
      else target[key] = Array.isArray(value) ? [...value] : value;
    }
  };
  apply(out, overrides);
  return out;
};

module.exports = {
  SURFACES,
  ORGANIC_TYPES,
  PROMOTION_TYPES,
  CONTENT_TYPES,
  DEFAULT_CONFIG,
  sanitizeOverrides,
  mergeConfig,
};
