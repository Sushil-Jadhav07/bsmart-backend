// ─── Feed engine ────────────────────────────────────────────────────────────
//   viewer context → candidates → filter → score → diversify → explore
//   → blend promotions → cache the ranked session → hydrate one page
//
// A "session" is one ranked list (up to candidates.maxRanked items) cached for
// a few minutes. Page 1 (or a request without a cursor) always ranks afresh —
// pull-to-refresh semantics — and later pages read from the same list, so
// pagination is stable while the user scrolls.

const crypto = require('crypto');
const { getFeedConfig } = require('./settings');
const { getViewerContext, resolveLanguages } = require('./profile');
const { gatherCandidates } = require('./candidates');
const { rankPromotions } = require('./promotions');
const { loadItemStats } = require('./stats');
const { scoreCandidate } = require('./scoring');
const { diversify, injectExploration, interleave } = require('./rerank');
const { hydrate } = require('./hydrate');
const TtlCache = require('./cache');

const sessions = new TtlCache({ max: 20000 });

const httpError = (status, message) => Object.assign(new Error(message), { status });

const encodeCursor = (sessionId, offset) =>
  Buffer.from(JSON.stringify({ s: sessionId, o: offset })).toString('base64url');

const decodeCursor = (cursor) => {
  try {
    const value = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (typeof value?.s === 'string' && Number.isInteger(value.o) && value.o >= 0) return value;
  } catch (_) {
    // invalid cursor — handled below
  }
  return null;
};

const round = (n) => (Number.isFinite(n) ? Math.round(n * 10000) / 10000 : n);

const toEntry = (item, surface, sponsored = false) => ({
  key: item.key,
  type: item.type,
  meta: {
    surface,
    reasons: [
      ...(sponsored ? ['sponsored'] : []),
      ...(item.exploration ? ['new_for_you'] : []),
      ...(item.reasons || []),
    ],
    sources: [...(item.sources || [])],
    score: round(item.score),
    terms: item.terms ? Object.fromEntries(Object.entries(item.terms).map(([k, v]) => [k, round(v)])) : undefined,
    penalty: round(item.penalty),
  },
});

// Score breakdowns are only exposed to admins (?debug=true).
const publicMeta = (meta, rank, debug) => {
  const { score, terms, penalty, ...rest } = meta;
  return debug ? { ...rest, rank, score, terms, penalty } : { ...rest, rank };
};

const rankOrganic = async (ctx, surface, config, now) => {
  const surfaceCfg = config.surfaces[surface];
  const candidates = (await gatherCandidates(ctx, surfaceCfg, config, now))
    .filter((c) => !ctx.hiddenSet.has(c.key) && !ctx.reportedSet.has(c.key));
  const stats = await loadItemStats(candidates.map((c) => c.key));

  const scored = candidates.map((c) => ({
    ...c,
    ...scoreCandidate(c, ctx, surfaceCfg, config, stats.get(c.key), now),
    impressions: stats.get(c.key)?.impressions || 0,
  }));
  scored.sort((a, b) => b.score - a.score);

  // Exploration pool: recent, under-exposed, unseen items from creators the
  // viewer does not follow — ordered by relevance rather than popularity.
  const { exploration, diversity, candidates: cc } = config;
  const freshSince = now - exploration.freshHours * 3.6e6;
  const relevance = (c) => c.terms.interest + c.terms.locale + c.terms.freshness;
  const pool = scored
    .filter((c) => c.authorId !== ctx.userId
      && !ctx.followedSet.has(c.authorId)
      && new Date(c.createdAt).getTime() >= freshSince
      && c.impressions < exploration.maxImpressions
      && !ctx.seenCounts.get(c.key))
    .sort((a, b) => relevance(b) - relevance(a));

  const ranked = diversify(scored.slice(0, cc.maxRanked), diversity);
  return injectExploration(ranked, pool, exploration.rate).slice(0, cc.maxRanked);
};

// Promotions must never take the organic feed down with them.
const safeRankPromotions = async (ctx, config, options) => {
  try {
    return await rankPromotions(ctx, config, options);
  } catch (err) {
    console.error('[Feed] Promotion ranking failed:', err.message);
    return [];
  }
};

const createSession = async ({ user, surface, config, languageHint }) => {
  const now = Date.now();
  const base = await getViewerContext(user, config);
  const ctx = { ...base, languages: resolveLanguages(base, languageHint) };
  const surfaceCfg = config.surfaces[surface];

  let entries;
  if (surface === 'promotions') {
    const promos = await rankPromotions(ctx, config, { limit: config.candidates.maxRanked });
    entries = promos.map((p) => toEntry(p, surface, true));
  } else {
    const organic = (await rankOrganic(ctx, surface, config, now)).map((item) => toEntry(item, surface));
    const every = surfaceCfg.promotionsEvery;
    if (every > 0 && organic.length) {
      const promos = await safeRankPromotions(ctx, config, {
        limit: Math.ceil(organic.length / every) + 1,
        videoOnly: surface === 'sparks',
      });
      entries = interleave(organic, promos.map((p) => toEntry(p, surface, true)), {
        every,
        firstSlot: config.promotions.firstSlot,
      });
    } else {
      entries = organic;
    }
  }

  return {
    id: crypto.randomBytes(8).toString('hex'),
    items: entries,
    languages: ctx.languages,
    followedSet: ctx.followedSet,
  };
};

const buildFeed = async ({ user, surface, page = 1, limit = 20, cursor, languageHint, debug = false, baseUrl }) => {
  const config = await getFeedConfig();
  const uid = String(user._id);
  const latestKey = `${uid}:${surface}:latest`;

  let session = null;
  let offset = 0;
  let restarted = false;

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) throw httpError(400, 'Invalid cursor');
    session = sessions.get(`${uid}:${surface}:${decoded.s}`);
    if (session) offset = decoded.o;
    else restarted = true; // expired — start a fresh ranking from the top
  } else if (page > 1) {
    session = sessions.get(latestKey);
    offset = (page - 1) * limit;
  }

  if (!session) {
    session = await createSession({ user, surface, config, languageHint });
    sessions.set(`${uid}:${surface}:${session.id}`, session, config.session.ttlMs);
    sessions.set(latestKey, session, config.session.ttlMs);
  }

  const slice = session.items
    .slice(offset, offset + limit)
    .map((entry, i) => ({ ...entry, meta: publicMeta(entry.meta, offset + i + 1, debug) }));
  const data = await hydrate(slice, { viewerId: user._id, baseUrl, followedSet: session.followedSet });

  const nextOffset = offset + slice.length;
  const hasMore = nextOffset < session.items.length;
  return {
    surface,
    page: Math.floor(offset / limit) + 1,
    limit,
    session_id: session.id,
    next_cursor: hasMore ? encodeCursor(session.id, nextOffset) : null,
    has_more: hasMore,
    ...(restarted ? { session_restarted: true } : {}),
    languages: session.languages,
    data,
  };
};

const clearSessions = () => sessions.clear();

module.exports = { buildFeed, encodeCursor, decodeCursor, clearSessions };
