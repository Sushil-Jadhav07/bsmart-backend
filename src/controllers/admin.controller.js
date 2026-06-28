const mongoose = require('mongoose');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Story = require('../models/Story');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const PromoteReel = require('../models/PromoteReel');
const Tweet = require('../models/tweet.model');
const Ad = require('../models/Ad');

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

exports.deletePostByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid ID' });
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    await post.deleteOne();
    return res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteReelByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid ID' });
    const post = await Post.findById(id);
    if (!post || post.type !== 'reel') return res.status(404).json({ message: 'Reel not found' });
    await post.deleteOne();
    return res.json({ message: 'Reel deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteCommentByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid ID' });
    const comment = await Comment.findById(id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    await comment.deleteOne();
    return res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteReplyByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid ID' });
    const comment = await Comment.findById(id);
    if (!comment || !comment.parent_id) return res.status(404).json({ message: 'Reply not found' });
    await comment.deleteOne();
    return res.json({ message: 'Reply deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteStoryByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid ID' });
    const story = await Story.findById(id);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    const StoryItem = require('../models/StoryItem');
    const StoryView = require('../models/StoryView');
    await StoryItem.deleteMany({ story_id: id });
    await StoryView.deleteMany({ story_id: id });
    await story.deleteOne();
    return res.json({ message: 'Story deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteUserByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid ID' });
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await Post.deleteMany({ user_id: id });
    await Comment.deleteMany({ 'user.id': id });
    const SavedPost = require('../models/SavedPost');
    const Follow = require('../models/Follow');
    await SavedPost.deleteMany({ user_id: id });
    await Follow.deleteMany({ $or: [{ follower_id: id }, { followed_id: id }] });
    await user.deleteOne();
    return res.json({ message: 'User deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteVendorByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { downgrade_user_to_member } = req.body || {};
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid ID' });
    const vendor = await Vendor.findById(id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    if (downgrade_user_to_member && vendor.user_id) {
      await User.findByIdAndUpdate(vendor.user_id, { role: 'member' });
    }
    await vendor.deleteOne();
    return res.json({ message: 'Vendor deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Admin — get all users (user data only, no posts)
// @route   GET /api/admin/users
// @access  Admin only
exports.adminGetAllUsers = async (req, res) => {
  try {
    const fetchAll = req.query.all === 'true' || req.query.all === '1';
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = fetchAll ? 0 : Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip  = fetchAll ? 0 : (page - 1) * limit;

    const filter = { isDeleted: { $ne: true } };

    if (req.query.role) {
      filter.role = req.query.role;
    }

    if (req.query.search) {
      const s = req.query.search.trim();
      filter.$or = [
        { username:  { $regex: s, $options: 'i' } },
        { full_name: { $regex: s, $options: 'i' } },
        { email:     { $regex: s, $options: 'i' } },
      ];
    }

    let query = User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 });

    if (!fetchAll) {
      query = query.skip(skip).limit(limit);
    }

    const [users, total] = await Promise.all([
      query.lean(),
      User.countDocuments(filter),
    ]);

    // Normalise fields so the response is always predictable
    const data = users.map((u) => ({
      ...u,
      gender:   (u.gender   != null) ? String(u.gender)   : '',
      location: (u.location != null) ? String(u.location) : '',
      isPrivate:    u.isPrivate    ?? false,
      ad_interests: Array.isArray(u.ad_interests) ? u.ad_interests : [],
    }));

    return res.json({
      success: true,
      total,
      page:  fetchAll ? 1 : page,
      limit: fetchAll ? total : limit,
      pages: fetchAll ? 1 : Math.ceil(total / limit),
      data,
    });
  } catch (error) {
    console.error('[Admin] adminGetAllUsers error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Admin — get a user's content (posts, reels, tweets, promote reels; ads if vendor)
// @route   GET /api/admin/users/:id/content
// @access  Admin only
exports.adminGetUserContent = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const user = await User.findById(id).select('-password').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const cloudfront = process.env.CLOUDFRONT_BASE_URL
      ? process.env.CLOUDFRONT_BASE_URL.replace(/\/+$/, '')
      : null;

    const toFileUrl = (fileName) => {
      if (!fileName) return null;
      const s = String(fileName).trim();
      if (!s) return null;
      if (/^https?:\/\//i.test(s)) {
        if (cloudfront && s.includes('api.bebsmart.in/uploads/')) {
          return s.replace(/https?:\/\/api\.bebsmart\.in\/uploads\//, `${cloudfront}/uploads/`);
        }
        return s;
      }
      const clean = s.replace(/^\/+/, '');
      const key = clean.startsWith('uploads/') ? clean : `uploads/${clean.replace(/^uploads\//, '')}`;
      if (cloudfront) return `${cloudfront}/${key}`;
      return `${baseUrl}/${key}`;
    };

    const withUrls = (item) => {
      const obj = item.toObject ? item.toObject() : { ...item };
      if (Array.isArray(obj.media)) {
        obj.media = obj.media.map((m) => ({ ...m, fileUrl: toFileUrl(m.fileName || m.url) }));
      }
      return obj;
    };

    // Fetch posts, reels, promote reels, tweets in parallel
    const [postsRaw, reelsRaw, promoteReelsRaw, tweetsRaw] = await Promise.all([
      Post.find({ user_id: id, type: 'post', isDeleted: { $ne: true } })
        .sort({ createdAt: -1 }).limit(limit)
        .populate('user_id', 'username full_name avatar_url'),
      Post.find({ user_id: id, type: 'reel', isDeleted: { $ne: true } })
        .sort({ createdAt: -1 }).limit(limit)
        .populate('user_id', 'username full_name avatar_url'),
      PromoteReel.find({ user_id: id, isDeleted: { $ne: true } })
        .sort({ createdAt: -1 }).limit(limit)
        .populate('user_id', 'username full_name avatar_url'),
      Tweet.find({ author: id, isDeleted: false, parentTweet: null })
        .sort({ createdAt: -1 }).limit(limit)
        .populate('author', 'username full_name avatar_url'),
    ]);

    const posts        = postsRaw.map(withUrls);
    const reels        = reelsRaw.map(withUrls);
    const promoteReels = promoteReelsRaw.map(withUrls);
    const tweets       = tweetsRaw.map(withUrls);

    const response = {
      success: true,
      user_id: id,
      role: user.role,
      counts: {
        posts:         posts.length,
        reels:         reels.length,
        promote_reels: promoteReels.length,
        tweets:        tweets.length,
      },
      data: { posts, reels, promote_reels: promoteReels, tweets },
    };

    // If the user is a vendor, also return their ads
    if (user.role === 'vendor') {
      const adsRaw = await Ad.find({ user_id: id, isDeleted: { $ne: true } })
        .sort({ createdAt: -1 }).limit(limit)
        .populate('user_id', 'username full_name avatar_url')
        .lean();

      const ads = adsRaw.map((ad) => {
        if (Array.isArray(ad.media)) {
          ad.media = ad.media.map((m) => ({ ...m, fileUrl: toFileUrl(m.fileName) }));
        }
        return ad;
      });

      response.counts.ads = ads.length;
      response.data.ads   = ads;
    }

    return res.json(response);
  } catch (error) {
    console.error('[Admin] adminGetUserContent error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
