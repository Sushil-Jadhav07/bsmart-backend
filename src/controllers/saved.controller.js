const mongoose = require('mongoose');
const SavedPost = require('../models/SavedPost');
const SavedAd = require('../models/SavedAd');
const SavedPromoteReel = require('../models/SavedPromoteReel');
const Post = require('../models/Post');
const Ad = require('../models/Ad');
const PromoteReel = require('../models/PromoteReel');
const User = require('../models/User');
const sendNotification = require('../utils/sendNotification');

const resolveMediaUrl = (fileName, fileUrl, baseUrl) => {
  const cloudfront = process.env.CLOUDFRONT_BASE_URL
    ? process.env.CLOUDFRONT_BASE_URL.replace(/\/+$/, '')
    : null;

  if (fileUrl && fileUrl.startsWith('http')) {
    if (cloudfront && fileUrl.includes('api.bebsmart.in/uploads/')) {
      return fileUrl.replace(/https?:\/\/api\.bebsmart\.in\/uploads\//, `${cloudfront}/uploads/`);
    }
    return fileUrl;
  }

  if (fileName) {
    if (fileName.startsWith('uploads/') || fileName.startsWith('/uploads/')) {
      const key = fileName.replace(/^\/+/, '');
      if (cloudfront) return `${cloudfront}/${key}`;
      return `${baseUrl}/${key}`;
    }
    if (cloudfront) return `${cloudfront}/uploads/${fileName}`;
    return `${baseUrl}/uploads/${fileName}`;
  }

  if (fileUrl) {
    if (fileUrl.startsWith('/')) return `${baseUrl}${fileUrl}`;
    return `${baseUrl}/${fileUrl}`;
  }

  return '';
};

const resolveMedia = (media = [], baseUrl = '') =>
  Array.isArray(media)
    ? media.map((item) => {
        const thumbnails = Array.isArray(item.thumbnails)
          ? item.thumbnails.map((t) => ({
              ...t,
              fileUrl: resolveMediaUrl(t.fileName, t.fileUrl, baseUrl),
            }))
          : item.thumbnail && (item.thumbnail.fileName || item.thumbnail.fileUrl)
            ? [{ ...item.thumbnail, fileUrl: resolveMediaUrl(item.thumbnail.fileName, item.thumbnail.fileUrl, baseUrl) }]
            : [];
        return {
          ...item,
          fileUrl: resolveMediaUrl(item.fileName, item.fileUrl, baseUrl),
          thumbnails,
          thumbnail: thumbnails,
        };
      })
    : [];

// ─── Save / Unsave Post or Reel ───────────────────────────────────────────────

exports.savePost = async (req, res) => {
  try {
    const userId = req.userId;
    const postId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: 'Invalid post ID' });
    }
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    try {
      await SavedPost.create({ user_id: userId, post_id: postId });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ message: 'Already saved' });
      throw e;
    }

    await User.findByIdAndUpdate(userId, { $inc: { saved_posts_count: 1 } }).catch(() => {});

    if (String(post.user_id) !== String(userId)) {
      const saver = await User.findById(userId).select('username').lean();
      if (saver) {
        sendNotification(req.app, {
          recipient: post.user_id,
          sender: userId,
          type: 'post_save',
          message: `${saver.username} saved your post`,
          link: `/posts/${postId}`,
        }).catch(() => {});
      }
    }

    const saved_count = await SavedPost.countDocuments({ post_id: postId });
    return res.json({ success: true, message: 'Post saved', saved: true, saved_count });
  } catch (error) {
    console.error('[savePost]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.unsavePost = async (req, res) => {
  try {
    const userId = req.userId;
    const postId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: 'Invalid post ID' });
    }
    const rel = await SavedPost.findOneAndDelete({ user_id: userId, post_id: postId });
    if (!rel) return res.status(400).json({ message: 'Not saved yet' });
    await User.findByIdAndUpdate(userId, { $inc: { saved_posts_count: -1 } }).catch(() => {});
    const saved_count = await SavedPost.countDocuments({ post_id: postId });
    return res.json({ success: true, message: 'Post unsaved', saved: false, saved_count });
  } catch (error) {
    console.error('[unsavePost]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Save / Unsave Promote Reel ───────────────────────────────────────────────

exports.savePromoteReel = async (req, res) => {
  try {
    const userId = req.userId;
    const promoteReelId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(promoteReelId)) {
      return res.status(400).json({ message: 'Invalid promote reel ID' });
    }
    const reel = await PromoteReel.findOne({ _id: promoteReelId, isDeleted: { $ne: true } });
    if (!reel) return res.status(404).json({ message: 'Promote reel not found' });

    try {
      await SavedPromoteReel.create({ user_id: userId, promote_reel_id: promoteReelId });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ message: 'Already saved' });
      throw e;
    }

    const saved_count = await SavedPromoteReel.countDocuments({ promote_reel_id: promoteReelId });
    return res.json({ success: true, message: 'Promote reel saved', saved: true, saved_count });
  } catch (error) {
    console.error('[savePromoteReel]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.unsavePromoteReel = async (req, res) => {
  try {
    const userId = req.userId;
    const promoteReelId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(promoteReelId)) {
      return res.status(400).json({ message: 'Invalid promote reel ID' });
    }
    const rel = await SavedPromoteReel.findOneAndDelete({ user_id: userId, promote_reel_id: promoteReelId });
    if (!rel) return res.status(400).json({ message: 'Not saved yet' });
    const saved_count = await SavedPromoteReel.countDocuments({ promote_reel_id: promoteReelId });
    return res.json({ success: true, message: 'Promote reel unsaved', saved: false, saved_count });
  } catch (error) {
    console.error('[unsavePromoteReel]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Save / Unsave Ad ─────────────────────────────────────────────────────────

exports.saveAd = async (req, res) => {
  try {
    const userId = req.userId;
    const adId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }
    const ad = await Ad.findOne({ _id: adId, isDeleted: false });
    if (!ad) return res.status(404).json({ message: 'Ad not found' });

    try {
      await SavedAd.create({ user_id: userId, ad_id: adId });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ message: 'Already saved' });
      throw e;
    }

    const saved_count = await SavedAd.countDocuments({ ad_id: adId });
    return res.json({ success: true, message: 'Ad saved', saved: true, saved_count });
  } catch (error) {
    console.error('[saveAd]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.unsaveAd = async (req, res) => {
  try {
    const userId = req.userId;
    const adId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid ad ID' });
    }
    const rel = await SavedAd.findOneAndDelete({ user_id: userId, ad_id: adId });
    if (!rel) return res.status(400).json({ message: 'Not saved yet' });
    const saved_count = await SavedAd.countDocuments({ ad_id: adId });
    return res.json({ success: true, message: 'Ad unsaved', saved: false, saved_count });
  } catch (error) {
    console.error('[unsaveAd]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Get all saved items for a user ──────────────────────────────────────────

exports.getSavedItems = async (req, res) => {
  try {
    const userId = req.params.userId || String(req.userId);
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const [savedPosts, savedPromoteReels, savedAds] = await Promise.all([
      SavedPost.find({ user_id: userId }).sort({ createdAt: -1 }).lean(),
      SavedPromoteReel.find({ user_id: userId }).sort({ createdAt: -1 }).lean(),
      SavedAd.find({ user_id: userId }).sort({ createdAt: -1 }).lean(),
    ]);

    const postIds = savedPosts.map((s) => s.post_id);
    const promoteReelIds = savedPromoteReels.map((s) => s.promote_reel_id);
    const adIds = savedAds.map((s) => s.ad_id);

    const [rawPosts, rawPromoteReels, rawAds] = await Promise.all([
      Post.find({ _id: { $in: postIds }, isDeleted: { $ne: true } })
        .populate('user_id', 'username full_name avatar_url followers_count following_count is_active role')
        .lean(),
      PromoteReel.find({ _id: { $in: promoteReelIds }, isDeleted: { $ne: true } })
        .populate('user_id', 'username full_name avatar_url followers_count following_count is_active role')
        .lean(),
      Ad.find({ _id: { $in: adIds }, isDeleted: false })
        .populate('user_id', 'username full_name avatar_url followers_count following_count is_active role')
        .lean(),
    ]);

    // Build savedAt lookup maps
    const postSavedAt = Object.fromEntries(savedPosts.map((s) => [String(s.post_id), s.createdAt]));
    const prSavedAt = Object.fromEntries(savedPromoteReels.map((s) => [String(s.promote_reel_id), s.createdAt]));
    const adSavedAt = Object.fromEntries(savedAds.map((s) => [String(s.ad_id), s.createdAt]));

    const posts = rawPosts
      .filter((p) => p.type === 'post')
      .map((p) => ({
        ...p,
        item_type: 'post',
        is_saved_by_me: true,
        media: resolveMedia(p.media, baseUrl),
        savedAt: postSavedAt[String(p._id)],
      }));

    const reels = rawPosts
      .filter((p) => p.type === 'reel')
      .map((p) => ({
        ...p,
        item_type: 'reel',
        is_saved_by_me: true,
        media: resolveMedia(p.media, baseUrl),
        savedAt: postSavedAt[String(p._id)],
      }));

    const promoteReels = rawPromoteReels.map((pr) => ({
      ...pr,
      item_type: 'promote_reel',
      promote_reel_id: pr._id,
      is_saved_by_me: true,
      media: resolveMedia(pr.media, baseUrl).map((m) => ({ ...m, type: 'video', media_type: 'video' })),
      products: Array.isArray(pr.products)
        ? pr.products.map((p) => ({
            ...p,
            promote_img: resolveMediaUrl(null, p.promote_img, baseUrl),
          }))
        : [],
      savedAt: prSavedAt[String(pr._id)],
    }));

    const ads = rawAds.map((ad) => ({
      ...ad,
      item_type: 'ad',
      is_saved_by_me: true,
      media: resolveMedia(ad.media, baseUrl),
      savedAt: adSavedAt[String(ad._id)],
    }));

    const allItems = [...posts, ...reels, ...promoteReels, ...ads].sort(
      (a, b) => new Date(b.savedAt) - new Date(a.savedAt)
    );

    return res.json({
      success: true,
      user_id: userId,
      total: allItems.length,
      counts: {
        posts: posts.length,
        reels: reels.length,
        promote_reels: promoteReels.length,
        ads: ads.length,
      },
      items: allItems,
    });
  } catch (error) {
    console.error('[getSavedItems]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Legacy helpers (kept for backward-compat with existing routes) ───────────

exports.getSavedPostsByUser = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const saved = await SavedPost.find({ user_id: userId }).sort({ createdAt: -1 }).lean();
    const ids = saved.map((s) => s.post_id);
    const posts = await Post.find({ _id: { $in: ids }, isDeleted: { $ne: true } })
      .populate('user_id', 'username full_name avatar_url followers_count following_count gender location')
      .lean();
    const data = posts.map((p) => ({ ...p, is_saved_by_me: true, media: resolveMedia(p.media, baseUrl) }));
    return res.json({ success: true, posts: data, total: data.length });
  } catch (error) {
    console.error('[getSavedPostsByUser]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.listMySavedPosts = async (req, res) => {
  try {
    const userId = req.userId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const saved = await SavedPost.find({ user_id: userId }).sort({ createdAt: -1 }).lean();
    const ids = saved.map((s) => s.post_id);
    const posts = await Post.find({ _id: { $in: ids }, isDeleted: { $ne: true } })
      .populate('user_id', 'username full_name avatar_url gender location')
      .lean();
    const data = posts.map((p) => ({ ...p, is_saved_by_me: true, media: resolveMedia(p.media, baseUrl) }));
    return res.json({ success: true, posts: data, total: data.length });
  } catch (error) {
    console.error('[listMySavedPosts]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
