const Post = require('../models/Post');
const User = require('../models/User');
const Ad = require('../models/Ad');
const Follow = require('../models/Follow');
const mongoose = require('mongoose');

// Helper to format media URLs
const formatMedia = (media, baseUrl) => {
  if (!Array.isArray(media)) return [];
  return media.map(m => {
    const fileUrl = m.fileUrl 
      ? (String(m.fileUrl).startsWith('http') ? m.fileUrl : `${baseUrl}${String(m.fileUrl).startsWith('/') ? '' : '/'}${m.fileUrl}`)
      : (m.fileName ? `${baseUrl}/uploads/${m.fileName}` : '');
    
    const thumbnails = Array.isArray(m.thumbnails)
      ? m.thumbnails.map(t => ({
          ...t,
          fileUrl: t.fileUrl 
            ? (String(t.fileUrl).startsWith('http') ? t.fileUrl : `${baseUrl}${String(t.fileUrl).startsWith('/') ? '' : '/'}${t.fileUrl}`)
            : (t.fileName ? `${baseUrl}/uploads/${t.fileName}` : '')
        }))
      : [];
      
    return { ...m, fileUrl, thumbnails };
  });
};

/**
 * Get suggested users
 * @route GET /api/suggestions/users
 * @access Private
 */
exports.getSuggestedUsers = async (req, res) => {
  try {
    const currentUserId = req.userId;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const following = await Follow.find({ follower_id: currentUserId }).distinct('followed_id');
    const excludeIds = [currentUserId, ...following];

    const suggestedUsers = await User.find({
      _id: { $nin: excludeIds },
      isDeleted: { $ne: true },
      is_active: true
    })
      .select('username full_name avatar_url followers_count bio')
      .sort({ followers_count: -1 })
      .limit(limit)
      .lean();

    const formattedUsers = suggestedUsers.map(u => ({
      ...u,
      avatar_url: u.avatar_url && !u.avatar_url.startsWith('http') 
        ? `${baseUrl}/uploads/${u.avatar_url}` 
        : u.avatar_url
    }));

    res.json({ success: true, data: formattedUsers });
  } catch (error) {
    console.error('[getSuggestedUsers] error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get suggested reels
 * @route GET /api/suggestions/reels
 * @access Private
 */
exports.getSuggestedReels = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const suggestedReels = await Post.find({
      type: 'reel',
      isDeleted: { $ne: true }
    })
      .populate('user_id', 'username full_name avatar_url')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const formattedReels = suggestedReels.map(r => ({
      ...r,
      media: formatMedia(r.media, baseUrl)
    }));

    res.json({ success: true, data: formattedReels });
  } catch (error) {
    console.error('[getSuggestedReels] error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get suggested ads
 * @route GET /api/suggestions/ads
 * @access Private
 */
exports.getSuggestedAds = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const suggestedAds = await Ad.find({
      status: 'active',
      isDeleted: false
    })
      .populate('vendor_id', 'business_name logo_url')
      .populate('user_id', 'username full_name avatar_url')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const formattedAds = suggestedAds.map(ad => ({
      ...ad,
      media: formatMedia(ad.media, baseUrl)
    }));

    res.json({ success: true, data: formattedAds });
  } catch (error) {
    console.error('[getSuggestedAds] error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Combined suggestions (legacy support)
 * @route GET /api/suggestions
 * @access Private
 */
exports.getSuggestions = async (req, res) => {
  try {
    const currentUserId = req.userId;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const following = await Follow.find({ follower_id: currentUserId }).distinct('followed_id');
    const excludeIds = [currentUserId, ...following];

    const [suggestedUsers, suggestedReels, suggestedAds] = await Promise.all([
      User.find({
        _id: { $nin: excludeIds },
        isDeleted: { $ne: true },
        is_active: true
      })
        .select('username full_name avatar_url followers_count bio')
        .sort({ followers_count: -1 })
        .limit(limit)
        .lean(),
      Post.find({
        type: 'reel',
        isDeleted: { $ne: true }
      })
        .populate('user_id', 'username full_name avatar_url')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Ad.find({
        status: 'active',
        isDeleted: false
      })
        .populate('vendor_id', 'business_name logo_url')
        .populate('user_id', 'username full_name avatar_url')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
    ]);

    const formattedUsers = suggestedUsers.map(u => ({
      ...u,
      avatar_url: u.avatar_url && !u.avatar_url.startsWith('http') 
        ? `${baseUrl}/uploads/${u.avatar_url}` 
        : u.avatar_url
    }));

    const formattedReels = suggestedReels.map(r => ({
      ...r,
      media: formatMedia(r.media, baseUrl)
    }));

    const formattedAds = suggestedAds.map(ad => ({
      ...ad,
      media: formatMedia(ad.media, baseUrl)
    }));

    res.json({
      success: true,
      data: {
        users: formattedUsers,
        reels: formattedReels,
        ads: formattedAds
      }
    });
  } catch (error) {
    console.error('[getSuggestions] error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
