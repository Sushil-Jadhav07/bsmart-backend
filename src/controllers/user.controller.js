const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Vendor = require('../models/Vendor');
const PromoteReel = require('../models/PromoteReel');
const Tweet = require('../models/tweet.model');
const mongoose = require('mongoose');
const { checkSections } = require('../utils/privacyGuard');

// Helper to transform post with fileUrl (duplicated from post.controller.js to avoid dependency issues)
const transformPost = (post, baseUrl) => {
  const postObj = post.toObject ? post.toObject() : post;
  const toUploadsUrl = (value) => {
    if (!value) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    const clean = raw
      .replace(/^\/+/, '')
      .replace(/^uploads\//i, '')
      .replace(/^\/+/, '');
    return `${baseUrl}/uploads/${clean}`;
  };

  if (postObj.media && Array.isArray(postObj.media)) {
    postObj.media = postObj.media.map(item => ({
      ...item,
      fileUrl: toUploadsUrl(item.fileUrl || item.url || item.fileName)
    }));
  }

  return postObj;
};

// @desc    Get all users with their posts, comments, and likes
// @route   GET /api/auth/users
// @access  Private
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const result = [];
    for (const user of users) {
      const posts = await Post.find({ user_id: user._id })
        .sort({ createdAt: -1 });

      const enrichedPosts = [];
      for (const post of posts) {
        const transformed = transformPost(post, baseUrl);
        const commentsRaw = await Comment.find({ post_id: post._id }).sort({ createdAt: -1 });
        transformed.comments = commentsRaw.map(c => {
          const obj = c.toObject ? c.toObject() : c;
          obj.comment_id = obj._id;
          return obj;
        });
        enrichedPosts.push(transformed);
      }

      const userObj = user.toObject();
      userObj.gender   = (userObj.gender   !== undefined && userObj.gender   !== null) ? String(userObj.gender)   : '';
      userObj.location = (userObj.location !== undefined && userObj.location !== null) ? String(userObj.location) : '';
      userObj.isPrivate = userObj.isPrivate ?? false;   // ← ADDED
      result.push({
        ...userObj,
        posts: enrichedPosts
      });
    }

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get user profile by ID
// @route   GET /api/users/:id
// @access  Public
exports.getUserById = async (req, res) => {
  try {
    const userId = req.params.id;

    // 1. Fetch User
    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ── Privacy check on the profile itself ───────────────────────────────────
    const viewerId = req.userId || null;
    const isOwner  = viewerId && String(viewerId) === String(userId);
    if (!isOwner && req.user?.role !== 'admin') {
      const { profile: canViewProfile } = await checkSections(viewerId, user, ['profile']);
      if (!canViewProfile) {
        return res.status(403).json({
          message: 'This profile is private',
          privacy_blocked: true,
          user: {
            _id: user._id,
            username: user.username,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
          },
        });
      }
    }

    const vendor = await Vendor.findOne({ user_id: userId }).select('validated _id').lean();
    const validated = vendor ? !!vendor.validated : false;
    const obj = user.toObject ? user.toObject() : user;

    // Force gender and location to always be present as strings for ALL roles
    obj.gender   = (obj.gender   !== undefined && obj.gender   !== null) ? String(obj.gender)   : '';
    obj.location = (obj.location !== undefined && obj.location !== null) ? String(obj.location) : '';
    obj.website  = obj.website  || '';
    obj.bio      = obj.bio      || '';

    obj.isPrivate          = obj.isPrivate          ?? false;
    obj.is_email_verified  = obj.is_email_verified  ?? false;
    obj.is_phone_verified  = obj.is_phone_verified  ?? false;
    obj.date_of_birth      = obj.date_of_birth      || null;

    // ad_interests — always return an array
    obj.ad_interests = Array.isArray(obj.ad_interests) ? obj.ad_interests : [];

    obj.validated = validated;
    if (vendor) {
      obj.vendor_id = vendor._id;
    }

    if (req.user?.role === 'admin') {
      const [summaryAgg] = await Post.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(userId),
            isDeleted: { $ne: true },
          },
        },
        {
          $group: {
            _id: null,
            posts_count: { $sum: { $cond: [{ $eq: ['$type', 'post'] }, 1, 0] } },
            reels_count: { $sum: { $cond: [{ $eq: ['$type', 'reel'] }, 1, 0] } },
            likes_count_total: { $sum: { $ifNull: ['$likes_count', 0] } },
            comments_count_total: { $sum: { $ifNull: ['$comments_count', 0] } },
            views_count_total: { $sum: { $ifNull: ['$views_count', 0] } },
            unique_views_count_total: { $sum: { $ifNull: ['$unique_views_count', 0] } },
          },
        },
      ]);

      obj.summary = {
        posts_count: summaryAgg?.posts_count || 0,
        reels_count: summaryAgg?.reels_count || 0,
        likes_count_total: summaryAgg?.likes_count_total || 0,
        comments_count_total: summaryAgg?.comments_count_total || 0,
        views_count_total: summaryAgg?.views_count_total || 0,
        unique_views_count_total: summaryAgg?.unique_views_count_total || 0,
      };
    }

    res.json(obj);

  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get user profile by username
// @route   GET /api/users/username/:username
// @access  Public
exports.getUserByUsername = async (req, res) => {
  try {
    const username = req.params.username;

    // 1. Fetch User by username
    const user = await User.findOne({ username }).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ── Privacy check on the profile itself ───────────────────────────────────
    const viewerIdByUsername = req.userId || null;
    const isOwnerByUsername  = viewerIdByUsername && String(viewerIdByUsername) === String(user._id);
    if (!isOwnerByUsername && req.user?.role !== 'admin') {
      const { profile: canViewProfile } = await checkSections(viewerIdByUsername, user, ['profile']);
      if (!canViewProfile) {
        return res.status(403).json({
          message: 'This profile is private',
          privacy_blocked: true,
          user: {
            _id: user._id,
            username: user.username,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
          },
        });
      }
    }

    const vendor = await Vendor.findOne({ user_id: user._id }).select('validated _id').lean();
    const validated = vendor ? !!vendor.validated : false;
    const obj = user.toObject ? user.toObject() : user;

    // Force gender and location to always be present as strings for ALL roles
    obj.gender   = (obj.gender   !== undefined && obj.gender   !== null) ? String(obj.gender)   : '';
    obj.location = (obj.location !== undefined && obj.location !== null) ? String(obj.location) : '';
    obj.website  = obj.website  || '';
    obj.bio      = obj.bio      || '';

    obj.isPrivate          = obj.isPrivate          ?? false;
    obj.is_email_verified  = obj.is_email_verified  ?? false;
    obj.is_phone_verified  = obj.is_phone_verified  ?? false;
    obj.date_of_birth      = obj.date_of_birth      || null;

    // ad_interests — always return an array
    obj.ad_interests = Array.isArray(obj.ad_interests) ? obj.ad_interests : [];

    obj.validated = validated;
    if (vendor) {
      obj.vendor_id = vendor._id;
    }

    if (req.user?.role === 'admin') {
      const [summaryAgg] = await Post.aggregate([
        {
          $match: {
            user_id: user._id,
            isDeleted: { $ne: true },
          },
        },
        {
          $group: {
            _id: null,
            posts_count: { $sum: { $cond: [{ $eq: ['$type', 'post'] }, 1, 0] } },
            reels_count: { $sum: { $cond: [{ $eq: ['$type', 'reel'] }, 1, 0] } },
            likes_count_total: { $sum: { $ifNull: ['$likes_count', 0] } },
            comments_count_total: { $sum: { $ifNull: ['$comments_count', 0] } },
            views_count_total: { $sum: { $ifNull: ['$views_count', 0] } },
            unique_views_count_total: { $sum: { $ifNull: ['$unique_views_count', 0] } },
          },
        },
      ]);

      obj.summary = {
        posts_count: summaryAgg?.posts_count || 0,
        reels_count: summaryAgg?.reels_count || 0,
        likes_count_total: summaryAgg?.likes_count_total || 0,
        comments_count_total: summaryAgg?.comments_count_total || 0,
        views_count_total: summaryAgg?.views_count_total || 0,
        unique_views_count_total: summaryAgg?.unique_views_count_total || 0,
      };
    }

    res.json(obj);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getUserPostsDetails = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    // Fetch posts, promote reels, and tweets in parallel
    const [postsRaw, promoteReelsRaw, tweetsRaw] = await Promise.all([
      Post.find({ user_id: userId, isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .populate('user_id', 'username full_name avatar_url followers_count following_count gender location'),
      PromoteReel.find({ user_id: userId, isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .populate('user_id', 'username full_name avatar_url'),
      Tweet.find({ author: userId, isDeleted: false, parentTweet: null })
        .sort({ createdAt: -1 })
        .populate('author', 'username full_name avatar_url'),
    ]);

    // Enrich posts with comments
    const enriched = [];
    for (const post of postsRaw) {
      const p = transformPost(post, baseUrl);
      const comments = await Comment.find({ post_id: post._id }).sort({ createdAt: -1 });
      p.comments = comments;
      enriched.push(p);
    }

    // Transform promote reels and tweets with media URLs
    const promoteReels = promoteReelsRaw.map((pr) => withMediaUrls(pr, baseUrl));
    const tweets = tweetsRaw.map((t) => {
      const obj = t.toObject ? t.toObject() : t;
      // Resolve tweet media URLs
      if (Array.isArray(obj.media)) {
        obj.media = obj.media.map((m) => ({
          ...m,
          fileUrl: toUploadsUrl(baseUrl, m?.url || m?.fileName),
        }));
      }
      return obj;
    });

    return res.json({
      posts: enriched,
      promote_reels: promoteReels,
      tweets,
    });
  } catch (error) {
    console.error('[User] getUserPostsDetails error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get user profile content in one payload (posts, reels, promote reels, tweets)
// @route   GET /api/users/:id/profile-content
// @access  Public
exports.getUserProfileContent = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const owner = await User.findById(userId).select('privacy').lean();
    if (!owner) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ── Per-section privacy check ──────────────────────────────────────────────
    const viewerIdPC = req.userId || null;
    const isOwnerPC  = viewerIdPC && String(viewerIdPC) === String(userId);
    let privacy = { posts: true, pulse: true };
    if (!isOwnerPC) {
      privacy = await checkSections(viewerIdPC, owner, ['posts', 'pulse']);
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));

    // Only query sections the viewer is allowed to see
    const [postsRaw, reelsRaw, promoteReelsRaw, tweetsRaw] = await Promise.all([
      privacy.posts
        ? Post.find({ user_id: userId, type: 'post', isDeleted: { $ne: true } })
            .sort({ createdAt: -1 }).limit(limit)
            .populate('user_id', 'username full_name avatar_url')
        : [],
      privacy.pulse
        ? Post.find({ user_id: userId, type: 'reel', isDeleted: { $ne: true } })
            .sort({ createdAt: -1 }).limit(limit)
            .populate('user_id', 'username full_name avatar_url')
        : [],
      privacy.pulse
        ? PromoteReel.find({ user_id: userId, isDeleted: { $ne: true } })
            .sort({ createdAt: -1 }).limit(limit)
            .populate('user_id', 'username full_name avatar_url')
        : [],
      privacy.posts
        ? Tweet.find({ author: userId, isDeleted: false, parentTweet: null })
            .sort({ createdAt: -1 }).limit(limit)
            .populate('author', 'username full_name avatar_url')
        : [],
    ]);

    const posts = postsRaw.map((p) => withMediaUrls(p, baseUrl));
    const reels = reelsRaw.map((r) => withMediaUrls(r, baseUrl));
    const promoteReels = promoteReelsRaw.map((pr) => withMediaUrls(pr, baseUrl));
    const tweets = tweetsRaw.map((t) => withMediaUrls(t, baseUrl));

    return res.json({
      user_id: userId,
      privacy_restricted: {
        posts: !privacy.posts,
        pulse: !privacy.pulse,
      },
      counts: {
        posts: posts.length,
        reels: reels.length,
        promote_reels: promoteReels.length,
        tweets: tweets.length
      },
      data: {
        posts,
        reels,
        promote_reels: promoteReels,
        tweets
      }
    });
  } catch (error) {
    console.error('[User] getUserProfileContent error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    List user profiles (basic info)
// @route   GET /api/users
// @access  Private
exports.listUsersProfiles = async (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const users = await User.find({})
      .select('_id username full_name email avatar_url phone role gender location followers_count following_count isPrivate ad_interests is_active ban_type ban_until createdAt updatedAt')  // include email for admin dashboard user list
      .sort({ createdAt: -1 })
      .lean();
    const ids = users.map(u => u._id);
    const vendors = await Vendor.find({ user_id: { $in: ids } }).select('user_id validated _id').lean();
    const vmap = new Map(vendors.map(v => [v.user_id.toString(), v]));
    const results = [];
    for (const u of users) {
      u.gender   = (u.gender   !== undefined && u.gender   !== null) ? String(u.gender)   : '';
      u.location = (u.location !== undefined && u.location !== null) ? String(u.location) : '';
      u.isPrivate = u.isPrivate ?? false;   // ← ADDED
      u.ad_interests = Array.isArray(u.ad_interests) ? u.ad_interests : [];
      const vendor = vmap.get(u._id.toString());
      u.validated = vendor ? !!vendor.validated : false;
      if (vendor) {
        u.vendor_id = vendor._id;
      }
      const posts = await Post.find({ user_id: u._id })
        .sort({ createdAt: -1 })
        .populate('user_id', 'username full_name avatar_url followers_count following_count gender location');
      const enrichedPosts = posts.map(p => {
        const tp = transformPost(p, baseUrl);
        return {
          ...tp,
          comments: tp.latest_comments || []
        };
      });
      const summary = {
        posts_count: enrichedPosts.length,
        reels_count: enrichedPosts.filter(p => p.type === 'reel').length,
        likes_count_total: enrichedPosts.reduce((acc, p) => acc + (p.likes_count || 0), 0),
        comments_count_total: enrichedPosts.reduce((acc, p) => acc + (p.comments_count || 0), 0),
        views_count_total: enrichedPosts.reduce((acc, p) => acc + (p.views_count || 0), 0),
        unique_views_count_total: enrichedPosts.reduce((acc, p) => acc + (p.unique_views_count || 0), 0),
        completed_views_count_total: enrichedPosts.reduce((acc, p) => acc + (p.completed_views_count || 0), 0)
      };
      results.push({
        user: u,
        summary,
        posts: enrichedPosts
      });
    }
    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;

    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this profile' });
    }

    const {
      full_name, bio, avatar_url, phone, username, age,
      gender, location, address, twoFA,
      website, date_of_birth, interests,
    } = req.body;

    const ALLOWED_GENDERS = ['male', 'female', 'third_gender', 'prefer_not_to_say'];

    const normalizeAddress = (raw = {}) => {
      const obj = raw && typeof raw === 'object' ? raw : {};
      const toStr = (v) => (v === undefined || v === null) ? '' : String(v);
      return {
        address_line1: toStr(obj.address_line1 ?? obj.addressLine1 ?? obj.address_line_1 ?? obj.addressLine_1 ?? obj.street),
        address_line2: toStr(obj.address_line2 ?? obj.addressLine2 ?? obj.address_line_2 ?? obj.addressLine_2),
        pincode: toStr(obj.pincode ?? obj.pin_code ?? obj.pinCode ?? obj.zip ?? obj.zipcode),
        city: toStr(obj.city),
        state: toStr(obj.state),
        country: toStr(obj.country)
      };
    };

    const updateFields = {};
    if (full_name  !== undefined) updateFields.full_name  = full_name;
    if (bio        !== undefined) updateFields.bio        = bio;
    if (avatar_url !== undefined) updateFields.avatar_url = avatar_url;
    if (phone      !== undefined) updateFields.phone      = phone;
    if (username   !== undefined) updateFields.username   = username;
    if (website    !== undefined) updateFields.website    = String(website).trim();
    if (typeof age      !== 'undefined') updateFields.age      = age;
    if (typeof location !== 'undefined') updateFields.location = location;
    if (typeof address  !== 'undefined') updateFields.address  = normalizeAddress(address);

    if (typeof gender !== 'undefined') {
      if (gender !== '' && !ALLOWED_GENDERS.includes(gender)) {
        return res.status(400).json({ message: `gender must be one of: ${ALLOWED_GENDERS.join(', ')}` });
      }
      updateFields.gender = gender;
    }

    if (date_of_birth !== undefined) {
      const dob = new Date(date_of_birth);
      if (isNaN(dob.getTime())) {
        return res.status(400).json({ message: 'Invalid date_of_birth format (use YYYY-MM-DD)' });
      }
      updateFields.date_of_birth = dob;
    }

    if (interests !== undefined) {
      if (!Array.isArray(interests)) {
        return res.status(400).json({ message: 'interests must be an array' });
      }
      updateFields.ad_interests = interests.map(String);
    }

    if (typeof twoFA !== 'undefined' && typeof twoFA === 'object' && typeof twoFA.enabled === 'boolean') {
      updateFields.twoFA = { enabled: twoFA.enabled };
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const userId = req.params.id;
    const { is_active, admin_user_id, ban_type } = req.body;
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update status' });
    }
    if (!admin_user_id) {
      return res.status(400).json({ message: 'admin_user_id is required' });
    }
    if (req.user._id.toString() !== admin_user_id.toString()) {
      return res.status(403).json({ message: 'Admin user mismatch' });
    }
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ message: 'is_active must be boolean' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.role === 'admin' && is_active === false) {
      return res.status(400).json({ message: 'Admin must remain active' });
    }
    if (is_active === true) {
      user.is_active = true;
      user.ban_type = 'none';
      user.ban_until = null;
      user.ban_reason = '';
      user.banned_by = null;
      user.banned_at = null;
    } else {
      const requestedBanType = String(ban_type || 'temporary').toLowerCase();
      if (!['temporary', 'permanent'].includes(requestedBanType)) {
        return res.status(400).json({ message: 'ban_type must be temporary or permanent when banning a user' });
      }
      user.is_active = false;
      user.ban_type = requestedBanType;
      user.ban_until = requestedBanType === 'temporary'
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : null;
      user.ban_reason = requestedBanType === 'temporary'
        ? 'Banned for 30 days by admin'
        : 'Permanently banned by admin';
      user.banned_by = req.user._id;
      user.banned_at = new Date();
    }
    await user.save();
    res.json({
      id: user._id,
      is_active: user.is_active,
      ban_type: user.ban_type,
      ban_until: user.ban_until,
      ban_reason: user.ban_reason,
      banned_by: user.banned_by,
      banned_at: user.banned_at,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private
exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    if (req.userId.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this profile' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await Post.deleteMany({ user_id: userId });
    await User.findByIdAndDelete(userId);

    res.json({ message: 'User and all associated data deleted successfully' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── Ad Interest Categories ────────────────────────────────────────────────
const AD_CATEGORIES = require('../data/adCategories');

// @desc    Get ad interest categories for a user profile (by user ID)
// @route   GET /api/users/:id/interests
// @access  Public
exports.getUserInterests = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('ad_interests username full_name avatar_url');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({
      user_id: user._id,
      username: user.username,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      ad_interests: user.ad_interests || [],
      available_categories: AD_CATEGORIES,
    });
  } catch (error) {
    console.error('[User] getUserInterests error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Add / update ad interest categories for the logged-in user
// @route   POST /api/users/:id/interests
// @access  Private (logged-in user can only update their own interests)
// Body: { interests: ["Electronics", "Gaming"] }   — replaces the full list
// Body: { add: ["Electronics"] }                   — appends without duplicates
// Body: { remove: ["Electronics"] }                — removes listed items
exports.updateUserInterests = async (req, res) => {
  try {
    const targetId = req.params.id;

    // Only the authenticated user themselves may update their own interests
    if (req.userId.toString() !== targetId.toString()) {
      return res.status(403).json({ message: 'Not authorized to update interests for this user' });
    }

    const user = await User.findById(targetId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { interests, add, remove } = req.body;

    // Validate all incoming categories against the master list
    const validate = (arr) => {
      if (!Array.isArray(arr)) return [];
      const invalid = arr.filter(c => !AD_CATEGORIES.includes(c));
      if (invalid.length) {
        throw Object.assign(new Error(`Invalid categories: ${invalid.join(', ')}`), { status: 400 });
      }
      return arr;
    };

    let current = Array.isArray(user.ad_interests) ? [...user.ad_interests] : [];

    if (Array.isArray(interests)) {
      // Full replace
      validate(interests);
      current = [...new Set(interests)];
    } else {
      if (add) {
        validate(add);
        current = [...new Set([...current, ...add])];
      }
      if (remove) {
        validate(remove);
        const removeSet = new Set(remove);
        current = current.filter(c => !removeSet.has(c));
      }
    }

    user.ad_interests = current;
    await user.save();

    res.json({
      message: 'Interests updated successfully',
      user_id: user._id,
      ad_interests: user.ad_interests,
      available_categories: AD_CATEGORIES,
    });
  } catch (error) {
    console.error('[User] updateUserInterests error:', error);
    if (error.status === 400) {
      return res.status(400).json({ message: error.message, available_categories: AD_CATEGORIES });
    }
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

const toUploadsUrl = (baseUrl, value) => {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const clean = normalized.replace(/^\/+/, '').replace(/^uploads\//, '');
  return `${baseUrl}/uploads/${clean}`;
};

const withMediaUrls = (item, baseUrl) => {
  const obj = item.toObject ? item.toObject() : item;
  if (Array.isArray(obj.media)) {
    obj.media = obj.media.map((m) => ({
      ...m,
      fileUrl: toUploadsUrl(baseUrl, m?.fileName),
      url: m?.url ? toUploadsUrl(baseUrl, m.url) : m?.url
    }));
  }
  return obj;
};

exports.adminPatchUser = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const allowed = ['is_active', 'role', 'email', 'username', 'full_name', 'phone', 'ban_type', 'ban_until', 'ban_reason', 'banned_by', 'banned_at'];
    const updates = {};
    allowed.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    });

    if (Object.prototype.hasOwnProperty.call(updates, 'is_active')) {
      if (updates.is_active === true) {
        updates.ban_type = 'none';
        updates.ban_until = null;
        updates.ban_reason = '';
        updates.banned_by = null;
        updates.banned_at = null;
      } else if (updates.is_active === false) {
        const requestedBanType = String(req.body?.ban_type || 'temporary').toLowerCase();
        if (!['temporary', 'permanent'].includes(requestedBanType)) {
          return res.status(400).json({ success: false, message: 'ban_type must be temporary or permanent when banning a user' });
        }
        updates.ban_type = requestedBanType;
        updates.ban_until = requestedBanType === 'temporary'
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          : null;
        updates.ban_reason = req.body?.ban_reason
          || (requestedBanType === 'temporary' ? 'Banned for 30 days by admin' : 'Permanently banned by admin');
        updates.banned_by = req.user._id;
        updates.banned_at = new Date();
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, data: updatedUser });
  } catch (error) {
    console.error('[User] adminPatchUser error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Check if email is already registered
// @route   POST /api/users/check/email
// @access  Public
exports.checkEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ available: false, message: 'email is required' });
    }
    const exists = await User.exists({ email: email.trim().toLowerCase() });
    if (exists) {
      return res.status(409).json({ available: false, message: 'Email is already registered' });
    }
    return res.json({ available: true, message: 'Email is available' });
  } catch (error) {
    console.error('[User] checkEmail error:', error);
    return res.status(500).json({ available: false, message: 'Server error' });
  }
};

// @desc    Check if username is already taken
// @route   POST /api/users/check/username
// @access  Public
exports.checkUsername = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ available: false, message: 'username is required' });
    }
    const exists = await User.exists({ username: username.trim() });
    if (exists) {
      return res.status(409).json({ available: false, message: 'Username is already taken' });
    }
    return res.json({ available: true, message: 'Username is available' });
  } catch (error) {
    console.error('[User] checkUsername error:', error);
    return res.status(500).json({ available: false, message: 'Server error' });
  }
};

// @desc    Check if phone number is already registered
// @route   POST /api/users/check/phone
// @access  Public
exports.checkPhone = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ available: false, message: 'phone is required' });
    }
    const exists = await User.exists({ phone: phone.trim() });
    if (exists) {
      return res.status(409).json({ available: false, message: 'Phone number is already registered' });
    }
    return res.json({ available: true, message: 'Phone number is available' });
  } catch (error) {
    console.error('[User] checkPhone error:', error);
    return res.status(500).json({ available: false, message: 'Server error' });
  }
};
