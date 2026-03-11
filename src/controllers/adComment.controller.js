const mongoose = require('mongoose');
const AdComment = require('../models/AdComment');
const Ad = require('../models/Ad');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const sendNotification = require('../utils/sendNotification');
const runMongoTransaction = require('../utils/runMongoTransaction');

async function rewardAdEngagement({ userId, adOwnerId, adId, rewardAmount, userTxType, ownerTxType }) {
  if (!rewardAmount || rewardAmount <= 0) return 0;
  try {
    let rewarded = 0;

    await runMongoTransaction({
      work: async (session) => {
        const ad = await Ad.findById(adId).select('total_budget_coins total_coins_spent vendor_id user_id isDeleted').session(session);
        if (!ad || ad.isDeleted) {
          return;
        }

        if (String(ad.user_id) !== String(adOwnerId)) {
          return;
        }

        const remaining = Number(ad.total_budget_coins || 0) - Number(ad.total_coins_spent || 0);
        if (remaining < rewardAmount) {
          return;
        }

        await Wallet.findOneAndUpdate(
          { user_id: userId },
          { $inc: { balance: rewardAmount } },
          { upsert: true, session }
        );

        ad.total_coins_spent = Number(ad.total_coins_spent || 0) + rewardAmount;
        await ad.save({ session });

        await WalletTransaction.create([
          {
            user_id: userId,
            vendor_id: ad.vendor_id,
            ad_id: adId,
            type: userTxType,
            amount: rewardAmount,
            status: 'SUCCESS',
            description: 'Reward for ad engagement'
          },
          {
            user_id: adOwnerId,
            vendor_id: ad.vendor_id,
            ad_id: adId,
            type: ownerTxType,
            amount: -rewardAmount,
            status: 'SUCCESS',
            description: 'Ad budget spent (engagement)'
          }
        ], { session });

        rewarded = rewardAmount;
      },
      fallback: async () => {
        const ad = await Ad.findById(adId).select('total_budget_coins total_coins_spent vendor_id user_id isDeleted');
        if (!ad || ad.isDeleted) {
          return;
        }

        if (String(ad.user_id) !== String(adOwnerId)) {
          return;
        }

        const remaining = Number(ad.total_budget_coins || 0) - Number(ad.total_coins_spent || 0);
        if (remaining < rewardAmount) {
          return;
        }

        await Wallet.findOneAndUpdate(
          { user_id: userId },
          { $inc: { balance: rewardAmount } },
          { upsert: true }
        );

        ad.total_coins_spent = Number(ad.total_coins_spent || 0) + rewardAmount;
        await ad.save();

        await WalletTransaction.create([
          {
            user_id: userId,
            vendor_id: ad.vendor_id,
            ad_id: adId,
            type: userTxType,
            amount: rewardAmount,
            status: 'SUCCESS',
            description: 'Reward for ad engagement'
          },
          {
            user_id: adOwnerId,
            vendor_id: ad.vendor_id,
            ad_id: adId,
            type: ownerTxType,
            amount: -rewardAmount,
            status: 'SUCCESS',
            description: 'Ad budget spent (engagement)'
          }
        ]);

        rewarded = rewardAmount;
      }
    });

    return rewarded;
  } catch (err) {
    if (err.code === 11000) return 0;
    console.error(`rewardAdEngagement error [${userTxType}]:`, err);
    return 0;
  }
}

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

    try {
      if (ad.user_id.toString() !== userId.toString()) {
        const commenter = await User.findById(userId).select('username').lean();
        if (commenter) {
          await sendNotification(req.app, {
            recipient: ad.user_id,
            sender: userId,
            type: 'ad_comment',
            message: `${commenter.username} commented on your ad`,
            link: `/ads/${ad._id}`
          });
        }
      }
    } catch (notifErr) {
      console.error('Ad comment notification error:', notifErr);
    }

    // Increment comment count
    await Ad.findByIdAndUpdate(adId, { $inc: { comments_count: 1 } });

    // Populate user info for immediate display
    await newComment.populate('user_id', 'username full_name avatar_url gender location');

    res.status(201).json({ ...newComment.toObject(), coins_earned: 0 });
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
      .populate('user_id', 'username full_name avatar_url gender location');

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
      .populate('user_id', 'username full_name avatar_url gender location');

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

    const comment = await AdComment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    let deletedCount = 1; // The comment itself

    // If it's a top-level comment, also delete all its replies
    if (!comment.parent_id) {
      const repliesCount = await AdComment.countDocuments({ parent_id: commentId });
      if (repliesCount > 0) {
        await AdComment.deleteMany({ parent_id: commentId });
        deletedCount += repliesCount;
      }
    }

    // Delete the comment itself
    await AdComment.findByIdAndDelete(commentId);

    // Update the comments count on the Ad
    await Ad.findByIdAndUpdate(
      comment.ad_id,
      { $inc: { comments_count: -deletedCount } },
      { new: true }
    );

    // Ensure comment count doesn't go below zero
    await Ad.findOneAndUpdate(
      { _id: comment.ad_id, comments_count: { $lt: 0 } },
      { $set: { comments_count: 0 } }
    );

    res.json({ message: 'Comment deleted successfully' });
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
