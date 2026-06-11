const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const PromoteReel = require('../models/PromoteReel');
const Ad = require('../models/Ad');
const SearchHistory = require('../models/SearchHistory');

const HISTORY_LIMIT = 20;
const NOT_DELETED_FILTER = { $ne: true };

const canAccessHistory = (requestUser, targetUserId) =>
  requestUser?.role === 'admin' || String(requestUser?._id) === String(targetUserId);

const buildRegex = (value) => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

const sanitizeUser = (user) => {
  if (!user) return null;
  return {
    _id: user._id,
    email: user.email || '',
    googleId: user.googleId || '',
    provider: user.provider || '',
    username: user.username || '',
    full_name: user.full_name || '',
    bio: user.bio || '',
    posts_count: user.posts_count || 0,
    followers_count: user.followers_count || 0,
    following_count: user.following_count || 0,
    is_active: typeof user.is_active === 'boolean' ? user.is_active : true,
    role: user.role || '',
    avatar_url: user.avatar_url || '',
    phone: user.phone || '',
    age: user.age ?? null,
    gender: user.gender || '',
    location: user.location || '',
    address: user.address || {},
    company_details: user.company_details || {},
    isDeleted: !!user.isDeleted,
    deletedBy: user.deletedBy || null,
    deletedAt: user.deletedAt || null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
};

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

const sanitizeMedia = (media = [], baseUrl = '') =>
  Array.isArray(media)
    ? media.map((item) => {
        const thumbnails = Array.isArray(item.thumbnails)
          ? item.thumbnails.map((thumb) => ({
              ...thumb,
              fileUrl: resolveMediaUrl(thumb.fileName, thumb.fileUrl, baseUrl),
            }))
          : item.thumbnail && (item.thumbnail.fileName || item.thumbnail.fileUrl)
            ? [{
                ...item.thumbnail,
                fileUrl: resolveMediaUrl(item.thumbnail.fileName, item.thumbnail.fileUrl, baseUrl),
              }]
            : [];

        return {
          ...item,
          fileUrl: resolveMediaUrl(item.fileName, item.fileUrl, baseUrl),
          thumbnails,
          thumbnail: thumbnails,
        };
      })
    : [];

const sanitizePost = (post, baseUrl) => ({
  ...post,
  user_id: post.user_id && typeof post.user_id === 'object'
    ? sanitizeUser(post.user_id)
    : post.user_id,
  media: sanitizeMedia(post.media, baseUrl),
  tags: Array.isArray(post.tags) ? post.tags : [],
  people_tags: Array.isArray(post.people_tags) ? post.people_tags : [],
  likes: Array.isArray(post.likes) ? post.likes : [],
  latest_comments: Array.isArray(post.latest_comments) ? post.latest_comments : [],
});

const sanitizePromoteReel = (promoteReel, baseUrl) => {
  const sanitized = {
    ...promoteReel,
    promote_reel_id: promoteReel._id,
    item_type: 'promote_reel',
    user_id: promoteReel.user_id && typeof promoteReel.user_id === 'object'
      ? sanitizeUser(promoteReel.user_id)
      : promoteReel.user_id,
    media: sanitizeMedia(promoteReel.media, baseUrl),
    tags: Array.isArray(promoteReel.tags) ? promoteReel.tags : [],
    people_tags: Array.isArray(promoteReel.people_tags) ? promoteReel.people_tags : [],
    likes: Array.isArray(promoteReel.likes) ? promoteReel.likes : [],
    latest_comments: Array.isArray(promoteReel.latest_comments) ? promoteReel.latest_comments : [],
    products: Array.isArray(promoteReel.products)
      ? promoteReel.products.map((p) => ({
          ...p,
          promote_img: resolveMediaUrl(null, p.promote_img, baseUrl),
        }))
      : [],
  };

  // Normalise media type for promote reels (they are always videos)
  if (Array.isArray(sanitized.media)) {
    sanitized.media = sanitized.media.map((m) => ({
      ...m,
      type: 'video',
      media_type: 'video',
    }));
  }

  return sanitized;
};

const sanitizeAd = (ad, baseUrl) => ({
  ...ad,
  item_type: 'ad',
  user_id: ad.user_id && typeof ad.user_id === 'object'
    ? sanitizeUser(ad.user_id)
    : ad.user_id,
  media: sanitizeMedia(ad.media, baseUrl),
  tags: Array.isArray(ad.tags) ? ad.tags : [],
  hashtags: Array.isArray(ad.hashtags) ? ad.hashtags : [],
  keywords: Array.isArray(ad.keywords) ? ad.keywords : [],
  likes: Array.isArray(ad.likes) ? ad.likes : [],
});

exports.searchAll = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 25);

    if (!q) {
      return res.status(400).json({ message: 'q is required' });
    }

    const regex = buildRegex(q);
    const isObjectId = mongoose.Types.ObjectId.isValid(q);
    const exactId = isObjectId ? new mongoose.Types.ObjectId(q) : null;

    const matchedUsers = await User.find({
      isDeleted: NOT_DELETED_FILTER,
      $or: [
        { username: regex },
        { full_name: regex },
        { location: regex },
        ...(exactId ? [{ _id: exactId }] : []),
      ],
    })
      .select('email googleId provider username full_name bio posts_count followers_count following_count is_active role avatar_url phone age gender location address company_details isDeleted deletedBy deletedAt createdAt updatedAt')
      .sort({ followers_count: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const matchedUserIds = matchedUsers.map((user) => user._id);

    const postQueryBase = {
      isDeleted: NOT_DELETED_FILTER,
      $or: [
        { caption: regex },
        { location: regex },
        ...(matchedUserIds.length ? [{ user_id: { $in: matchedUserIds } }] : []),
        ...(exactId ? [{ user_id: exactId }, { _id: exactId }] : []),
      ],
    };

    const promoteReelQuery = {
      isDeleted: NOT_DELETED_FILTER,
      $or: [
        { caption: regex },
        { location: regex },
        { 'products.product_name': regex },
        { 'products.product_description': regex },
        ...(matchedUserIds.length ? [{ user_id: { $in: matchedUserIds } }] : []),
        ...(exactId ? [{ user_id: exactId }, { _id: exactId }] : []),
      ],
    };

    const adQuery = {
      isDeleted: NOT_DELETED_FILTER,
      status: 'active',
      $or: [
        { ad_title: regex },
        { ad_description: regex },
        { caption: regex },
        { location: regex },
        { hashtags: regex },
        { tags: regex },
        { keywords: regex },
        ...(matchedUserIds.length ? [{ user_id: { $in: matchedUserIds } }] : []),
        ...(exactId ? [{ user_id: exactId }, { _id: exactId }] : []),
      ],
    };

    const [posts, reels, promoteReels, ads] = await Promise.all([
      Post.find({ ...postQueryBase, type: 'post' })
        .populate('user_id', 'email googleId provider username full_name bio posts_count followers_count following_count is_active role avatar_url phone age gender location address company_details isDeleted deletedBy deletedAt createdAt updatedAt')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Post.find({ ...postQueryBase, type: 'reel' })
        .populate('user_id', 'email googleId provider username full_name bio posts_count followers_count following_count is_active role avatar_url phone age gender location address company_details isDeleted deletedBy deletedAt createdAt updatedAt')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      PromoteReel.find(promoteReelQuery)
        .populate('user_id', 'email googleId provider username full_name bio posts_count followers_count following_count is_active role avatar_url phone age gender location address company_details isDeleted deletedBy deletedAt createdAt updatedAt')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Ad.find(adQuery)
        .populate('user_id', 'email googleId provider username full_name bio posts_count followers_count following_count is_active role avatar_url phone age gender location address company_details isDeleted deletedBy deletedAt createdAt updatedAt')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
    ]);

    const searchUserId = req.userId || req.user?._id;
    if (searchUserId) {
      await SearchHistory.findOneAndUpdate(
        { user_id: searchUserId, normalized_query: q.toLowerCase() },
        {
          $set: {
            query: q,
            normalized_query: q.toLowerCase(),
            searched_at: new Date(),
          },
          $inc: { searches_count: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    return res.json({
      success: true,
      query: q,
      counts: {
        users: matchedUsers.length,
        posts: posts.length,
        reels: reels.length,
        promote_reels: promoteReels.length,
        ads: ads.length,
      },
      results: {
        users: matchedUsers.map(sanitizeUser),
        posts: posts.map((post) => sanitizePost(post, baseUrl)),
        reels: reels.map((reel) => sanitizePost(reel, baseUrl)),
        promote_reels: promoteReels.map((pr) => sanitizePromoteReel(pr, baseUrl)),
        ads: ads.map((ad) => sanitizeAd(ad, baseUrl)),
      },
    });
  } catch (error) {
    console.error('[searchAll]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.searchReels = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    if (!q) {
      return res.status(400).json({ message: 'q is required' });
    }

    const regex = buildRegex(q);
    const isObjectId = mongoose.Types.ObjectId.isValid(q);
    const exactId = isObjectId ? new mongoose.Types.ObjectId(q) : null;

    // Find users first to include their reels in search
    const matchedUsers = await User.find({
      isDeleted: NOT_DELETED_FILTER,
      $or: [
        { username: regex },
        { full_name: regex },
        ...(exactId ? [{ _id: exactId }] : []),
      ],
    }).select('_id').lean();

    const matchedUserIds = matchedUsers.map((user) => user._id);

    const query = {
      isDeleted: NOT_DELETED_FILTER,
      type: 'reel',
      $or: [
        { caption: regex },
        { location: regex },
        ...(matchedUserIds.length ? [{ user_id: { $in: matchedUserIds } }] : []),
        ...(exactId ? [{ user_id: exactId }, { _id: exactId }] : []),
      ],
    };

    const [reels, total] = await Promise.all([
      Post.find(query)
        .populate('user_id', 'email googleId provider username full_name bio posts_count followers_count following_count is_active role avatar_url phone age gender location address company_details isDeleted deletedBy deletedAt createdAt updatedAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments(query),
    ]);

    const searchUserId = req.userId || req.user?._id;
    if (searchUserId) {
      await SearchHistory.findOneAndUpdate(
        { user_id: searchUserId, normalized_query: q.toLowerCase() },
        {
          $set: { query: q, normalized_query: q.toLowerCase(), searched_at: new Date() },
          $inc: { searches_count: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    return res.json({
      success: true,
      query: q,
      page,
      limit,
      total,
      results: reels.map((reel) => sanitizePost(reel, baseUrl)),
    });
  } catch (error) {
    console.error('[searchReels]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.searchPromoteReels = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    if (!q) {
      return res.status(400).json({ message: 'q is required' });
    }

    const regex = buildRegex(q);
    const isObjectId = mongoose.Types.ObjectId.isValid(q);
    const exactId = isObjectId ? new mongoose.Types.ObjectId(q) : null;

    // Find users first
    const matchedUsers = await User.find({
      isDeleted: NOT_DELETED_FILTER,
      $or: [
        { username: regex },
        { full_name: regex },
        ...(exactId ? [{ _id: exactId }] : []),
      ],
    }).select('_id').lean();

    const matchedUserIds = matchedUsers.map((user) => user._id);

    const query = {
      isDeleted: NOT_DELETED_FILTER,
      $or: [
        { caption: regex },
        { location: regex },
        { 'products.product_name': regex },
        { 'products.product_description': regex },
        ...(matchedUserIds.length ? [{ user_id: { $in: matchedUserIds } }] : []),
        ...(exactId ? [{ user_id: exactId }, { _id: exactId }] : []),
      ],
    };

    const [promoteReels, total] = await Promise.all([
      PromoteReel.find(query)
        .populate('user_id', 'email googleId provider username full_name bio posts_count followers_count following_count is_active role avatar_url phone age gender location address company_details isDeleted deletedBy deletedAt createdAt updatedAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PromoteReel.countDocuments(query),
    ]);

    const searchUserId = req.userId || req.user?._id;
    if (searchUserId) {
      await SearchHistory.findOneAndUpdate(
        { user_id: searchUserId, normalized_query: q.toLowerCase() },
        {
          $set: { query: q, normalized_query: q.toLowerCase(), searched_at: new Date() },
          $inc: { searches_count: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    return res.json({
      success: true,
      query: q,
      page,
      limit,
      total,
      results: promoteReels.map((pr) => sanitizePromoteReel(pr, baseUrl)),
    });
  } catch (error) {
    console.error('[searchPromoteReels]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.searchAds = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    if (!q) {
      return res.status(400).json({ message: 'q is required' });
    }

    const regex = buildRegex(q);
    const isObjectId = mongoose.Types.ObjectId.isValid(q);
    const exactId = isObjectId ? new mongoose.Types.ObjectId(q) : null;

    // Find users first
    const matchedUsers = await User.find({
      isDeleted: NOT_DELETED_FILTER,
      $or: [
        { username: regex },
        { full_name: regex },
        ...(exactId ? [{ _id: exactId }] : []),
      ],
    }).select('_id').lean();

    const matchedUserIds = matchedUsers.map((user) => user._id);

    const query = {
      isDeleted: NOT_DELETED_FILTER,
      status: 'active',
      $or: [
        { ad_title: regex },
        { ad_description: regex },
        { caption: regex },
        { location: regex },
        { hashtags: regex },
        { tags: regex },
        { keywords: regex },
        ...(matchedUserIds.length ? [{ user_id: { $in: matchedUserIds } }] : []),
        ...(exactId ? [{ user_id: exactId }, { _id: exactId }] : []),
      ],
    };

    const [ads, total] = await Promise.all([
      Ad.find(query)
        .populate('user_id', 'email googleId provider username full_name bio posts_count followers_count following_count is_active role avatar_url phone age gender location address company_details isDeleted deletedBy deletedAt createdAt updatedAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Ad.countDocuments(query),
    ]);

    const searchUserId = req.userId || req.user?._id;
    if (searchUserId) {
      await SearchHistory.findOneAndUpdate(
        { user_id: searchUserId, normalized_query: q.toLowerCase() },
        {
          $set: { query: q, normalized_query: q.toLowerCase(), searched_at: new Date() },
          $inc: { searches_count: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    return res.json({
      success: true,
      query: q,
      page,
      limit,
      total,
      results: ads.map((ad) => sanitizeAd(ad, baseUrl)),
    });
  } catch (error) {
    console.error('[searchAds]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getSearchHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }
    if (!canAccessHistory(req.user, userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const history = await SearchHistory.find({ user_id: userId })
      .sort({ searched_at: -1 })
      .limit(HISTORY_LIMIT)
      .lean();

    return res.json({
      success: true,
      user_id: userId,
      total: history.length,
      history: history.map((item) => ({
        _id: item._id,
        user_id: item.user_id,
        query: item.query,
        searches_count: item.searches_count,
        searched_at: item.searched_at,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    });
  } catch (error) {
    console.error('[getSearchHistory]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteAllSearchHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }
    if (!canAccessHistory(req.user, userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const result = await SearchHistory.deleteMany({ user_id: userId });
    return res.json({
      success: true,
      user_id: userId,
      deleted_count: result.deletedCount || 0,
      message: 'Search history cleared successfully',
    });
  } catch (error) {
    console.error('[deleteAllSearchHistory]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteSingleSearchHistory = async (req, res) => {
  try {
    const { userId, historyId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }
    if (!mongoose.Types.ObjectId.isValid(historyId)) {
      return res.status(400).json({ message: 'Invalid historyId' });
    }
    if (!canAccessHistory(req.user, userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const deleted = await SearchHistory.findOneAndDelete({ _id: historyId, user_id: userId });
    if (!deleted) {
      return res.status(404).json({ message: 'Search history item not found' });
    }

    return res.json({
      success: true,
      user_id: userId,
      history_id: historyId,
      message: 'Search history item deleted successfully',
    });
  } catch (error) {
    console.error('[deleteSingleSearchHistory]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
