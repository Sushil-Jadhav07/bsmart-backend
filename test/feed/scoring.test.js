const test = require('node:test');
const assert = require('node:assert/strict');
const {
  freshness, engagementCounts, engagementRate, trendScore, affinityScore,
  interestScore, qualityScore, penaltyScore, scoreCandidate,
} = require('../../src/feed/scoring');
const { DEFAULT_CONFIG } = require('../../src/feed/config');

const NOW = Date.parse('2026-09-10T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3.6e6);

test('freshness halves every half-life', () => {
  assert.equal(freshness(0, 24), 1);
  assert.equal(freshness(24, 24), 0.5);
  assert.equal(freshness(48, 24), 0.25);
});

test('engagementCounts normalises post and tweet counters', () => {
  const post = engagementCounts({ likes_count: 10, comments_count: 3, completed_views_count: 4, unique_views_count: 40 }, 'reel', { saves: 2, impressions: 100 });
  assert.deepEqual(
    { likes: post.likes, comments: post.comments, completions: post.completions, saves: post.saves, impressions: post.impressions },
    { likes: 10, comments: 3, completions: 4, saves: 2, impressions: 100 }
  );
  const tweet = engagementCounts({ likesCount: 5, repliesCount: 1, commentsCount: 2, repostsCount: 1, quotesCount: 1, viewsCount: 9 }, 'tweet');
  assert.equal(tweet.comments, 3);
  assert.equal(tweet.shares, 2);
  assert.equal(tweet.impressions, 9);
});

test('engagementRate is smoothed: 500 likes / 5,000 beats 2 likes / 2', () => {
  const tiny = engagementRate({ likes: 2, impressions: 2 });
  const big = engagementRate({ likes: 500, impressions: 5000 });
  assert.ok(big > tiny);
});

test('trendScore favours recency and small creators with the same engagement', () => {
  const counts = { likes: 20, comments: 5 };
  assert.ok(trendScore(counts, 1, 100) > trendScore(counts, 24, 100));
  assert.ok(trendScore(counts, 1, 100) > trendScore(counts, 1, 100000));
});

test('affinityScore', () => {
  assert.equal(affinityScore(true, 0), 0.8);
  assert.equal(affinityScore(false, 0), 0.1);
  const interacted = affinityScore(false, 6);
  assert.ok(interacted > 0.1 && interacted <= 0.6);
  assert.ok(affinityScore(true, -6) < 0.8);
  assert.ok(affinityScore(true, 50) <= 1);
});

test('interestScore is positive for liked topics and negative for rejected ones', () => {
  assert.equal(interestScore([], { cricket: 5 }), 0);
  assert.ok(interestScore(['cricket'], { cricket: 5 }) > 0.5);
  assert.ok(interestScore(['politics'], { politics: -8 }) < 0);
  assert.equal(interestScore(['food'], { cricket: 5 }), 0);
});

test('qualityScore uses completion rate for video only', () => {
  assert.equal(qualityScore({ views: 100, completions: 90 }, false), 0.5);
  assert.ok(qualityScore({ views: 100, completions: 90 }, true) > qualityScore({ views: 100, completions: 10 }, true));
});

test('penaltyScore caps the seen penalty', () => {
  const p = DEFAULT_CONFIG.penalties;
  assert.equal(penaltyScore(1, 0, p), p.seenPerImpression);
  assert.equal(penaltyScore(100, 0, p), p.seenMax);
  assert.ok(penaltyScore(0, 0.5, p) > 0);
});

const candidate = (overrides = {}) => ({
  key: 'c1',
  type: 'post',
  doc: { likes_count: 4, comments_count: 1 },
  authorId: 'author-1',
  authorFollowers: 100,
  authorGeo: { city: 'mumbai', state: 'maharashtra', country: 'india' },
  topics: ['travel'],
  language: 'en',
  locationText: '',
  isVideo: false,
  createdAt: hoursAgo(2),
  sources: new Set(['recent']),
  ...overrides,
});

const context = (overrides = {}) => ({
  userId: 'viewer',
  followedSet: new Set(),
  authorWeights: {},
  interests: {},
  languages: ['en'],
  geo: { city: 'pune', state: 'maharashtra', country: 'india' },
  seenCounts: new Map(),
  ...overrides,
});

const score = (c, ctx, surface = 'home') =>
  scoreCandidate(c, ctx, DEFAULT_CONFIG.surfaces[surface], DEFAULT_CONFIG, {}, NOW);

test('scoreCandidate: following, interests, language and freshness each lift the score', () => {
  const base = score(candidate(), context()).score;
  assert.ok(score(candidate(), context({ followedSet: new Set(['author-1']) })).score > base, 'following');
  assert.ok(score(candidate(), context({ interests: { travel: 6 } })).score > base, 'interest');
  assert.ok(score(candidate(), context({ languages: ['ta'] })).score < base, 'language mismatch');
  assert.ok(score(candidate({ createdAt: hoursAgo(72) }), context()).score < base, 'older');
});

test('scoreCandidate: already-seen items are pushed down', () => {
  const unseen = score(candidate(), context()).score;
  const seen = score(candidate(), context({ seenCounts: new Map([['c1', 2]]) })).score;
  assert.ok(seen < unseen);
});

test('scoreCandidate: reasons explain the ranking', () => {
  const followed = score(candidate(), context({ followedSet: new Set(['author-1']), interests: { travel: 6 } }));
  assert.ok(followed.reasons.includes('following'));
  assert.ok(followed.reasons.includes('interests'));
  const own = score(candidate({ authorId: 'viewer' }), context());
  assert.ok(own.reasons.includes('yours'));
  assert.ok(!own.reasons.includes('following'));
});

test('scoreCandidate: spotlight ignores affinity', () => {
  const ctxFollow = context({ followedSet: new Set(['author-1']) });
  assert.equal(score(candidate(), ctxFollow, 'spotlight').terms.affinity > 0, true);
  assert.equal(
    score(candidate(), ctxFollow, 'spotlight').score,
    score(candidate(), context(), 'spotlight').score
  );
});
