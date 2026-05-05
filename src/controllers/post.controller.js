const Post         = require('../models/Post');
const User         = require('../models/User');
const Comment      = require('../models/Comment');
const Ad           = require('../models/Ad');
const AdView       = require('../models/AdView');
const SavedPost    = require('../models/SavedPost');
const Follow       = require('../models/Follow');
const Tweet       = require('../models/tweet.model');
const TweetLike   = require('../models/tweetLike.model');
const TweetRepost = require('../models/tweetRepost.model');
const PromoteReel  = require('../models/PromoteReel');
const sendNotification = require('../utils/sendNotification');
const UserNotificationPreference = require('../models/UserNotificationPreference');
const { getBlockedPrivateUserIds, canViewAuthorContent, getFollowedUserIds } = require('../utils/privacyVisibility');

// ─── Helper ────────────────────────────────────────────────────────────────
// Transforms a Mongoose post document into the API response shape.
// Adds fileUrl, is_liked_by_me, is_saved_by_me to each post.
const transformPost = (post, baseUrl, currentUserId = null, savedSet = null) => {
  const postObj = post.toObject ? post.toObject() : post;
  const toAbsolute = (value) => {
    if (!value) return value;
    const str = String(value);
    if (str.startsWith('http')) return str;
    return `${baseUrl}${str.startsWith('/') ? '' : '/'}${str}`;
  };

  postObj.post_id = postObj._id;
  postObj.item_type = postObj.type === 'reel' ? 'reel' : 'post';

  if (postObj.media && Array.isArray(postObj.media)) {
    postObj.media = postObj.media.map(item => {
      const rawFileName = item.fileName || '';
      const rawMediaUrl = item.fileUrl || item.url || '';
      const inferredIsVideoByName = /\.(mp4|mov|webm|ogg|mkv|m4v|m3u8)$/i.test(String(rawFileName));
      const inferredIsVideoByUrl = /\.(mp4|mov|webm|ogg|mkv|m4v|m3u8)(\?.*)?$/i.test(String(rawMediaUrl));
      const normalizedType = (item.type === 'video' || item.media_type === 'video' || (postObj.type === 'reel' && (inferredIsVideoByName || inferredIsVideoByUrl)))
        ? 'video'
        : (item.type || 'image');
      const fileUrl = item.fileName ? `${baseUrl}/uploads/${item.fileName}` : toAbsolute(item.fileUrl);
      const url = item.url ? toAbsolute(item.url) : fileUrl;
      let thumbnailArray = [];
      if (Array.isArray(item.thumbnails)) {
        thumbnailArray = item.thumbnails.map(t => ({
          ...t,
          fileUrl: t.fileName ? `${baseUrl}/uploads/${t.fileName}` : toAbsolute(t.fileUrl),
        }));
      } else if (item.thumbnail && item.thumbnail.fileName) {
        thumbnailArray = [{
          ...item.thumbnail,
          fileUrl: `${baseUrl}/uploads/${item.thumbnail.fileName}`,
        }];
      }
      return { ...item, type: normalizedType, media_type: normalizedType, fileUrl, url, thumbnail: thumbnailArray };
    });
  }

  postObj.is_liked_by_me = currentUserId && postObj.likes
    ? postObj.likes.some(id => id.toString() === currentUserId.toString())
    : false;

  postObj.is_saved_by_me = savedSet && postObj._id
    ? savedSet.has(postObj._id.toString())
    : false;

  const explicitCommentCount =
    postObj.commentsCount
    ?? postObj.comments_count
    ?? postObj.commentCount
    ?? postObj.comment_count;
  const normalizedCommentCount = Number.isFinite(Number(explicitCommentCount))
    ? Number(explicitCommentCount)
    : (Array.isArray(postObj.comments) ? postObj.comments.length : 0);
  postObj.commentsCount = normalizedCommentCount;
  postObj.comments_count = normalizedCommentCount;
  postObj.commentCount = normalizedCommentCount;
  postObj.comment_count = normalizedCommentCount;

  return postObj;
};

const transformTweet = async (tweet, currentUserId = null) => {
  const tweetObj = tweet.toObject ? tweet.toObject() : tweet;
  const [liked, reposted] = await Promise.all([
    currentUserId ? TweetLike.exists({ user: currentUserId, tweet: tweetObj._id }) : false,
    currentUserId ? TweetRepost.exists({ user: currentUserId, tweet: tweetObj._id }) : false,
  ]);

  const explicitCommentCount =
    tweetObj.commentsCount
    ?? tweetObj.comments_count
    ?? tweetObj.commentCount
    ?? tweetObj.comment_count
    ?? tweetObj.repliesCount;
  const normalizedCommentCount = Number.isFinite(Number(explicitCommentCount))
    ? Number(explicitCommentCount)
    : (Array.isArray(tweetObj.comments) ? tweetObj.comments.length : 0);

  return {
    item_type: 'tweet',
    ...tweetObj,
    commentsCount: normalizedCommentCount,
    comments_count: normalizedCommentCount,
    commentCount: normalizedCommentCount,
    comment_count: normalizedCommentCount,
    author: tweetObj.author ? {
      ...(tweetObj.author.toObject ? tweetObj.author.toObject() : tweetObj.author),
      name: tweetObj.author.full_name || '',
      profilePicture: tweetObj.author.avatar_url || '',
      isVerified: false,
    } : null,
    repostOf: tweetObj.repostOf ? {
      ...(tweetObj.repostOf.toObject ? tweetObj.repostOf.toObject() : tweetObj.repostOf),
      author: tweetObj.repostOf.author ? {
        ...(tweetObj.repostOf.author.toObject ? tweetObj.repostOf.author.toObject() : tweetObj.repostOf.author),
        name: tweetObj.repostOf.author.full_name || '',
        profilePicture: tweetObj.repostOf.author.avatar_url || '',
        isVerified: false,
      } : null,
    } : null,
    isLiked: !!liked,
    isReposted: !!reposted,
  };
};

const loadFeedAds = async (req, feedItems, baseUrl, blockedPrivateUserIds = []) => {
  const adSlots = Math.floor(feedItems.length / 5);
  if (adSlots <= 0) {
    return feedItems;
  }

  const adQuery = { status: 'active', isDeleted: false };
  if (blockedPrivateUserIds.length > 0) {
    adQuery.user_id = { $nin: blockedPrivateUserIds };
  }

  // Fetch ads, rewarded views, AND promote reels in parallel
  const [ads, rewarded, promoteReels] = await Promise.all([
    Ad.find(adQuery)
      .sort({ createdAt: -1 })
      .limit(Math.max(1, adSlots))
      .populate('vendor_id', 'business_name logo_url validated')
      .populate('user_id', 'username full_name avatar_url gender location isPrivate')
      .lean(),
    AdView.find({ user_id: req.userId, rewarded: true }).select('ad_id').lean(),
    // One promote reel per ad slot so each ad is immediately followed by one
    PromoteReel.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(Math.max(1, adSlots))
      .populate('user_id', 'username full_name avatar_url isPrivate')
      .lean(),
  ]);

  if (!ads.length) {
    return feedItems;
  }

  const rewardedSet = new Set(rewarded.map(r => r.ad_id.toString()));

  const followedIds = await getFollowedUserIds(req.userId);
  const followedSet = new Set(followedIds.map((id) => String(id)));
  const viewerId = String(req.userId);

  const normalizedAds = ads.map((ad) => {
    const normalizedMedia = Array.isArray(ad.media)
      ? ad.media.map((m) => {
        const fileUrl = m.fileUrl
          ? (String(m.fileUrl).startsWith('http') ? m.fileUrl : `${baseUrl}${String(m.fileUrl).startsWith('/') ? '' : '/'}${m.fileUrl}`)
          : (m.fileName ? `${baseUrl}/uploads/${m.fileName}` : '');
        const thumbnails = Array.isArray(m.thumbnails)
          ? m.thumbnails.map((t) => {
            const thumbUrl = t.fileUrl
              ? (String(t.fileUrl).startsWith('http') ? t.fileUrl : `${baseUrl}${String(t.fileUrl).startsWith('/') ? '' : '/'}${t.fileUrl}`)
              : (t.fileName ? `${baseUrl}/uploads/${t.fileName}` : '');
            return { ...t, fileUrl: thumbUrl };
          })
          : [];
        return { ...m, fileUrl, thumbnails };
      })
      : [];

    const authorId = String(ad?.user_id?._id || ad?.user_id?.id || '');
    const isAuthorFollowed = authorId ? followedSet.has(authorId) : false;
    return {
      item_type:        'ad',
      ...ad,
      commentsCount: Number(ad.commentsCount ?? ad.comments_count ?? ad.commentCount ?? ad.comment_count ?? 0),
      comments_count: Number(ad.commentsCount ?? ad.comments_count ?? ad.commentCount ?? ad.comment_count ?? 0),
      commentCount: Number(ad.commentsCount ?? ad.comments_count ?? ad.commentCount ?? ad.comment_count ?? 0),
      comment_count: Number(ad.commentsCount ?? ad.comments_count ?? ad.commentCount ?? ad.comment_count ?? 0),
      media:            normalizedMedia,
      is_rewarded_by_me: rewardedSet.has(ad._id.toString()),
      is_liked_by_me:   Array.isArray(ad.likes) && ad.likes.some(id => id.toString() === req.userId.toString()),
      is_author_followed_by_me: isAuthorFollowed,
      can_view_by_me: !ad?.user_id?.isPrivate || authorId === viewerId || isAuthorFollowed,
    };
  });

  // ── Normalise promote reels ────────────────────────────────────────────────
  const normalizedPromoteReels = promoteReels.map((pr) => {
    const toAbsolute = (val) => {
      if (!val) return val;
      const s = String(val);
      return s.startsWith('http') ? s : `${baseUrl}${s.startsWith('/') ? '' : '/'}${s}`;
    };

    const normalizedMedia = Array.isArray(pr.media)
      ? pr.media.map((m) => {
        const fileUrl = m.fileName
          ? `${baseUrl}/uploads/${m.fileName}`
          : toAbsolute(m.fileUrl);
        const thumbnails = Array.isArray(m.thumbnails)
          ? m.thumbnails.map(t => ({
            ...t,
            fileUrl: t.fileName ? `${baseUrl}/uploads/${t.fileName}` : toAbsolute(t.fileUrl),
          }))
          : (m.thumbnail?.fileName
            ? [{ ...m.thumbnail, fileUrl: `${baseUrl}/uploads/${m.thumbnail.fileName}` }]
            : []);
        return { ...m, type: 'video', media_type: 'video', fileUrl, url: fileUrl, thumbnails };
      })
      : [];

    const prAuthorId = String(pr?.user_id?._id || pr?.user_id?.id || '');
    const isPrAuthorFollowed = prAuthorId ? followedSet.has(prAuthorId) : false;
    return {
      item_type:       'promote_reel',
      ...pr,
      promote_reel_id: pr._id,
      media:           normalizedMedia,
      commentsCount:   Number(pr.comments_count ?? 0),
      comments_count:  Number(pr.comments_count ?? 0),
      commentCount:    Number(pr.comments_count ?? 0),
      comment_count:   Number(pr.comments_count ?? 0),
      is_liked_by_me:  Array.isArray(pr.likes) && pr.likes.some(id => id.toString() === req.userId.toString()),
      is_author_followed_by_me: isPrAuthorFollowed,
      can_view_by_me:  !pr?.user_id?.isPrivate || prAuthorId === viewerId || isPrAuthorFollowed,
    };
  });

  // ── Interleave: every 5 posts → ad → promote_reel (if any) ───────────────
  // Pattern: [post, post, post, post, post, ad, promote_reel, post, post, ...]
  const mixed = [];
  let adIndex = 0;
  for (let i = 0; i < feedItems.length; i++) {
    mixed.push(feedItems[i]);
    if ((i + 1) % 5 === 0) {
      // 1. Push the ad
      mixed.push(normalizedAds[adIndex % normalizedAds.length]);
      // 2. Push the promote reel immediately after the ad
      if (normalizedPromoteReels.length > 0) {
        mixed.push(normalizedPromoteReels[adIndex % normalizedPromoteReels.length]);
      }
      adIndex++;
    }
  }

  return mixed;
};

// ─── Fan-out helper ────────────────────────────────────────────────────────
// Notifies all users who have turned on notifications for the post author.
// postType: 'post' | 'reel'
const notifySubscribers = async (app, authorId, authorUsername, postId, postType) => {
  try {
    const notifType = postType === 'reel' ? 'subscribed_user_reel' : 'subscribed_user_post';
    const contentLabel = postType === 'reel' ? 'reel' : 'post';
    const preferenceField = postType === 'reel' ? 'notify_on_reel' : 'notify_on_post';

    // Find everyone who has notifications turned on for this user
    const prefs = await UserNotificationPreference.find({
      target_id:   authorId,
      target_type: 'user',
      [preferenceField]: true,
    }).select('subscriber_id').lean();

    if (!prefs.length) return;

    const message = `@${authorUsername} posted a new ${contentLabel}`;
    const link    = `/posts/${postId}`;

    for (const pref of prefs) {
      await sendNotification(app, {
        recipient: pref.subscriber_id,
        sender:    authorId,
        type:      notifType,
        message,
        link,
      });
    }
  } catch (err) {
    console.error('[Post] notifySubscribers error:', err.message);
  }
};

// ─── Create post ───────────────────────────────────────────────────────────
// POST /api/posts
exports.createPost = async (req, res) => {
  try {
    const { caption, location, media, tags, people_tags, hide_likes_count, turn_off_commenting, type } = req.body;

    if (!media || media.length === 0) {
      return res.status(400).json({ message: 'At least one media item is required' });
    }

    const validCropModes = ['original', '1:1', '4:5', '16:9'];
    for (const item of media) {
      if (!item.fileName) {
        return res.status(400).json({ message: 'Each media item must have a fileName' });
      }
      if (item.crop && item.crop.mode && !validCropModes.includes(item.crop.mode)) {
        return res.status(400).json({ message: `Invalid crop mode: ${item.crop.mode}` });
      }
    }

    const post = await Post.create({
      user_id: req.userId,
      caption,
      location,
      media,
      tags,
      people_tags,
      hide_likes_count,
      turn_off_commenting,
      type,
    });

    await User.findByIdAndUpdate(req.userId, { $inc: { posts_count: 1 } });

    // Send tag notifications — wrapped in its own try/catch so a notification
    // failure never breaks the post creation response
    try {
      const creator = await User.findById(req.userId).select('username').lean();

      // 1. People-tag notifications
      if (Array.isArray(people_tags) && people_tags.length > 0) {
        for (const taggedUserId of people_tags) {
          if (taggedUserId.toString() !== req.userId.toString()) {
            await sendNotification(req.app, {
              recipient: taggedUserId,
              sender:    req.userId,
              type:      'post_tag',
              message:   `${creator.username} tagged you in a post`,
              link:      `/posts/${post._id}`,
            });
          }
        }
      }

      // 2. Subscriber notifications (users who turned on notifications for this author)
      const postType = type === 'reel' ? 'reel' : 'post';
      await notifySubscribers(req.app, req.userId, creator.username, post._id, postType);

    } catch (notifErr) {
      console.error('[Post] Notification error:', notifErr.message);
    }

    const populatedPost = await post.populate('user_id', 'username full_name avatar_url followers_count following_count gender location');
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(201).json(transformPost(populatedPost, baseUrl));
  } catch (error) {
    console.error('[Post] createPost error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── Feed ──────────────────────────────────────────────────────────────────
// GET /api/posts/feed?page=1&limit=20
// FIX: Added pagination (.skip + .limit) — previously loaded ALL posts into
// memory on every request which caused OOM crashes on large datasets.
exports.getFeed = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20); // cap at 50
    const skip  = (page - 1) * limit;
    const tab = ['all', 'following', 'tweets'].includes(req.query.tab) ? req.query.tab : 'all';
    let followedIds = [];
    let blockedPrivateUserIds = [];

    if (tab === 'following') {
      const follows = await Follow.find({ follower_id: req.userId }).select('followed_id').lean();
      followedIds = follows.map((follow) => follow.followed_id);
    } else {
      [followedIds, blockedPrivateUserIds] = await Promise.all([
        getFollowedUserIds(req.userId),
        getBlockedPrivateUserIds(req.userId),
      ]);
    }

    const postQuery = tab === 'following'
      ? { user_id: { $in: followedIds } }
      : (blockedPrivateUserIds.length > 0 ? { user_id: { $nin: blockedPrivateUserIds } } : {});
    const tweetQuery = {
      audience: 'everyone',
      isDeleted: false,
      parentTweet: null,
      ...(tab === 'following' ? { author: { $in: followedIds } } : {}),
    };

    const [posts, saved, tweets] = await Promise.all([
      tab === 'tweets'
        ? Promise.resolve([])
        : Post.find(postQuery)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('user_id', 'username full_name avatar_url followers_count following_count gender location isPrivate'),
      SavedPost.find({ user_id: req.userId }).select('post_id').lean(),
      Tweet.find(tweetQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('author', 'username full_name avatar_url')
        .populate({
          path: 'repostOf',
          populate: { path: 'author', select: 'username full_name avatar_url' },
        }),
    ]);

    const baseUrl  = `${req.protocol}://${req.get('host')}`;
    const savedSet = new Set(saved.map(s => s.post_id.toString()));
    const transformedPosts = posts.map(post => transformPost(post, baseUrl, req.userId, savedSet));
    const transformedTweets = await Promise.all(
      tweets.map((tweet) => transformTweet(tweet, req.userId))
    );
    const followingSet = new Set(followedIds.map((id) => String(id)));
    const viewerId = String(req.userId);
    transformedPosts.forEach((postItem) => {
      const authorId = String(postItem?.user_id?._id || postItem?.user_id?.id || '');
      postItem.is_author_followed_by_me = authorId ? followingSet.has(authorId) : false;
      postItem.can_view_by_me = !postItem?.user_id?.isPrivate || authorId === viewerId || postItem.is_author_followed_by_me;
    });
    const feedItems = (tab === 'tweets' ? transformedTweets : [...transformedPosts, ...transformedTweets])
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
    const data = tab === 'tweets'
      ? feedItems
      : await loadFeedAds(req, feedItems, baseUrl, blockedPrivateUserIds);

    res.json({ page, limit, data });
  } catch (error) {
    console.error('[Post] getFeed error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── Get single post ───────────────────────────────────────────────────────
// GET /api/posts/:id
exports.getPost = async (req, res) => {
  try {
    const [post, commentsRaw, isSaved] = await Promise.all([
      Post.findById(req.params.id)
        .populate('user_id', 'username full_name avatar_url followers_count following_count gender location isPrivate'),
      Comment.find({ post_id: req.params.id }).sort({ createdAt: -1 }),
      SavedPost.exists({ user_id: req.userId, post_id: req.params.id }),
    ]);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    const authorId = post?.user_id?._id || post?.user_id;
    const canView = await canViewAuthorContent(req.userId, authorId);
    if (!canView) {
      return res.status(403).json({ message: 'This account is private. Follow to view posts.' });
    }

    const baseUrl  = `${req.protocol}://${req.get('host')}`;
    const savedSet = new Set();
    if (isSaved) savedSet.add(post._id.toString());

    const transformedPost = transformPost(post, baseUrl, req.userId, savedSet);
    transformedPost.comments = commentsRaw.map(c => {
      const obj = c.toObject ? c.toObject() : c;
      obj.comment_id = obj._id;
      return obj;
    });

    res.json(transformedPost);
  } catch (error) {
    console.error('[Post] getPost error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── Delete post ───────────────────────────────────────────────────────────
// DELETE /api/posts/:id
exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.user_id.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this post' });
    }

    await post.deleteOne();
    await User.findByIdAndUpdate(req.userId, { $inc: { posts_count: -1 } });

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('[Post] deletePost error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── Create reel ───────────────────────────────────────────────────────────
// POST /api/posts/reels
exports.createReel = async (req, res) => {
  try {
    const { caption, location, media, tags, people_tags, hide_likes_count, turn_off_commenting } = req.body;

    if (!media || media.length === 0) {
      return res.status(400).json({ message: 'At least one media item is required' });
    }

    const normalizedMedia = media.map(m => {
      const nm = { ...m };
      nm.type = 'video';
      if (Array.isArray(nm.thumbnail))              { nm.thumbnails = nm.thumbnail; delete nm.thumbnail; }
      if (nm['finalLength-start'] !== undefined)    { nm.finalLength_start = nm['finalLength-start']; }
      if (nm['finallength-end'] !== undefined)      { nm.finalLength_end = nm['finallength-end']; }
      if (nm['thumbail-time'] !== undefined)        { nm.thumbnail_time = nm['thumbail-time']; }
      if (nm.totalLenght !== undefined)             { nm.totalLength = nm.totalLenght; }
      return nm;
    });

    const validCropModes = ['original', '1:1', '4:5', '16:9'];
    for (const item of media) {
      if (!item.fileName) {
        return res.status(400).json({ message: 'Each media item must have a fileName' });
      }
      if (item.crop && item.crop.mode && !validCropModes.includes(item.crop.mode)) {
        return res.status(400).json({ message: `Invalid crop mode: ${item.crop.mode}` });
      }
    }

    const post = await Post.create({
      user_id: req.userId,
      caption,
      location,
      media: normalizedMedia,
      tags,
      people_tags,
      hide_likes_count,
      turn_off_commenting,
      type: 'reel',
    });

    await User.findByIdAndUpdate(req.userId, { $inc: { posts_count: 1 } });

    // Notify subscribers that this user posted a reel
    try {
      const creator = await User.findById(req.userId).select('username').lean();
      await notifySubscribers(req.app, req.userId, creator.username, post._id, 'reel');
    } catch (notifErr) {
      console.error('[Post] Reel subscriber notification error:', notifErr.message);
    }

    const populatedPost = await post.populate('user_id', 'username full_name avatar_url followers_count following_count gender location');
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.status(201).json(transformPost(populatedPost, baseUrl));
  } catch (error) {
    console.error('[Post] createReel error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── List reels ────────────────────────────────────────────────────────────
// GET /api/posts/reels?page=1&limit=20
// FIX: Added pagination — same OOM issue as getFeed above.
exports.listReels = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const blockedPrivateUserIds = await getBlockedPrivateUserIds(req.userId);
    const reelQuery = { type: 'reel' };
    if (blockedPrivateUserIds.length > 0) {
      reelQuery.user_id = { $nin: blockedPrivateUserIds };
    }

    const [posts, saved] = await Promise.all([
      Post.find(reelQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user_id', 'username full_name avatar_url followers_count following_count gender location isPrivate'),
      SavedPost.find({ user_id: req.userId }).select('post_id').lean(),
    ]);

    const baseUrl  = `${req.protocol}://${req.get('host')}`;
    const savedSet = new Set(saved.map(s => s.post_id.toString()));
    const transformed = posts.map(p => transformPost(p, baseUrl, req.userId, savedSet));

    res.json({ page, limit, data: transformed });
  } catch (error) {
    console.error('[Post] listReels error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─── Get reel by ID ────────────────────────────────────────────────────────
// GET /api/posts/reels/:id
exports.getReelById = async (req, res) => {
  try {
    const [post, commentsRaw, isSaved] = await Promise.all([
      Post.findOne({ _id: req.params.id, type: 'reel' })
        .populate('user_id', 'username full_name avatar_url followers_count following_count gender location isPrivate'),
      Comment.find({ post_id: req.params.id }).sort({ createdAt: -1 }),
      SavedPost.exists({ user_id: req.userId, post_id: req.params.id }),
    ]);

    if (!post) {
      return res.status(404).json({ message: 'Reel not found' });
    }
    const authorId = post?.user_id?._id || post?.user_id;
    const canView = await canViewAuthorContent(req.userId, authorId);
    if (!canView) {
      return res.status(403).json({ message: 'This account is private. Follow to view reels.' });
    }

    const baseUrl  = `${req.protocol}://${req.get('host')}`;
    const savedSet = new Set();
    if (isSaved) savedSet.add(post._id.toString());

    const transformedPost = transformPost(post, baseUrl, req.userId, savedSet);
    transformedPost.comments = commentsRaw.map(c => {
      const obj = c.toObject ? c.toObject() : c;
      obj.comment_id = obj._id;
      return obj;
    });

    res.json(transformedPost);
  } catch (error) {
    console.error('[Post] getReelById error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Reel not found' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const buildPostMetadataUpdates = (body = {}) => {
  const updates = {};

  if (typeof body.caption !== 'undefined') updates.caption = body.caption || '';
  if (typeof body.location !== 'undefined') updates.location = body.location || '';
  if (typeof body.tags !== 'undefined') updates.tags = Array.isArray(body.tags) ? body.tags : [];
  if (typeof body.people_tags !== 'undefined') updates.people_tags = Array.isArray(body.people_tags) ? body.people_tags : [];
  if (typeof body.hide_likes_count !== 'undefined') updates.hide_likes_count = !!body.hide_likes_count;
  if (typeof body.turn_off_commenting !== 'undefined') updates.turn_off_commenting = !!body.turn_off_commenting;

  return updates;
};

exports.updatePostMetadata = async (req, res) => {
  try {
    const post = await Post.findOne({ _id: req.params.id, type: 'post' });

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.user_id.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this post' });
    }

    const updates = buildPostMetadataUpdates(req.body);
    Object.assign(post, updates);
    await post.save();

    const populatedPost = await Post.findById(post._id)
      .populate('user_id', 'username full_name avatar_url followers_count following_count gender location');

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json(transformPost(populatedPost, baseUrl, req.userId));
  } catch (error) {
    console.error('[Post] updatePostMetadata error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Post not found' });
    }
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateReelMetadata = async (req, res) => {
  try {
    const post = await Post.findOne({ _id: req.params.id, type: 'reel' });

    if (!post) {
      return res.status(404).json({ message: 'Reel not found' });
    }

    if (post.user_id.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this reel' });
    }

    const updates = buildPostMetadataUpdates(req.body);
    Object.assign(post, updates);
    await post.save();

    const populatedPost = await Post.findById(post._id)
      .populate('user_id', 'username full_name avatar_url followers_count following_count gender location');

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return res.json(transformPost(populatedPost, baseUrl, req.userId));
  } catch (error) {
    console.error('[Post] updateReelMetadata error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Reel not found' });
    }
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};