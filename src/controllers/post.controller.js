const Post         = require('../models/Post');
const User         = require('../models/User');
const Comment      = require('../models/Comment');
const Ad           = require('../models/Ad');
const AdView       = require('../models/AdView');
const SavedPost    = require('../models/SavedPost');
const sendNotification = require('../utils/sendNotification');

// ─── Helper ────────────────────────────────────────────────────────────────
// Transforms a Mongoose post document into the API response shape.
// Adds fileUrl, is_liked_by_me, is_saved_by_me to each post.
const transformPost = (post, baseUrl, currentUserId = null, savedSet = null) => {
  const postObj = post.toObject ? post.toObject() : post;

  postObj.post_id = postObj._id;

  if (postObj.media && Array.isArray(postObj.media)) {
    postObj.media = postObj.media.map(item => {
      const fileUrl = item.fileName ? `${baseUrl}/uploads/${item.fileName}` : item.fileUrl;
      let thumbnailArray = [];
      if (Array.isArray(item.thumbnails)) {
        thumbnailArray = item.thumbnails.map(t => ({
          ...t,
          fileUrl: t.fileName ? `${baseUrl}/uploads/${t.fileName}` : t.fileUrl,
        }));
      } else if (item.thumbnail && item.thumbnail.fileName) {
        thumbnailArray = [{
          ...item.thumbnail,
          fileUrl: `${baseUrl}/uploads/${item.thumbnail.fileName}`,
        }];
      }
      return { ...item, fileUrl, thumbnail: thumbnailArray };
    });
  }

  postObj.is_liked_by_me = currentUserId && postObj.likes
    ? postObj.likes.some(id => id.toString() === currentUserId.toString())
    : false;

  postObj.is_saved_by_me = savedSet && postObj._id
    ? savedSet.has(postObj._id.toString())
    : false;

  return postObj;
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
      if (Array.isArray(people_tags) && people_tags.length > 0) {
        const creator = await User.findById(req.userId).select('username').lean();
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
    } catch (notifErr) {
      console.error('[Post] Tag notification error:', notifErr.message);
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

    const [posts, saved] = await Promise.all([
      Post.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user_id', 'username full_name avatar_url followers_count following_count gender location'),
      SavedPost.find({ user_id: req.userId }).select('post_id').lean(),
    ]);

    const baseUrl  = `${req.protocol}://${req.get('host')}`;
    const savedSet = new Set(saved.map(s => s.post_id.toString()));
    const transformedPosts = posts.map(post => transformPost(post, baseUrl, req.userId, savedSet));

    // Interleave ads every 5 posts
    const adSlots = Math.floor(transformedPosts.length / 5);
    if (adSlots <= 0) {
      return res.json({ page, limit, data: transformedPosts });
    }

    const [ads, rewarded] = await Promise.all([
      Ad.find({ status: 'active', isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(Math.max(1, adSlots))
        .populate('vendor_id', 'business_name logo_url validated')
        .populate('user_id', 'username full_name avatar_url gender location')
        .lean(),
      AdView.find({ user_id: req.userId, rewarded: true }).select('ad_id').lean(),
    ]);

    if (!ads.length) {
      return res.json({ page, limit, data: transformedPosts });
    }

    const rewardedSet = new Set(rewarded.map(r => r.ad_id.toString()));

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

      return {
        item_type:        'ad',
        ...ad,
        media:            normalizedMedia,
        is_rewarded_by_me: rewardedSet.has(ad._id.toString()),
        is_liked_by_me:   Array.isArray(ad.likes) && ad.likes.some(id => id.toString() === req.userId.toString()),
      };
    });

    // Mix posts and ads: insert one ad after every 5th post
    const mixed = [];
    let adIndex = 0;
    for (let i = 0; i < transformedPosts.length; i++) {
      mixed.push(transformedPosts[i]);
      if ((i + 1) % 5 === 0) {
        mixed.push(normalizedAds[adIndex % normalizedAds.length]);
        adIndex++;
      }
    }

    res.json({ page, limit, data: mixed });
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
        .populate('user_id', 'username full_name avatar_url followers_count following_count gender location'),
      Comment.find({ post_id: req.params.id }).sort({ createdAt: -1 }),
      SavedPost.exists({ user_id: req.userId, post_id: req.params.id }),
    ]);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
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

    const [posts, saved] = await Promise.all([
      Post.find({ type: 'reel' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user_id', 'username full_name avatar_url followers_count following_count gender location'),
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
        .populate('user_id', 'username full_name avatar_url followers_count following_count gender location'),
      Comment.find({ post_id: req.params.id }).sort({ createdAt: -1 }),
      SavedPost.exists({ user_id: req.userId, post_id: req.params.id }),
    ]);

    if (!post) {
      return res.status(404).json({ message: 'Reel not found' });
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
