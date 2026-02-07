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
    const { text, parent_id } = req.body;
    const userId = req.userId;

    if (!text) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    let parentCommentId = null;

    // Handle replies
    if (parent_id) {
      const parentComment = await Comment.findById(parent_id);
      if (!parentComment) {
        return res.status(404).json({ message: 'Parent comment not found' });
      }

      // Ensure parent comment belongs to the same post
      if (parentComment.post_id.toString() !== postId) {
        return res.status(400).json({ message: 'Parent comment does not belong to this post' });
      }

      // Prevent nested replies (only 1 level allowed)
      if (parentComment.parent_id) {
        // If parent is already a reply, use its parent_id instead (flat structure for replies)
        // OR strictly forbid it as per requirement "Ensure parent.parent_id is null"
        return res.status(400).json({ message: 'Nested replies are not allowed' });
      }

      parentCommentId = parent_id;
    }

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Create comment
    const newComment = new Comment({
      post_id: postId,
      parent_id: parentCommentId,
      user: {
        id: user._id,
        username: user.username,
        avatar_url: user.avatar_url
      },
      text
    });

    await newComment.save();

    // Increment post comments count
    // If it's a top-level comment, also add to latest_comments (preview)
    if (!parentCommentId) {
      await Post.findByIdAndUpdate(postId, { 
        $inc: { comments_count: 1 },
        $push: { 
          latest_comments: {
            $each: [{
              _id: newComment._id,
              text: newComment.text,
              user: newComment.user,
              createdAt: newComment.createdAt,
              replies: []
            }],
            $sort: { createdAt: -1 },
            $slice: 2 // Keep only the latest 2 comments
          }
        }
      });
    } else {
      // It's a reply. Try to add it to the parent comment in latest_comments
        // We use $push operator via findByIdAndUpdate which is atomic and safer than save() for nested arrays
        // Note: latest_comments is an array of subdocuments. We need to match the post AND the specific comment in the array.
        
        await Post.updateOne(
          { _id: postId, "latest_comments._id": parentCommentId },
          { 
            $push: { 
              "latest_comments.$.replies": {
                _id: newComment._id,
                text: newComment.text,
                user: newComment.user,
                createdAt: newComment.createdAt
              }
            }
          }
        );
      
      await Post.findByIdAndUpdate(postId, { $inc: { comments_count: 1 } });
    }

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

    const query = { post_id: postId, parent_id: null };

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

/**
 * Get replies for a comment
 * @route GET /api/comments/:commentId/replies
 * @access Public/Private
 */
exports.getReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { parent_id: commentId };

    const replies = await Comment.find(query)
      .sort({ createdAt: 1 }) // Oldest first for replies
      .skip(skip)
      .limit(limit);

    const total = await Comment.countDocuments(query);

    res.json({
      page,
      limit,
      total,
      replies
    });
  } catch (error) {
    console.error('Get replies error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
