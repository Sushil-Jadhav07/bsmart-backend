const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
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

const withAbsoluteUploadUrl = (value, baseUrl) => {
  if (!value) return '';
  if (String(value).startsWith('http')) return value;
  if (String(value).startsWith('/')) return `${baseUrl}${value}`;
  return `${baseUrl}/uploads/${value}`;
};

const sanitizeMedia = (media = [], baseUrl = '') =>
  Array.isArray(media)
    ? media.map((item) => {
        const thumbnails = Array.isArray(item.thumbnails)
          ? item.thumbnails.map((thumb) => ({
              ...thumb,
              fileUrl: withAbsoluteUploadUrl(thumb.fileUrl || thumb.fileName, baseUrl),
            }))
          : item.thumbnail && (item.thumbnail.fileName || item.thumbnail.fileUrl)
            ? [{
                ...item.thumbnail,
                fileUrl: withAbsoluteUploadUrl(item.thumbnail.fileUrl || item.thumbnail.fileName, baseUrl),
              }]
            : [];

        return {
          ...item,
          fileUrl: withAbsoluteUploadUrl(item.fileUrl || item.fileName, baseUrl),
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

    const [posts, reels] = await Promise.all([
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
      },
      results: {
        users: matchedUsers.map(sanitizeUser),
        posts: posts.map((post) => sanitizePost(post, baseUrl)),
        reels: reels.map((reel) => sanitizePost(reel, baseUrl)),
      },
    });
  } catch (error) {
    console.error('[searchAll]', error);
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
