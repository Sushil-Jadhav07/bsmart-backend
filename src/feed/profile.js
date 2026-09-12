// ─── Viewer profile & context ───────────────────────────────────────────────
// Everything the ranker needs to know about the viewer, assembled at most
// once a minute per user: who they follow, who they blocked or muted, what
// they are into, which languages they read, where they are, and what they
// have already seen.

const mongoose = require('mongoose');
const Post = require('../models/Post');
const Tweet = require('../models/tweet.model');
const TweetLike = require('../models/tweetLike.model');
const TweetRepost = require('../models/tweetRepost.model');
const SavedPost = require('../models/SavedPost');
const PostView = require('../models/PostView');
const Block = require('../models/Block');
const Mute = require('../models/Mute');
const ContentReport = require('../models/ContentReport');
const FeedEvent = require('../models/FeedEvent');
const FeedProfile = require('../models/FeedProfile');
const { getFollowedUserIds, getBlockedPrivateUserIds } = require('../utils/privacyVisibility');
const { expandTerm, parseAcceptLanguage } = require('./text');
const { placeFromUser } = require('./geo');
const { describeItem, postItemType } = require('./items');
const TtlCache = require('./cache');

// Signal strength per interaction. Negative values push topics/authors down.
const EVENT_WEIGHTS = {
  impression: 0, view: 0.2, dwell: 0.3, complete: 1.5,
  like: 2, comment: 3, share: 4, repost: 4, save: 3, click: 2, follow: 3,
  skip: -0.5, hide: -4, not_interested: -5,
};

const BUCKETS = ['interests', 'authors', 'languages', 'types'];
const contextCache = new TtlCache({ max: 10000 });
const rebuilding = new Set();
const learningChains = new Map();

// ─── Signal helpers ─────────────────────────────────────────────────────────
const emptySignals = () => ({ interests: {}, authors: {}, languages: {}, types: {} });

const addSignal = (signals, item, weight) => {
  if (!weight || !item) return;
  const bump = (bucket, key, w) => {
    if (!key) return;
    signals[bucket][key] = (signals[bucket][key] || 0) + w;
  };
  for (const topic of item.topics || []) bump('interests', topic, weight);
  bump('authors', item.authorId, weight);
  // Hiding a post says nothing against its language or format.
  if (weight > 0) {
    bump('languages', item.language, weight);
    bump('types', item.type, weight);
  }
};

const decaySignals = (signals, since, now, halfLifeDays) => {
  const out = emptySignals();
  const days = since ? Math.max(0, (now - new Date(since).getTime()) / 864e5) : 0;
  const factor = halfLifeDays > 0 ? Math.pow(2, -days / halfLifeDays) : 1;
  for (const bucket of BUCKETS) {
    for (const [key, value] of Object.entries(signals?.[bucket] || {})) {
      const decayed = Number(value) * factor;
      if (Math.abs(decayed) >= 0.01) out[bucket][key] = decayed;
    }
  }
  return out;
};

const mergeSignals = (a, b) => {
  const out = emptySignals();
  for (const source of [a, b]) {
    for (const bucket of BUCKETS) {
      for (const [key, value] of Object.entries(source?.[bucket] || {})) {
        out[bucket][key] = (out[bucket][key] || 0) + Number(value || 0);
      }
    }
  }
  return out;
};

const pruneSignals = (signals, { maxInterests, maxAuthors }) => {
  const keepTop = (bucket, max) => Object.fromEntries(
    Object.entries(bucket || {})
      .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
      .slice(0, max)
  );
  return {
    interests: keepTop(signals.interests, maxInterests),
    authors: keepTop(signals.authors, maxAuthors),
    languages: keepTop(signals.languages, 20),
    types: keepTop(signals.types, 10),
  };
};

// Languages that make up at least 20% of the positive language signal.
const inferLanguages = (languageWeights, max = 3) => {
  const entries = Object.entries(languageWeights || {}).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (!total) return [];
  return entries
    .sort((a, b) => b[1] - a[1])
    .filter(([, w]) => w / total >= 0.2)
    .slice(0, max)
    .map(([code]) => code);
};

const ageFromUser = (user) => {
  if (Number.isFinite(user.age) && user.age > 0) return user.age;
  if (!user.date_of_birth) return null;
  const dob = new Date(user.date_of_birth);
  if (Number.isNaN(dob.getTime())) return null;
  return Math.floor((Date.now() - dob.getTime()) / (365.25 * 864e5));
};

// ─── History: signals rebuilt from existing data ────────────────────────────
const POST_FIELDS = 'user_id caption tags type media.type';
const TWEET_FIELDS = 'author content quoteContent';

const rebuildHistory = async (user, config) => {
  const userId = user._id;
  const since = new Date(Date.now() - config.profile.historyDays * 864e5);

  const [savedAll, viewsAll, tweetLikesAll, tweetRepostsAll, likedPostsAll, ownPosts, ownTweets, tracked] = await Promise.all([
    SavedPost.find({ user_id: userId, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(300).select('post_id').lean(),
    PostView.find({ user_id: userId, updatedAt: { $gte: since } }).sort({ updatedAt: -1 }).limit(500)
      .select('post_id completed watchTimeMs view_count').lean(),
    TweetLike.find({ user: userId, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(300).select('tweet').lean(),
    TweetRepost.find({ user: userId, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(200).select('tweet').lean(),
    // Post likes are an array on the post with no timestamp, so the window is the post's age.
    Post.find({ likes: userId, isDeleted: false, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(300)
      .select(POST_FIELDS).lean(),
    Post.find({ user_id: userId, isDeleted: false }).sort({ createdAt: -1 }).limit(50).select(POST_FIELDS).lean(),
    Tweet.find({ author: userId, isDeleted: false }).sort({ createdAt: -1 }).limit(50).select(TWEET_FIELDS).lean(),
    // Interactions the server already logged as feed events (track.js) are
    // learned from those events; they are skipped below so nothing counts twice.
    FeedEvent.find({ user_id: userId, source: 'server', event: { $in: ['like', 'save', 'repost', 'view', 'complete'] } })
      .sort({ createdAt: -1 }).limit(5000).select('item_id event').lean(),
  ]);

  const trackedKeys = new Set(tracked.map((t) => `${t.event === 'complete' ? 'view' : t.event}:${t.item_id}`));
  const untracked = (event, idOf) => (row) => !trackedKeys.has(`${event}:${idOf(row)}`);
  const saved = savedAll.filter(untracked('save', (s) => s.post_id));
  const views = viewsAll.filter(untracked('view', (v) => v.post_id));
  const tweetLikes = tweetLikesAll.filter(untracked('like', (l) => l.tweet));
  const tweetReposts = tweetRepostsAll.filter(untracked('repost', (r) => r.tweet));
  const likedPosts = likedPostsAll.filter(untracked('like', (p) => p._id));

  const postIds = [...saved.map((s) => s.post_id), ...views.map((v) => v.post_id)];
  const tweetIds = [...tweetLikes.map((l) => l.tweet), ...tweetReposts.map((r) => r.tweet)];
  const [posts, tweets] = await Promise.all([
    postIds.length ? Post.find({ _id: { $in: postIds }, isDeleted: false }).select(POST_FIELDS).lean() : [],
    tweetIds.length ? Tweet.find({ _id: { $in: tweetIds }, isDeleted: false }).select(TWEET_FIELDS).lean() : [],
  ]);
  const postMap = new Map(posts.map((p) => [String(p._id), p]));
  const tweetMap = new Map(tweets.map((t) => [String(t._id), t]));

  const signals = emptySignals();
  const addPost = (doc, weight) => doc && addSignal(signals, describeItem(doc, postItemType(doc)), weight);
  const addTweet = (doc, weight) => doc && addSignal(signals, describeItem(doc, 'tweet'), weight);

  likedPosts.forEach((p) => addPost(p, EVENT_WEIGHTS.like));
  saved.forEach((s) => addPost(postMap.get(String(s.post_id)), EVENT_WEIGHTS.save));
  views.forEach((v) => {
    let weight = v.completed
      ? EVENT_WEIGHTS.complete
      : EVENT_WEIGHTS.view + Math.min((v.watchTimeMs || 0) / 15000, 1) * 0.5;
    if ((v.view_count || 0) > 1) weight += 0.5; // rewatched
    addPost(postMap.get(String(v.post_id)), weight);
  });
  tweetLikes.forEach((l) => addTweet(tweetMap.get(String(l.tweet)), EVENT_WEIGHTS.like));
  tweetReposts.forEach((r) => addTweet(tweetMap.get(String(r.tweet)), EVENT_WEIGHTS.share));

  // What the viewer posts shows what they are into and which language they
  // write in — but must not build affinity towards themselves.
  const addOwn = (item) => addSignal(signals, { ...item, authorId: null }, 1);
  ownPosts.forEach((p) => addOwn(describeItem(p, postItemType(p))));
  ownTweets.forEach((t) => addOwn(describeItem(t, 'tweet')));

  return pruneSignals(signals, config.profile);
};

// Upsert helper: two first requests for the same user can race on the unique index.
const upsertProfile = async (userId, update) => {
  try {
    return await FeedProfile.findOneAndUpdate({ user_id: userId }, update, { upsert: true, new: true }).lean();
  } catch (err) {
    if (err?.code !== 11000) throw err;
    return FeedProfile.findOneAndUpdate({ user_id: userId }, update, { new: true }).lean();
  }
};

const buildAndStoreHistory = async (user, config) => {
  const history = await rebuildHistory(user, config);
  return upsertProfile(user._id, { $set: { history, history_built_at: new Date() } });
};

const ensureProfile = async (user, config) => {
  const profile = await FeedProfile.findOne({ user_id: user._id }).lean();
  // The first feed load waits for the build so it is personalised immediately.
  if (!profile?.history_built_at) return buildAndStoreHistory(user, config);

  const key = String(user._id);
  const ageMs = Date.now() - new Date(profile.history_built_at).getTime();
  if (ageMs > config.profile.rebuildAfterHours * 3.6e6 && !rebuilding.has(key)) {
    rebuilding.add(key);
    buildAndStoreHistory(user, config)
      .then(() => contextCache.delete(key))
      .catch((err) => console.error('[Feed] History rebuild failed:', err.message))
      .finally(() => rebuilding.delete(key));
  }
  return profile;
};

// ─── Viewer context ─────────────────────────────────────────────────────────
const getViewerContext = async (user, config) => {
  const key = String(user._id);
  const cached = contextCache.get(key);
  if (cached) return cached;

  const userId = new mongoose.Types.ObjectId(key);
  const now = Date.now();
  const seenSince = new Date(now - config.penalties.seenWindowHours * 3.6e6);

  const [followedIds, blockedPrivateIds, blocks, mutes, profile, seen, negatives, reports] = await Promise.all([
    getFollowedUserIds(userId),
    getBlockedPrivateUserIds(userId),
    Block.find({ $or: [{ blocker_id: userId }, { blocked_id: userId }] }).select('blocker_id blocked_id').lean(),
    Mute.find({ muter_id: userId }).select('muted_id').lean(),
    ensureProfile(user, config),
    FeedEvent.aggregate([
      { $match: { user_id: userId, event: 'impression', createdAt: { $gte: seenSince } } },
      { $group: { _id: '$item_id', n: { $sum: 1 } } },
      { $limit: 5000 },
    ]),
    FeedEvent.find({ user_id: userId, event: { $in: ['hide', 'not_interested'] } })
      .sort({ createdAt: -1 }).limit(2000).select('item_id').lean(),
    ContentReport.find({ reporter_id: userId }).sort({ createdAt: -1 }).limit(2000).select('content_id').lean(),
  ]);

  // Blocking works both ways: neither side sees the other's content.
  const excluded = new Set(blockedPrivateIds.map(String));
  for (const b of blocks) excluded.add(String(String(b.blocker_id) === key ? b.blocked_id : b.blocker_id));
  for (const m of mutes) excluded.add(String(m.muted_id));
  excluded.delete(key);

  const learned = decaySignals(profile?.learned, profile?.learned_updated_at, now, config.profile.halfLifeDays);
  const signals = mergeSignals(profile?.history, learned);

  const interests = { ...signals.interests };
  const declare = (terms, weight) => {
    for (const term of terms.flatMap(expandTerm)) interests[term] = (interests[term] || 0) + weight;
  };
  declare(profile?.declared_interests || [], 3);
  declare((user.ad_interests || []).filter((i) => i && i !== 'All'), 2);

  const ctx = {
    userId: key,
    userObjectId: userId,
    followedIds: followedIds.map(String),
    followedSet: new Set(followedIds.map(String)),
    excludedAuthorIds: [...excluded],
    interests,
    authorWeights: signals.authors,
    typeWeights: signals.types,
    explicitLanguages: profile?.preferred_languages || [],
    inferredLanguages: inferLanguages(signals.languages),
    geo: placeFromUser(user),
    age: ageFromUser(user),
    gender: user.gender || '',
    seenCounts: new Map(seen.map((s) => [String(s._id), s.n])),
    hiddenSet: new Set(negatives.map((n) => String(n.item_id))),
    reportedSet: new Set(reports.map((r) => String(r.content_id))),
  };
  return contextCache.set(key, ctx, config.profile.cacheTtlMs);
};

// An explicit preference wins; otherwise inferred languages plus the
// device/app hint (Accept-Language header or ?lang=).
const resolveLanguages = (ctx, hint) => {
  if (ctx.explicitLanguages.length) return ctx.explicitLanguages.slice();
  return [...new Set([...ctx.inferredLanguages, ...parseAcceptLanguage(hint)])].slice(0, 4);
};

const invalidateViewer = (userId) => contextCache.delete(String(userId));

// Serialised per user so concurrent event batches don't overwrite each other.
const learnFromInteractions = (userId, interactions, config) => {
  const key = String(userId);
  const previous = learningChains.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const profile = await FeedProfile.findOne({ user_id: userId }).select('learned learned_updated_at').lean();
    const now = Date.now();
    const learned = decaySignals(profile?.learned, profile?.learned_updated_at, now, config.profile.halfLifeDays);
    for (const { item, weight } of interactions) addSignal(learned, item, weight);
    await upsertProfile(userId, {
      $set: { learned: pruneSignals(learned, config.profile), learned_updated_at: new Date(now) },
    });
    contextCache.delete(key);
  });
  learningChains.set(key, next);
  next.catch(() => {}).finally(() => {
    if (learningChains.get(key) === next) learningChains.delete(key);
  });
  return next;
};

module.exports = {
  EVENT_WEIGHTS,
  emptySignals,
  addSignal,
  decaySignals,
  mergeSignals,
  pruneSignals,
  inferLanguages,
  rebuildHistory,
  getViewerContext,
  resolveLanguages,
  invalidateViewer,
  learnFromInteractions,
};
