const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');

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

      result.push({
        ...user.toObject(),
        posts: enrichedPosts
      });
    }

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get user profile
// @route   GET /api/users/:id
// @access  Public (or Private depending on requirement)
exports.getUserById = async (req, res) => {
  try {
    const userId = req.params.id;

    // 1. Fetch User
    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);

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
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const posts = await Post.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .populate('user_id', 'username full_name avatar_url followers_count following_count');
    const enriched = [];
    for (const post of posts) {
      const p = transformPost(post, baseUrl);
      const comments = await Comment.find({ post_id: post._id }).sort({ createdAt: -1 });
      p.comments = comments;
      enriched.push(p);
    }
    res.json(enriched);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    List user profiles (basic info)
// @route   GET /api/users
// @access  Private
exports.listUsersProfiles = async (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const users = await User.find({})
      .select('_id username full_name avatar_url phone role followers_count following_count createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean();
    const results = [];
    for (const u of users) {
      const posts = await Post.find({ user_id: u._id })
        .sort({ createdAt: -1 })
        .populate('user_id', 'username full_name avatar_url followers_count following_count');
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

    // Check if user is authorized (updating own profile or admin)
    // Note: Assuming req.user is populated by auth middleware
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this profile' });
    }

    // Update fields
    const { full_name, bio, avatar_url, phone, username } = req.body;

    // Build update object
    const updateFields = {};
    if (full_name) updateFields.full_name = full_name;
    if (bio) updateFields.bio = bio;
    if (avatar_url) updateFields.avatar_url = avatar_url;
    if (phone) updateFields.phone = phone;
    if (username) updateFields.username = username;

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

    // Check if user is authorized (deleting own profile or admin)
    if (req.userId.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this profile' });
    }

    // 1. Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 2. Delete user's posts
    await Post.deleteMany({ user_id: userId });

    // 3. Delete user
    await User.findByIdAndDelete(userId);

    res.json({ message: 'User and all associated data deleted successfully' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
