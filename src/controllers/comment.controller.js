const Comment = require('../models/Comment');
const Post = require('../models/Post');
const User = require('../models/User');

/**
 * Add a comment to a post
 * @route POST /api/posts/:postId/comments
 * @access Private
 */
exports.addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    const userId = req.userId;

    if (!text) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Create comment
    const newComment = new Comment({
      post_id: postId,
      user: {
        id: user._id,
        username: user.username,
        avatar_url: user.avatar_url
      },
      text
    });

    await newComment.save();

    // Increment post comments count
    await Post.findByIdAndUpdate(postId, { $inc: { comments_count: 1 } });

    res.status(201).json(newComment);
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Like a comment
 * @route POST /api/comments/:commentId/like
 * @access Private
 */
exports.likeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.userId;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    if (comment.likes.includes(userId)) {
      return res.status(400).json({ message: 'Already liked' });
    }

    comment.likes.push(userId);
    comment.likes_count = comment.likes.length;
    await comment.save();

    res.json({ liked: true, likes_count: comment.likes_count });
  } catch (error) {
    console.error('Like comment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Unlike a comment
 * @route POST /api/comments/:commentId/unlike
 * @access Private
 */
exports.unlikeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.userId;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    if (!comment.likes.includes(userId)) {
      return res.status(400).json({ message: 'Not liked' });
    }

    // Remove user from likes
    comment.likes = comment.likes.filter(id => id.toString() !== userId);
    comment.likes_count = comment.likes.length;
    await comment.save();

    res.json({ liked: false, likes_count: comment.likes_count });
  } catch (error) {
    console.error('Unlike comment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Delete a comment
 * @route DELETE /api/comments/:id
 * @access Private
 */
exports.deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Find the post to check ownership (optional but good for moderation)
    const post = await Post.findById(comment.post_id);

    // Check permission: Comment author OR Post author can delete
    const isCommentAuthor = comment.user.id.toString() === userId;
    const isPostAuthor = post && post.user_id.toString() === userId;

    if (!isCommentAuthor && !isPostAuthor) {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }

    await comment.deleteOne();

    // Decrement post comments count
    if (post) {
      await Post.findByIdAndUpdate(comment.post_id, { $inc: { comments_count: -1 } });
    }

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get comments for a post
 * @route GET /api/posts/:postId/comments
 * @access Public/Private
 */
exports.getComments = async (req, res) => {
  try {
    const { postId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Check if post exists (optional, but good practice)
    // const post = await Post.findById(postId);
    // if (!post) {
    //   return res.status(404).json({ message: 'Post not found' });
    // }

    const query = { post_id: postId };

    const comments = await Comment.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Comment.countDocuments(query);

    res.json({
      page,
      limit,
      total,
      comments
    });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
