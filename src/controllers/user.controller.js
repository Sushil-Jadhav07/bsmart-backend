const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Vendor = require('../models/Vendor');
const PromoteReel = require('../models/PromoteReel');
const Tweet = require('../models/tweet.model');
const mongoose = require('mongoose');

// Helper to transform post with fileUrl (duplicated from post.controller.js to avoid dependency issues)
const transformPost = (post, baseUrl) => {
  const postObj = post.toObject ? post.toObject() : post;

  if (postObj.media && Array.isArray(postObj.media)) {
    postObj.media = postObj.media.map(item => ({
      ...item,
      fileUrl: `${baseUrl}/uploads/${item.fileName}`
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

    const vendor = await Vendor.findOne({ user_id: userId }).select('validated _id').lean();
    const validated = vendor ? !!vendor.validated : false;
    const obj = user.toObject ? user.toObject() : user;

    // Force gender and location to always be present as strings for ALL roles
    obj.gender   = (obj.gender   !== undefined && obj.gender   !== null) ? String(obj.gender)   : '';
    obj.location = (obj.location !== undefined && obj.location !== null) ? String(obj.location) : '';

    obj.isPrivate = obj.isPrivate ?? false;   // ← ADDED

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

    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      return res.status(404).json({ message: 'User not found' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));

    const [postsRaw, reelsRaw, promoteReelsRaw, tweetsRaw] = await Promise.all([
      Post.find({ user_id: userId, type: 'post', isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('user_id', 'username full_name avatar_url'),
      Post.find({ user_id: userId, type: 'reel', isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('user_id', 'username full_name avatar_url'),
      PromoteReel.find({ user_id: userId, isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('user_id', 'username full_name avatar_url'),
      Tweet.find({ author: userId, isDeleted: false, parentTweet: null })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('author', 'username full_name avatar_url')
    ]);

    const posts = postsRaw.map((p) => withMediaUrls(p, baseUrl));
    const reels = reelsRaw.map((r) => withMediaUrls(r, baseUrl));
    const promoteReels = promoteReelsRaw.map((pr) => withMediaUrls(pr, baseUrl));
    const tweets = tweetsRaw.map((t) => withMediaUrls(t, baseUrl));

    return res.json({
      user_id: userId,
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
      .select('_id username full_name avatar_url phone role gender location followers_count following_count isPrivate ad_interests createdAt updatedAt')  // ← isPrivate added to select
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

    const { full_name, bio, avatar_url, phone, username, age, gender, location, address, twoFA } = req.body;

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
    if (full_name)                  updateFields.full_name  = full_name;
    if (bio)                        updateFields.bio        = bio;
    if (avatar_url)                 updateFields.avatar_url = avatar_url;
    if (phone)                      updateFields.phone      = phone;
    if (username)                   updateFields.username   = username;
    if (typeof age      !== 'undefined') updateFields.age      = age;
    if (typeof gender   !== 'undefined') updateFields.gender   = gender;
    if (typeof location !== 'undefined') updateFields.location = location;
    if (typeof address  !== 'undefined') updateFields.address  = normalizeAddress(address);
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
    const { is_active, admin_user_id } = req.body;
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
    user.is_active = is_active;
    await user.save();
    res.json({ id: user._id, is_active: user.is_active });
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

    const allowed = ['is_active', 'role', 'email', 'username', 'full_name', 'phone'];
    const updates = {};
    allowed.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    });

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
