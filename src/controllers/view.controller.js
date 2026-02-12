const mongoose = require('mongoose');
const Post = require('../models/Post');
const PostView = require('../models/PostView');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');

exports.addView = async (req, res) => {
  try {
    const userId = req.userId;
    const { postId } = req.body;
    if (!postId) return res.status(400).json({ message: 'postId is required' });

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.type !== 'reel') return res.status(400).json({ message: 'Only reels support views' });

    let pv = await PostView.findOne({ post_id: postId, user_id: userId });
    if (!pv) {
      pv = await PostView.create({ post_id: postId, user_id: userId, type: 'reel', view_count: 1 });
      await Post.findByIdAndUpdate(postId, {
        $inc: { unique_views_count: 1, views_count: 1 }
      });
    } else {
      pv.view_count += 1;
      await pv.save();
      await Post.findByIdAndUpdate(postId, { $inc: { views_count: 1 } });
    }

    const updated = await Post.findById(postId).select('views_count unique_views_count');
    return res.json({ success: true, views_count: updated.views_count, unique_views_count: updated.unique_views_count });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.completeView = async (req, res) => {
  try {
    const userId = req.userId;
    const { postId, watchTimeMs } = req.body;
    if (!postId) return res.status(400).json({ message: 'postId is required' });

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.type !== 'reel') return res.status(400).json({ message: 'Only reels support views' });

    let pv = await PostView.findOne({ post_id: postId, user_id: userId });
    if (!pv) {
      pv = await PostView.create({ post_id: postId, user_id: userId, type: 'reel', view_count: 1 });
      await Post.findByIdAndUpdate(postId, { $inc: { unique_views_count: 1, views_count: 1 } });
    }

    let completedChanged = false;
    if (!pv.completed) {
      pv.completed = true;
      pv.completed_at = new Date();
      if (typeof watchTimeMs === 'number') pv.watchTimeMs = watchTimeMs;
      completedChanged = true;
      await pv.save();
      await Post.findByIdAndUpdate(postId, { $inc: { completed_views_count: 1 } });
    }

    let rewarded = pv.rewarded;
    let walletBalance = null;
    if (!pv.rewarded) {
      await Wallet.updateOne({ user_id: userId }, { $inc: { balance: 20 } }, { upsert: true });
      await WalletTransaction.updateOne(
        { user_id: userId, post_id: postId, type: 'REEL_VIEW_REWARD' },
        { $setOnInsert: { status: 'SUCCESS', amount: 20 } },
        { upsert: true }
      );
      pv.rewarded = true;
      pv.rewarded_at = new Date();
      await pv.save();
      rewarded = true;
      const wallet = await Wallet.findOne({ user_id: userId });
      walletBalance = wallet ? wallet.balance : null;
    } else {
      const wallet = await Wallet.findOne({ user_id: userId });
      walletBalance = wallet ? wallet.balance : null;
    }

    return res.json({
      success: true,
      completed: pv.completed,
      rewarded,
      walletBalance,
      message: completedChanged ? 'View completed and processed' : 'Already completed'
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};
