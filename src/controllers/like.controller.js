const Post = require('../models/Post');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');

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

    const ownerId = post.user_id.toString();
    if (ownerId !== userId.toString()) {
      try {
        await new WalletTransaction({
          user_id: userId,
          post_id: postId,
          type: 'LIKE',
          amount: 10,
          status: 'SUCCESS'
        }).save();
        await Wallet.updateOne({ user_id: userId }, { $inc: { balance: 10 } }, { upsert: true });
      } catch (e) {
        if (e.code !== 11000) throw e;
      }
      try {
        await new WalletTransaction({
          user_id: ownerId,
          post_id: postId,
          type: 'LIKE',
          amount: -10,
          status: 'SUCCESS'
        }).save();
        await Wallet.updateOne({ user_id: ownerId }, { $inc: { balance: -10 } }, { upsert: true });
      } catch (e) {
        if (e.code !== 11000) throw e;
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
