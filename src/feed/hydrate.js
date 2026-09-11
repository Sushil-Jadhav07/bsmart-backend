// ─── Hydration ──────────────────────────────────────────────────────────────
// Turns ranked entries back into full API items. Response shapes match the
// existing feeds so clients can reuse their renderers:
//   posts/reels    → transformPost (post.controller.js)
//   tweets         → same shape as transformTweet (post.controller.js), batched
//   ads / promotes → same shape as loadFeedAds (post.controller.js), plus is_saved_by_me
// If those shapes change, change them here too.

const Post = require('../models/Post');
const Tweet = require('../models/tweet.model');
const TweetLike = require('../models/tweetLike.model');
const TweetRepost = require('../models/tweetRepost.model');
const Ad = require('../models/Ad');
const AdView = require('../models/AdView');
const PromoteReel = require('../models/PromoteReel');
const SavedPost = require('../models/SavedPost');
const SavedAd = require('../models/SavedAd');
const SavedPromoteReel = require('../models/SavedPromoteReel');
require('../models/Vendor'); // registers the model used by populate('vendor_id')
const { transformPost, resolveMediaUrl } = require('../controllers/post.controller');

const POST_AUTHOR_SELECT = 'username full_name avatar_url followers_count following_count gender location isPrivate';
const TWEET_AUTHOR_SELECT = 'username full_name avatar_url';
const AD_AUTHOR_SELECT = 'username full_name avatar_url gender location isPrivate';
const PROMO_AUTHOR_SELECT = 'username full_name avatar_url isPrivate';

const hasId = (list, id) => Array.isArray(list) && list.some((x) => String(x) === String(id));
const idSet = (rows, field) => new Set(rows.map((row) => String(row[field])));

const absolute = (value, baseUrl) => {
  if (!value) return value;
  const str = String(value);
  return str.startsWith('http') ? str : `${baseUrl}${str.startsWith('/') ? '' : '/'}${str}`;
};

const commentCounts = (value) => {
  const count = Number(value ?? 0);
  return { commentsCount: count, comments_count: count, commentCount: count, comment_count: count };
};

const mapTweetAuthor = (author) => (author ? {
  ...(author.toObject ? author.toObject() : author),
  name: author.full_name || '',
  profilePicture: author.avatar_url || '',
  isVerified: false,
} : null);

const shapeTweet = (tweet, liked, reposted) => {
  const tweetObj = tweet.toObject ? tweet.toObject() : tweet;
  const explicit = tweetObj.commentsCount ?? tweetObj.comments_count ?? tweetObj.commentCount
    ?? tweetObj.comment_count ?? tweetObj.repliesCount;
  const count = Number.isFinite(Number(explicit))
    ? Number(explicit)
    : (Array.isArray(tweetObj.comments) ? tweetObj.comments.length : 0);
  return {
    item_type: 'tweet',
    ...tweetObj,
    ...commentCounts(count),
    author: mapTweetAuthor(tweetObj.author),
    repostOf: tweetObj.repostOf
      ? { ...tweetObj.repostOf, author: mapTweetAuthor(tweetObj.repostOf.author) }
      : null,
    isLiked: liked,
    isReposted: reposted,
  };
};

const viewerFlags = (authorId, viewerId, followedSet, isPrivate) => {
  const followed = authorId ? followedSet.has(authorId) : false;
  return {
    is_author_followed_by_me: followed,
    can_view_by_me: !isPrivate || authorId === viewerId || followed,
  };
};

const shapeAd = (ad, { baseUrl, viewerId, followedSet, rewardedSet, savedSet }) => {
  const media = Array.isArray(ad.media)
    ? ad.media.map((m) => ({
      ...m,
      fileUrl: m.fileUrl ? absolute(m.fileUrl, baseUrl) : resolveMediaUrl(m.fileName, m.fileUrl, baseUrl),
      thumbnails: Array.isArray(m.thumbnails)
        ? m.thumbnails.map((t) => ({
          ...t,
          fileUrl: t.fileUrl
            ? absolute(t.fileUrl, baseUrl)
            : (t.fileName ? resolveMediaUrl(t.fileName, t.fileUrl, baseUrl) : ''),
        }))
        : [],
    }))
    : [];
  const authorId = String(ad?.user_id?._id || ad?.user_id?.id || '');
  return {
    item_type: 'ad',
    ...ad,
    ...commentCounts(ad.commentsCount ?? ad.comments_count ?? ad.commentCount ?? ad.comment_count ?? 0),
    media,
    is_rewarded_by_me: rewardedSet.has(String(ad._id)),
    is_liked_by_me: hasId(ad.likes, viewerId),
    is_saved_by_me: savedSet.has(String(ad._id)),
    ...viewerFlags(authorId, viewerId, followedSet, ad?.user_id?.isPrivate),
  };
};

const shapePromoteReel = (reel, { baseUrl, viewerId, followedSet, savedSet }) => {
  const media = Array.isArray(reel.media)
    ? reel.media.map((m) => {
      const fileUrl = m.fileName ? resolveMediaUrl(m.fileName, m.fileUrl, baseUrl) : absolute(m.fileUrl, baseUrl);
      const thumbnails = Array.isArray(m.thumbnails)
        ? m.thumbnails.map((t) => ({ ...t, fileUrl: resolveMediaUrl(t.fileName, t.fileUrl, baseUrl) }))
        : (m.thumbnail?.fileName
          ? [{ ...m.thumbnail, fileUrl: resolveMediaUrl(m.thumbnail.fileName, m.thumbnail.fileUrl, baseUrl) }]
          : []);
      return { ...m, type: 'video', media_type: 'video', fileUrl, url: fileUrl, thumbnails };
    })
    : [];
  const authorId = String(reel?.user_id?._id || reel?.user_id?.id || '');
  return {
    item_type: 'promote_reel',
    ...reel,
    promote_reel_id: reel._id,
    media,
    ...commentCounts(reel.comments_count ?? 0),
    is_liked_by_me: hasId(reel.likes, viewerId),
    is_saved_by_me: savedSet.has(String(reel._id)),
    ...viewerFlags(authorId, viewerId, followedSet, reel?.user_id?.isPrivate),
  };
};

// entries: [{ key, type, meta }] in ranked order. Items deleted, paused or
// otherwise gone since ranking are dropped.
const hydrate = async (entries, { viewerId, baseUrl, followedSet }) => {
  const idsOf = (...types) => entries.filter((e) => types.includes(e.type)).map((e) => e.key);
  const postIds = idsOf('post', 'reel');
  const tweetIds = idsOf('tweet');
  const adIds = idsOf('ad');
  const promoIds = idsOf('promote_reel');
  const none = Promise.resolve([]);

  const [posts, savedPosts, tweets, tweetLikes, tweetReposts, ads, rewarded, savedAds, promos, savedPromos] = await Promise.all([
    postIds.length ? Post.find({ _id: { $in: postIds }, isDeleted: false }).populate('user_id', POST_AUTHOR_SELECT) : none,
    postIds.length ? SavedPost.find({ user_id: viewerId, post_id: { $in: postIds } }).select('post_id').lean() : none,
    tweetIds.length
      ? Tweet.find({ _id: { $in: tweetIds }, isDeleted: false })
        .populate('author', TWEET_AUTHOR_SELECT)
        .populate({ path: 'repostOf', populate: { path: 'author', select: TWEET_AUTHOR_SELECT } })
      : none,
    tweetIds.length ? TweetLike.find({ user: viewerId, tweet: { $in: tweetIds } }).select('tweet').lean() : none,
    tweetIds.length ? TweetRepost.find({ user: viewerId, tweet: { $in: tweetIds } }).select('tweet').lean() : none,
    adIds.length
      ? Ad.find({ _id: { $in: adIds }, isDeleted: false, status: 'active' })
        .populate('vendor_id', 'business_name logo_url validated')
        .populate('user_id', AD_AUTHOR_SELECT)
        .lean()
      : none,
    adIds.length ? AdView.find({ user_id: viewerId, ad_id: { $in: adIds }, rewarded: true }).select('ad_id').lean() : none,
    adIds.length ? SavedAd.find({ user_id: viewerId, ad_id: { $in: adIds } }).select('ad_id').lean() : none,
    promoIds.length
      ? PromoteReel.find({ _id: { $in: promoIds }, isDeleted: false }).populate('user_id', PROMO_AUTHOR_SELECT).lean()
      : none,
    promoIds.length
      ? SavedPromoteReel.find({ user_id: viewerId, promote_reel_id: { $in: promoIds } }).select('promote_reel_id').lean()
      : none,
  ]);

  const viewer = String(viewerId);
  const items = new Map();

  const savedPostSet = idSet(savedPosts, 'post_id');
  for (const post of posts) {
    const item = transformPost(post, baseUrl, viewerId, savedPostSet);
    const authorId = String(item?.user_id?._id || item?.user_id?.id || '');
    Object.assign(item, viewerFlags(authorId, viewer, followedSet, item?.user_id?.isPrivate));
    items.set(String(post._id), item);
  }

  const likedTweets = idSet(tweetLikes, 'tweet');
  const repostedTweets = idSet(tweetReposts, 'tweet');
  for (const tweet of tweets) {
    const key = String(tweet._id);
    items.set(key, shapeTweet(tweet, likedTweets.has(key), repostedTweets.has(key)));
  }

  const adCtx = { baseUrl, viewerId: viewer, followedSet, rewardedSet: idSet(rewarded, 'ad_id'), savedSet: idSet(savedAds, 'ad_id') };
  for (const ad of ads) items.set(String(ad._id), shapeAd(ad, adCtx));

  const promoCtx = { baseUrl, viewerId: viewer, followedSet, savedSet: idSet(savedPromos, 'promote_reel_id') };
  for (const reel of promos) items.set(String(reel._id), shapePromoteReel(reel, promoCtx));

  return entries
    .map((entry) => {
      const item = items.get(entry.key);
      return item ? { ...item, feed_meta: entry.meta } : null;
    })
    .filter(Boolean);
};

module.exports = { hydrate, shapeTweet, shapeAd, shapePromoteReel };
