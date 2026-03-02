const AdComment = require('../models/AdComment');
const Ad = require('../models/Ad');

/**
 * Add a comment to an ad
 * @route POST /api/ads/:id/comments
 * @access Private
 */
exports.addAdComment = async (req, res) => {
  try {
    const { text, parent_id } = req.body;
    const adId = req.params.id;
    const userId = req.userId;

    if (!text) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const ad = await Ad.findById(adId);
    if (!ad || ad.isDeleted) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    let parentCommentId = null;

    // Handle replies
    if (parent_id) {
      const parentComment = await AdComment.findById(parent_id);
      if (!parentComment) {
        return res.status(404).json({ message: 'Parent comment not found' });
      }

      // Ensure parent comment belongs to the same ad
      if (parentComment.ad_id.toString() !== adId) {
        return res.status(400).json({ message: 'Parent comment does not belong to this ad' });
      }

      // Prevent nested replies (only 1 level allowed)
      if (parentComment.parent_id) {
        return res.status(400).json({ message: 'Nested replies are not allowed' });
      }

      parentCommentId = parent_id;
    }

    const newComment = new AdComment({
      ad_id: adId,
      user_id: userId,
      parent_id: parentCommentId,
      text
    });

    await newComment.save();

    // Increment comment count
    await Ad.findByIdAndUpdate(adId, { $inc: { comments_count: 1 } });

    // Populate user info for immediate display
    await newComment.populate('user_id', 'username full_name avatar_url');

    res.status(201).json(newComment);
  } catch (error) {
    console.error('Add ad comment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get comments for an ad
 * @route GET /api/ads/:id/comments
 * @access Private
 */
exports.getAdComments = async (req, res) => {
  try {
    const adId = req.params.id;

    // Fetch only top-level comments (parent_id is null)
    const comments = await AdComment.find({ ad_id: adId, parent_id: null, isDeleted: false })
      .sort({ createdAt: -1 })
      .populate('user_id', 'username full_name avatar_url');

    res.json(comments);
  } catch (error) {
    console.error('Get ad comments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get replies for an ad comment
 * @route GET /api/ads/comments/:commentId/replies
 * @access Private
 */
exports.getAdCommentReplies = async (req, res) => {
  try {
    const { commentId } = req.params;

    const replies = await AdComment.find({ parent_id: commentId, isDeleted: false })
      .sort({ createdAt: 1 })
      .populate('user_id', 'username full_name avatar_url');

    res.json(replies);
  } catch (error) {
    console.error('Get ad comment replies error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Delete a comment
 * @route DELETE /api/ads/comments/:commentId
 * @access Private
 */
exports.deleteAdComment = async (req, res) => {
  try {
    const commentId = req.params.commentId;
    const userId = req.userId;
    const userRole = req.user?.role; // Assuming role is attached to req.user

    const comment = await AdComment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Check ownership or admin role
    if (comment.user_id.toString() !== userId && userRole !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }

    comment.isDeleted = true;
    await comment.save();

    // Decrement comment count
    await Ad.findByIdAndUpdate(comment.ad_id, { $inc: { comments_count: -1 } });

    res.json({ message: 'Comment deleted' });
  } catch (error) {
    console.error('Delete ad comment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Like/Unlike a comment
 * @route POST /api/ads/comments/:id/like
 * @access Private
 */
exports.likeAdComment = async (req, res) => {
  try {
    const comment = await AdComment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (comment.likes.filter(like => like.toString() === req.userId).length > 0) {
      // Unlike
      const index = comment.likes.map(like => like.toString()).indexOf(req.userId);
      comment.likes.splice(index, 1);
      await comment.save();
      return res.json({ likes: comment.likes, is_liked: false });
    }

    // Like
    comment.likes.unshift(req.userId);
    await comment.save();
    res.json({ likes: comment.likes, is_liked: true });
  } catch (error) {
    console.error('Like comment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Dislike/Undislike a comment
 * @route POST /api/ads/comments/:id/dislike
 * @access Private
 */
exports.dislikeAdComment = async (req, res) => {
  try {
    const comment = await AdComment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (comment.dislikes.filter(dislike => dislike.toString() === req.userId).length > 0) {
      // Undislike
      const index = comment.dislikes.map(dislike => dislike.toString()).indexOf(req.userId);
      comment.dislikes.splice(index, 1);
      await comment.save();
      return res.json({ dislikes: comment.dislikes, is_disliked: false });
    }

    // Dislike
    comment.dislikes.unshift(req.userId);
    await comment.save();
    res.json({ dislikes: comment.dislikes, is_disliked: true });
  } catch (error) {
    console.error('Dislike comment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
