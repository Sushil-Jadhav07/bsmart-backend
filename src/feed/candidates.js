// ─── Candidate retrieval ────────────────────────────────────────────────────
// Pulls a few hundred plausible items per request from several strategies
// (following, interests, local, trending, recent and — when the AI service is
// configured — similar to the viewer's taste) and merges them. Ranking
// happens afterwards in memory, so retrieval only has to be broad and cheap.

const mongoose = require('mongoose');
const Post = require('../models/Post');
const Tweet = require('../models/tweet.model');
const User = require('../models/User');
const { toCandidate, postItemType } = require('./items');
const { aiServiceConfigured, fetchSimilarItems, fetchSemanticScores } = require('./aiClient');
const { loadAutoTopics, mergeTopics } = require('./autoTopics');
const TtlCache = require('./cache');

const AUTHOR_SELECT = 'username full_name avatar_url followers_count isPrivate is_active isDeleted address location';
const POST_OMIT = '-likes -latest_comments -people_tags';
const TWEET_OMIT = '-likes';

const localAuthorCache = new TtlCache({ max: 2000 });
const LOCAL_AUTHOR_TTL_MS = 10 * 60 * 1000;

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (value) => new RegExp(`(^|[^A-Za-z])${escapeRe(value)}([^A-Za-z]|$)`, 'i');
const exactRe = (value) => new RegExp(`^\\s*${escapeRe(value)}\\s*$`, 'i');
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const oids = (ids) => [...new Set(ids.map(String))]
  .filter((id) => OBJECT_ID_RE.test(id))
  .map((id) => new mongoose.Types.ObjectId(id));
const and = (...clauses) => ({ $and: clauses.filter(Boolean) });

const authorFieldOf = (type) => (type === 'tweet' ? 'author' : 'user_id');
const modelOf = (type) => (type === 'tweet' ? Tweet : Post);

// Filters every strategy shares. ObjectIds are cast explicitly because the
// same filter is reused inside aggregate(), which does not cast.
const baseFilter = (type, ctx, surfaceCfg, since) => {
  const exclude = [...ctx.excludedAuthorIds];
  if (!surfaceCfg.includeOwn) exclude.push(ctx.userId);
  if (surfaceCfg.excludeFollowed) exclude.push(...ctx.followedIds);

  const clauses = [{ isDeleted: false }, { createdAt: { $gte: since } }];
  if (exclude.length) clauses.push({ [authorFieldOf(type)]: { $nin: oids(exclude) } });
  if (type === 'tweet') {
    clauses.push({ parentTweet: null });
    // Followers-only tweets are visible to followers (and the author).
    clauses.push({
      $or: [
        { audience: { $ne: 'followers' } },
        { author: { $in: oids([...ctx.followedIds, ctx.userId]) } },
      ],
    });
  } else {
    clauses.push({ type });
  }
  return and(...clauses);
};

const findDocs = (type, filter, sort, limit) => {
  const query = modelOf(type).find(filter).sort(sort).limit(limit).lean();
  return type === 'tweet'
    ? query.select(TWEET_OMIT).populate('author', AUTHOR_SELECT)
    : query.select(POST_OMIT).populate('user_id', AUTHOR_SELECT);
};

const ENGAGEMENT_EXPR = {
  tweet: {
    $add: [
      { $ifNull: ['$likesCount', 0] },
      { $multiply: [{ $ifNull: ['$repliesCount', 0] }, 2] },
      { $multiply: [{ $ifNull: ['$repostsCount', 0] }, 3] },
    ],
  },
  post: {
    $add: [
      { $ifNull: ['$likes_count', 0] },
      { $multiply: [{ $ifNull: ['$comments_count', 0] }, 2] },
      { $multiply: [{ $ifNull: ['$completed_views_count', 0] }, 1.5] },
    ],
  },
};

const findTrending = async (type, filter, windowStart, limit) => {
  const ranked = await modelOf(type).aggregate([
    { $match: and(filter, { createdAt: { $gte: windowStart } }) },
    { $addFields: { _engagement: ENGAGEMENT_EXPR[type === 'tweet' ? 'tweet' : 'post'] } },
    { $match: { _engagement: { $gt: 0 } } },
    { $sort: { _engagement: -1, createdAt: -1 } },
    { $limit: limit },
    { $project: { _id: 1 } },
  ]);
  if (!ranked.length) return [];
  return findDocs(type, { _id: { $in: ranked.map((r) => r._id) } }, { createdAt: -1 }, ranked.length);
};

const HASHTAG_SAFE = /^[\p{L}\p{M}\p{N}_]+$/u;

const interestClause = (type, terms) => {
  const clauses = [];
  const hashtagTerms = terms.filter((term) => HASHTAG_SAFE.test(term));
  if (hashtagTerms.length) {
    const re = new RegExp(`#(?:${hashtagTerms.map(escapeRe).join('|')})(?![A-Za-z0-9_])`, 'i');
    clauses.push(type === 'tweet' ? { content: re } : { caption: re });
  }
  if (type !== 'tweet') {
    clauses.push({ tags: { $in: terms.map((term) => new RegExp(`^#?${escapeRe(term)}$`, 'i')) } });
  }
  return clauses.length ? { $or: clauses } : null;
};

const topInterestTerms = (interests, max = 12) => Object.entries(interests || {})
  .filter(([, weight]) => weight > 0)
  .sort((a, b) => b[1] - a[1])
  .slice(0, max)
  .map(([term]) => term);

// Creators in the viewer's city (or state when the city is unknown).
const localAuthorIds = async (ctx, limit) => {
  const { city, state } = ctx.geo || {};
  const clauses = city
    ? [{ 'address.city': exactRe(city) }, { 'location.name': wordRe(city) }]
    : state ? [{ 'address.state': exactRe(state) }] : [];
  if (!clauses.length) return [];

  const cacheKey = `${city || ''}|${state || ''}`;
  const cached = localAuthorCache.get(cacheKey);
  if (cached) return cached;

  const users = await User.find({ $or: clauses, is_active: true, isDeleted: { $ne: true } })
    .select('_id').limit(limit).lean();
  return localAuthorCache.set(cacheKey, users.map((u) => String(u._id)), LOCAL_AUTHOR_TTL_MS);
};

const localClause = (type, localIds, city) => {
  const clauses = [];
  if (localIds.length) clauses.push({ [authorFieldOf(type)]: { $in: oids(localIds) } });
  if (city && type !== 'tweet') clauses.push({ location: wordRe(city) });
  return clauses.length ? { $or: clauses } : null;
};

// Similarity to the viewer's taste, rescaled to 0–1 within this request (raw
// scores depend on the model). Items the service has no vector for sit at 0.5.
const applySemanticScores = (candidates, scores) => {
  const values = [...scores.values()];
  const min = Math.min(...values);
  const range = Math.max(...values) - min;
  for (const candidate of candidates) {
    const score = scores.get(candidate.key);
    candidate.semantic = score === undefined || range < 1e-6 ? 0.5 : (score - min) / range;
  }
};

const gatherCandidates = async (ctx, surfaceCfg, config, now) => {
  const cc = config.candidates;
  const useAi = Boolean(config.ai?.enabled) && aiServiceConfigured();
  const since = new Date(now - cc.lookbackDays * 864e5);
  const trendingSince = new Date(Math.max(since.getTime(), now - cc.trendingWindowHours * 3.6e6));
  const perLimit = Math.max(20, Math.round(cc.perSourceLimit / surfaceCfg.sources.length));
  const terms = topInterestTerms(ctx.interests);
  const localIds = await localAuthorIds(ctx, cc.localAuthorLimit);
  const followed = surfaceCfg.excludeFollowed ? [] : ctx.followedIds;

  // Started first, so the AI service works while the MongoDB queries run.
  const similar = useAi
    ? fetchSimilarItems(ctx.userId, {
      k: config.ai.similarLimit,
      types: surfaceCfg.sources,
      excludeAuthorIds: [...ctx.excludedAuthorIds, ...(surfaceCfg.excludeFollowed ? ctx.followedIds : [])],
      sinceDays: cc.lookbackDays,
      timeoutMs: config.ai.timeoutMs,
    })
    : null;

  const jobs = [];
  for (const type of surfaceCfg.sources) {
    const base = baseFilter(type, ctx, surfaceCfg, since);
    const add = (source, promise) => jobs.push(promise.then((docs) => docs.map(
      (doc) => toCandidate(doc, type === 'tweet' ? 'tweet' : postItemType(doc), source)
    )));

    if (followed.length) {
      add('following', findDocs(type, and(base, { [authorFieldOf(type)]: { $in: oids(followed) } }), { createdAt: -1 }, perLimit));
    }
    const interest = terms.length ? interestClause(type, terms) : null;
    if (interest) add('interests', findDocs(type, and(base, interest), { createdAt: -1 }, perLimit));
    const local = localClause(type, localIds, ctx.geo?.city);
    if (local) add('local', findDocs(type, and(base, local), { createdAt: -1 }, perLimit));
    add('trending', findTrending(type, base, trendingSince, perLimit));
    // Recency backfill, so small or quiet platforms still fill the feed.
    add('recent', findDocs(type, base, { createdAt: -1 }, perLimit));
    if (similar) {
      // The AI service only suggests ids; the same privacy, block and
      // deletion filters apply to them as to every other source.
      add('similar', similar.then((items) => {
        const ids = items.filter((item) => item.item_type === type).map((item) => item.item_id);
        return ids.length ? findDocs(type, and(base, { _id: { $in: oids(ids) } }), { createdAt: -1 }, ids.length) : [];
      }));
    }
  }

  const merged = new Map();
  for (const list of await Promise.all(jobs)) {
    for (const candidate of list) {
      if (!candidate.authorActive) continue; // author banned, deleted or missing
      const existing = merged.get(candidate.key);
      if (existing) candidate.sources.forEach((source) => existing.sources.add(source));
      else merged.set(candidate.key, candidate);
    }
  }

  const candidates = [...merged.values()];
  if (useAi && candidates.length) {
    const keys = candidates.map((candidate) => candidate.key);
    const [autoTopics, semantic] = await Promise.all([
      loadAutoTopics(keys),
      fetchSemanticScores(ctx.userId, keys, config.ai.timeoutMs),
    ]);
    for (const candidate of candidates) {
      const extra = autoTopics.get(candidate.key);
      if (extra?.length) candidate.topics = mergeTopics(candidate.topics, extra);
    }
    if (semantic?.size) applySemanticScores(candidates, semantic);
  }
  return candidates;
};

module.exports = { gatherCandidates, AUTHOR_SELECT, oids, topInterestTerms, interestClause, applySemanticScores };
