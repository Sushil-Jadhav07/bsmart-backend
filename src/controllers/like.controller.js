const Post = require('../models/Post');
const sendNotification = require('../utils/sendNotification');
const User = require('../models/User'); // Need User model to get username

// @desc    Like a post
// @route   POST /api/posts/:id/like
// @access  Private
exports.likePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.userId;

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if already liked
    if (post.likes.includes(userId)) {
      return res.status(400).json({ message: 'Already liked' });
    }

    // Add like
    post.likes.push(userId);
    post.likes_count = post.likes.length;
    await post.save();

    // Notify post owner when someone likes (skip if liker is owner)
    if (post.user_id.toString() !== userId.toString()) {
      const liker = await User.findById(userId);
      if (liker) {
        await sendNotification(req.app, {
          recipient: post.user_id,
          sender: userId,
          type: 'like',
          message: `${liker.username} liked your post`,
          link: `/posts/${post._id}`
        });
      }
    }

    res.json({
      message: 'Liked',
      likes_count: post.likes_count,
      liked: true
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Unlike a post
// @route   POST /api/posts/:id/unlike
// @access  Private
exports.unlikePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.userId;

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (!post.likes.includes(userId)) {
      return res.status(400).json({ message: 'Not liked yet' });
    }

    post.likes = post.likes.filter(id => id.toString() !== userId.toString());
    post.likes_count = post.likes.length;
    await post.save();

    res.json({
      message: 'Unliked',
      likes_count: post.likes_count,
      liked: false
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get users who liked a post
// @route   GET /api/posts/:id/likes
// @access  Private
exports.getPostLikes = async (req, res) => {
  try {
    const postId = req.params.id;

    const post = await Post.findById(postId)
      .populate('likes', 'username full_name avatar_url followers_count following_count');

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    res.json({
      total: post.likes_count,
      users: post.likes
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};
