const Post = require('../models/Post');

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

    // Check if not liked yet
    if (!post.likes.includes(userId)) {
      return res.status(400).json({ message: 'Not liked yet' });
    }

    // Remove like
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
      .populate('likes', 'username full_name avatar_url');

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
