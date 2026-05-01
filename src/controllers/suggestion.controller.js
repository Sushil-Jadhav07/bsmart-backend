const Post = require('../models/Post');
const User = require('../models/User');
const Ad = require('../models/Ad');
const Vendor = require('../models/Vendor');
const Follow = require('../models/Follow');
const mongoose = require('mongoose');
const { getBlockedPrivateUserIds } = require('../utils/privacyVisibility');

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
      .select('username full_name avatar_url followers_count bio role')
      .populate('vendor_profile', 'business_name logo_url')
      .sort({ followers_count: -1 })
      .limit(limit)
      .lean();

    const formattedUsers = suggestedUsers.map(u => ({
      ...u,
      avatar_url: u.avatar_url && !u.avatar_url.startsWith('http') 
        ? `${baseUrl}/uploads/${u.avatar_url}` 
        : u.avatar_url,
      vendor_details: u.role === 'vendor' ? u.vendor_profile : undefined
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
    const blockedPrivateUserIds = await getBlockedPrivateUserIds(req.userId);
    const reelQuery = {
      type: 'reel',
      isDeleted: { $ne: true }
    };
    if (blockedPrivateUserIds.length > 0) {
      reelQuery.user_id = { $nin: blockedPrivateUserIds };
    }

    const suggestedReels = await Post.find(reelQuery)
      .populate('user_id', 'username full_name avatar_url isPrivate')
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
    const blockedPrivateUserIds = await getBlockedPrivateUserIds(req.userId);
    const adQuery = {
      status: 'active',
      isDeleted: false
    };
    if (blockedPrivateUserIds.length > 0) {
      adQuery.user_id = { $nin: blockedPrivateUserIds };
    }

    const suggestedAds = await Ad.find(adQuery)
      .populate('vendor_id', 'business_name logo_url')
      .populate('user_id', 'username full_name avatar_url isPrivate')
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
    const blockedPrivateUserIds = await getBlockedPrivateUserIds(currentUserId);

    const reelQuery = {
      type: 'reel',
      isDeleted: { $ne: true }
    };
    if (blockedPrivateUserIds.length > 0) {
      reelQuery.user_id = { $nin: blockedPrivateUserIds };
    }

    const adQuery = {
      status: 'active',
      isDeleted: false
    };
    if (blockedPrivateUserIds.length > 0) {
      adQuery.user_id = { $nin: blockedPrivateUserIds };
    }

    const [suggestedUsers, suggestedReels, suggestedAds, suggestedVendors] = await Promise.all([
      User.find({
        _id: { $nin: excludeIds },
        isDeleted: { $ne: true },
        is_active: true
      })
        .select('username full_name avatar_url followers_count bio role')
        .populate('vendor_profile', 'business_name logo_url')
        .sort({ followers_count: -1 })
        .limit(limit)
        .lean(),
      Post.find(reelQuery)
        .populate('user_id', 'username full_name avatar_url isPrivate')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Ad.find(adQuery)
        .populate('vendor_id', 'business_name logo_url')
        .populate('user_id', 'username full_name avatar_url isPrivate')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Vendor.find({
        user_id: { $nin: excludeIds },
        isDeleted: { $ne: true }
      })
        .populate('user_id', 'username full_name avatar_url followers_count bio')
        .limit(limit)
        .lean()
    ]);

    const formattedUsers = suggestedUsers.map(u => ({
      ...u,
      avatar_url: u.avatar_url && !u.avatar_url.startsWith('http') 
        ? `${baseUrl}/uploads/${u.avatar_url}` 
        : u.avatar_url,
      vendor_details: u.role === 'vendor' ? u.vendor_profile : undefined
    }));

    const formattedReels = suggestedReels.map(r => ({
      ...r,
      media: formatMedia(r.media, baseUrl)
    }));

    const formattedAds = suggestedAds.map(ad => ({
      ...ad,
      media: formatMedia(ad.media, baseUrl)
    }));

    const formattedVendors = suggestedVendors.map(v => ({
      ...v,
      user: {
        ...v.user_id,
        avatar_url: v.user_id?.avatar_url && !v.user_id.avatar_url.startsWith('http') 
          ? `${baseUrl}/uploads/${v.user_id.avatar_url}` 
          : v.user_id?.avatar_url
      }
    }));

    res.json({
      success: true,
      data: {
        users: formattedUsers,
        reels: formattedReels,
        ads: formattedAds,
        vendors: formattedVendors
      }
    });
  } catch (error) {
    console.error('[getSuggestions] error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get suggested vendors
 * @route GET /api/suggestions/vendors
 * @access Private
 */
exports.getSuggestedVendors = async (req, res) => {
  try {
    const currentUserId = req.userId;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const following = await Follow.find({ follower_id: currentUserId }).distinct('followed_id');
    const excludeIds = [currentUserId, ...following];

    const suggestedVendors = await Vendor.find({
      user_id: { $nin: excludeIds },
      isDeleted: { $ne: true }
    })
      .populate('user_id', 'username full_name avatar_url followers_count bio')
      .limit(limit)
      .lean();

    const formattedVendors = suggestedVendors.map(v => ({
      ...v,
      user: {
        ...v.user_id,
        avatar_url: v.user_id?.avatar_url && !v.user_id.avatar_url.startsWith('http') 
          ? `${baseUrl}/uploads/${v.user_id.avatar_url}` 
          : v.user_id?.avatar_url
      }
    }));

    res.json({ success: true, data: formattedVendors });
  } catch (error) {
    console.error('[getSuggestedVendors] error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
