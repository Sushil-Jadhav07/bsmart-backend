// ─── Scoring ────────────────────────────────────────────────────────────────
// Pure functions only — no DB access — so the ranking formula is unit-tested.
//
//   score = Σ weight[term] · term  −  penalties
//
// Every term is normalised to [0, 1] (interest can dip below 0 when the viewer
// marked a topic "not interested"). Weights come from the surface config.

const { languageMatch } = require('./text');
const { geoScore } = require('./geo');

const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
// Maps [0, ∞) onto [0, 1); x = k gives 0.5.
const squash = (x, k) => (x > 0 ? x / (x + k) : 0);
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const ageHours = (createdAt, now) => Math.max(0, (now - new Date(createdAt).getTime()) / 3.6e6);

// Exponential decay with a half-life: 1 when new, 0.5 after `halfLife` hours.
const freshness = (hours, halfLife) => (halfLife > 0 ? Math.pow(2, -hours / halfLife) : 0);

const SIGNAL_WEIGHTS = { likes: 1, comments: 2, shares: 3, saves: 2, completions: 1.5, clicks: 2 };

// Normalises the different counter names across Post / Tweet / Ad / PromoteReel,
// topped up with FeedItemStats counters collected from client events.
const engagementCounts = (item, type, stats = {}) => {
  const counts = {
    likes: 0, comments: 0, shares: num(stats.shares), saves: num(stats.saves),
    completions: 0, clicks: num(stats.clicks), views: 0, impressions: num(stats.impressions),
  };
  if (type === 'tweet') {
    counts.likes = num(item.likesCount);
    counts.comments = num(item.repliesCount) + num(item.commentsCount);
    counts.shares += num(item.repostsCount) + num(item.quotesCount);
    counts.views = num(item.viewsCount);
  } else {
    counts.likes = num(item.likes_count);
    counts.comments = num(item.comments_count);
    counts.completions = Math.max(num(item.completed_views_count), num(stats.completions));
    counts.views = num(item.unique_views_count);
    if (type === 'ad') counts.clicks = Math.max(counts.clicks, num(item.clicks_count));
  }
  counts.impressions = Math.max(counts.impressions, counts.views);
  return counts;
};

const weightedEngagement = (counts) => Object.entries(SIGNAL_WEIGHTS)
  .reduce((sum, [key, weight]) => sum + weight * num(counts[key]), 0);

// Engagement per impression with Bayesian smoothing, so 2 likes from 2 views
// does not outrank 500 likes from 5,000. Until clients send impression events
// the denominator is just the prior, and this behaves like a raw count.
const engagementRate = (counts, prior = 50, baseline = 0.05) =>
  (weightedEngagement(counts) + prior * baseline) / (num(counts.impressions) + prior);

// Hacker-News style velocity, normalised by author reach so a small creator
// with strong engagement can out-trend a large account with weak engagement.
const trendScore = (counts, hours, followers = 0, gravity = 1.5) =>
  weightedEngagement(counts) / Math.pow(hours + 2, gravity) / Math.log10(num(followers) + 10);

const engagementScore = (counts, hours, followers) =>
  0.6 * squash(engagementRate(counts), 0.1) + 0.4 * squash(trendScore(counts, hours, followers), 1);

// Video: smoothed completion rate. Other formats: neutral.
const qualityScore = (counts, isVideo) => {
  if (!isVideo) return 0.5;
  const views = Math.max(num(counts.views), num(counts.completions));
  return (num(counts.completions) + 3 * 0.3) / (views + 3);
};

// Followed: 0.8–1.0. Not followed: 0.1, rising to 0.6 with repeated interaction.
// Negative weight (viewer hid this author's content) pulls it towards 0.
const affinityScore = (followed, authorWeight = 0) => {
  const weight = num(authorWeight);
  const base = followed ? 0.8 : 0.1;
  if (weight < 0) return clamp01(base * (1 - squash(-weight, 2)));
  return clamp01(base + (followed ? 0.2 : 0.5) * squash(weight, 2));
};

// Sum of the viewer's weights for the item's topics, squashed. Negative when
// the topics are ones the viewer marked "not interested".
const interestScore = (topics, interests) => {
  if (!Array.isArray(topics) || !topics.length || !interests) return 0;
  let sum = 0;
  for (const topic of topics) sum += num(interests[topic]);
  if (sum >= 0) return squash(sum, 3);
  return -0.5 * squash(-sum, 3);
};

const negativeRate = (stats = {}) =>
  (num(stats.hides) + num(stats.not_interested) + 0.3 * num(stats.skips)) / (num(stats.impressions) + 20);

const penaltyScore = (seenCount, negRate, penalties) =>
  Math.min(penalties.seenMax, num(seenCount) * penalties.seenPerImpression)
  + penalties.negativeFeedback * Math.min(1, negRate * 5);

const weightedSum = (terms, weights) => Object.entries(weights || {})
  .reduce((sum, [key, weight]) => sum + num(weight) * num(terms[key]), 0);

// candidate: { key, type, doc, authorId, authorFollowers, authorGeo, topics,
//              language, locationText, isVideo, createdAt, sources:Set }
// ctx:       { followedSet, authorWeights, interests, languages, geo, seenCounts }
const scoreCandidate = (candidate, ctx, surfaceCfg, config, stats, now) => {
  const hours = ageHours(candidate.createdAt, now);
  const counts = engagementCounts(candidate.doc, candidate.type, stats || {});
  const own = candidate.authorId === ctx.userId;
  const followed = own || ctx.followedSet.has(candidate.authorId);
  const lang = languageMatch(candidate.language, ctx.languages);
  const geo = geoScore(ctx.geo, candidate.authorGeo, candidate.locationText);

  const terms = {
    affinity: affinityScore(followed, ctx.authorWeights?.[candidate.authorId]),
    interest: interestScore(candidate.topics, ctx.interests),
    freshness: freshness(hours, surfaceCfg.halfLifeHours),
    engagement: engagementScore(counts, hours, candidate.authorFollowers),
    quality: qualityScore(counts, candidate.isVideo),
    locale: 0.5 * lang + 0.5 * geo,
  };
  const penalty = penaltyScore(ctx.seenCounts?.get(candidate.key) || 0, negativeRate(stats || {}), config.penalties);
  const score = weightedSum(terms, surfaceCfg.weights) - penalty;

  const reasons = [];
  if (own) reasons.push('yours');
  else if (followed) reasons.push('following');
  if (terms.interest >= 0.3) reasons.push('interests');
  if (geo >= 0.7) reasons.push('nearby');
  if (lang === 1 && ctx.languages?.length) reasons.push('language');
  if (candidate.sources?.has('trending') || terms.engagement >= 0.5) reasons.push('trending');
  if (terms.freshness >= 0.8) reasons.push('fresh');
  if (!reasons.length) reasons.push('recommended');

  return { score, terms, penalty, reasons, counts };
};

module.exports = {
  clamp01,
  squash,
  ageHours,
  freshness,
  engagementCounts,
  weightedEngagement,
  engagementRate,
  trendScore,
  engagementScore,
  qualityScore,
  affinityScore,
  interestScore,
  negativeRate,
  penaltyScore,
  weightedSum,
  scoreCandidate,
};
