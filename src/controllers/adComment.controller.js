const AdComment = require('../models/AdComment');
const Ad = require('../models/Ad');

/**
 * Add a comment to an ad
 * @route POST /api/ads/:id/comments
 * @access Private
 */
exports.addAdComment = async (req, res) => {
  try {
    const { text } = req.body;
    const adId = req.params.id;
    const userId = req.userId;

    if (!text) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const ad = await Ad.findById(adId);
    if (!ad || ad.isDeleted) {
      return res.status(404).json({ message: 'Ad not found' });
    }

    const newComment = new AdComment({
      ad_id: adId,
      user_id: userId,
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

    const comments = await AdComment.find({ ad_id: adId, isDeleted: false })
      .sort({ createdAt: -1 })
      .populate('user_id', 'username full_name avatar_url');

    res.json(comments);
  } catch (error) {
    console.error('Get ad comments error:', error);
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
