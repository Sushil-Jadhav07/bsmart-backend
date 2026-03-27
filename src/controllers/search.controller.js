const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const SearchHistory = require('../models/SearchHistory');

const HISTORY_LIMIT = 20;

const canAccessHistory = (requestUser, targetUserId) =>
  requestUser?.role === 'admin' || String(requestUser?._id) === String(targetUserId);

const buildRegex = (value) => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

const normalizeUser = (user) => ({
  _id: user._id,
  username: user.username || '',
  full_name: user.full_name || '',
  avatar_url: user.avatar_url || '',
  role: user.role || '',
  bio: user.bio || '',
});

const normalizePost = (post) => ({
  _id: post._id,
  user_id: post.user_id?._id || post.user_id,
  username: post.user_id?.username || '',
  full_name: post.user_id?.full_name || '',
  avatar_url: post.user_id?.avatar_url || '',
  caption: post.caption || '',
  type: post.type || 'post',
  media: Array.isArray(post.media) ? post.media : [],
  createdAt: post.createdAt,
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
      isDeleted: false,
      $or: [
        { username: regex },
        { full_name: regex },
        ...(exactId ? [{ _id: exactId }] : []),
      ],
    })
      .select('_id username full_name avatar_url role bio')
      .sort({ followers_count: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const matchedUserIds = matchedUsers.map((user) => user._id);

    const postQueryBase = {
      isDeleted: false,
      $or: [
        { caption: regex },
        ...(matchedUserIds.length ? [{ user_id: { $in: matchedUserIds } }] : []),
        ...(exactId ? [{ user_id: exactId }, { _id: exactId }] : []),
      ],
    };

    const [posts, reels] = await Promise.all([
      Post.find({ ...postQueryBase, type: 'post' })
        .populate('user_id', 'username full_name avatar_url')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Post.find({ ...postQueryBase, type: 'reel' })
        .populate('user_id', 'username full_name avatar_url')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
    ]);

    await SearchHistory.findOneAndUpdate(
      { user_id: req.userId, normalized_query: q.toLowerCase() },
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

    return res.json({
      success: true,
      query: q,
      counts: {
        users: matchedUsers.length,
        posts: posts.length,
        reels: reels.length,
      },
      results: {
        users: matchedUsers.map(normalizeUser),
        posts: posts.map(normalizePost),
        reels: reels.map(normalizePost),
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
