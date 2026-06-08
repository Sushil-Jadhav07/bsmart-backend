const mongoose = require('mongoose');
const SavedPost = require('../models/SavedPost');
const SavedAd = require('../models/SavedAd');
const SavedPromoteReel = require('../models/SavedPromoteReel');
const Post = require('../models/Post');
const PromoteReel = require('../models/PromoteReel');
const Comment = require('../models/Comment');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const sendNotification = require('../utils/sendNotification');

const transformPost = (post, baseUrl) => {
  const obj = post.toObject ? post.toObject() : post;
  obj.post_id = obj._id;
  if (obj.media && Array.isArray(obj.media)) {
    obj.media = obj.media.map(item => ({
      ...item,
      fileUrl: `${baseUrl}/uploads/${item.fileName}`
    }));
  }
  obj.is_saved_by_me = true;
  return obj;
};

const transformPromoteReel = (reel, baseUrl) => {
  const obj = reel.toObject ? reel.toObject() : reel;
  obj.promote_reel_id = obj._id;
  if (obj.media && Array.isArray(obj.media)) {
    obj.media = obj.media.map(item => ({
      ...item,
      fileUrl: item.fileUrl || `${baseUrl}/uploads/${item.fileName}`
    }));
  }
  obj.is_saved_by_me = true;
  return obj;
};

// Save a post/reel
exports.savePost = async (req, res) => {
  try {
    const userId = req.userId;
    const postId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: 'Invalid postId' });
    }
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    let created = false;
    try {
      await SavedPost.create({ user_id: userId, post_id: postId });
      created = true;
    } catch (e) {
      if (e.code === 11000) {
        return res.status(409).json({ message: 'Already saved' });
      }
      throw e;
    }
    if (created) {
      await User.findByIdAndUpdate(userId, { $inc: { saved_posts_count: 1 } }).catch(() => {});
      const ownerId = post.user_id.toString();

      try {
        if (ownerId !== userId.toString()) {
          const saver = await User.findById(userId).select('username').lean();
          if (saver) {
            await sendNotification(req.app, {
              recipient: post.user_id,
              sender: userId,
              type: 'post_save',
              message: `${saver.username} saved your post`,
              link: `/posts/${postId}`
            });
          }
        }
      } catch (notifErr) {
        console.error('Post save notification error:', notifErr);
      }

      if (ownerId !== userId.toString()) {
        try {
          await new WalletTransaction({
            user_id: userId,
            post_id: postId,
            type: 'SAVE',
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
            type: 'SAVE',
            amount: -10,
            status: 'SUCCESS'
          }).save();
          await Wallet.updateOne({ user_id: ownerId }, { $inc: { balance: -10 } }, { upsert: true });
        } catch (e) {
          if (e.code !== 11000) throw e;
        }
      }
    }
    const saved_count = await SavedPost.countDocuments({ post_id: postId });
    return res.json({ success: true, message: 'Post saved', saved: true, saved_count });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Unsave a post/reel
exports.unsavePost = async (req, res) => {
  try {
    const userId = req.userId;
    const postId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: 'Invalid postId' });
    }
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const rel = await SavedPost.findOne({ user_id: userId, post_id: postId });
    if (!rel) {
      return res.status(400).json({ message: 'Not saved yet' });
    }
    await SavedPost.deleteOne({ _id: rel._id });
    await User.findByIdAndUpdate(userId, { $inc: { saved_posts_count: -1 } }).catch(() => {});
    const saved_count = await SavedPost.countDocuments({ post_id: postId });
    return res.json({ success: true, message: 'Post unsaved', saved: false, saved_count });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Save a promote reel
exports.savePromoteReel = async (req, res) => {
  try {
    const userId = req.userId;
    const promoteReelId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(promoteReelId)) {
      return res.status(400).json({ message: 'Invalid promoteReelId' });
    }
    const reel = await PromoteReel.findById(promoteReelId);
    if (!reel) return res.status(404).json({ message: 'Promote reel not found' });
    let created = false;
    try {
      await SavedPromoteReel.create({ user_id: userId, promote_reel_id: promoteReelId });
      created = true;
    } catch (e) {
      if (e.code === 11000) {
        return res.status(409).json({ message: 'Already saved' });
      }
      throw e;
    }
    return res.json({ success: true, message: 'Promote reel saved', saved: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Unsave a promote reel
exports.unsavePromoteReel = async (req, res) => {
  try {
    const userId = req.userId;
    const promoteReelId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(promoteReelId)) {
      return res.status(400).json({ message: 'Invalid promoteReelId' });
    }
    const rel = await SavedPromoteReel.findOne({ user_id: userId, promote_reel_id: promoteReelId });
    if (!rel) {
      return res.status(400).json({ message: 'Not saved yet' });
    }
    await SavedPromoteReel.deleteOne({ _id: rel._id });
    return res.json({ success: true, message: 'Promote reel unsaved', saved: false });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Save an ad
exports.saveAd = async (req, res) => {
  try {
    const userId = req.userId;
    const adId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid adId' });
    }
    // Check if ad exists (we'll assume Ad model exists)
    let created = false;
    try {
      await SavedAd.create({ user_id: userId, ad_id: adId });
      created = true;
    } catch (e) {
      if (e.code === 11000) {
        return res.status(409).json({ message: 'Already saved' });
      }
      throw e;
    }
    return res.json({ success: true, message: 'Ad saved', saved: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Unsave an ad
exports.unsaveAd = async (req, res) => {
  try {
    const userId = req.userId;
    const adId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: 'Invalid adId' });
    }
    const rel = await SavedAd.findOne({ user_id: userId, ad_id: adId });
    if (!rel) {
      return res.status(400).json({ message: 'Not saved yet' });
    }
    await SavedAd.deleteOne({ _id: rel._id });
    return res.json({ success: true, message: 'Ad unsaved', saved: false });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Get all saved items (posts/reels, promote reels, ads) for a user
exports.getSavedItems = async (req, res) => {
  try {
    let userId = req.params.id;
    if (!mongoose.isValidObjectId(userId)) {
      userId = req.userId;
    }
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    // Get saved posts/reels
    const savedPosts = await SavedPost.find({ user_id: userId }).sort({ createdAt: -1 }).lean();
    const postIds = savedPosts.map(s => s.post_id);
    const posts = await Post.find({ _id: { $in: postIds }, isDeleted: false })
      .populate('user_id', 'username full_name avatar_url followers_count following_count gender location')
      .lean();
    
    // Get comments for each post
    const postIdsWithComments = posts.map(p => p._id);
    const comments = await Comment.find({ post_id: { $in: postIdsWithComments }, isDeleted: false })
      .lean();
    
    // Group comments by post
    const commentsByPost = {};
    comments.forEach(c => {
      if (!commentsByPost[c.post_id]) {
        commentsByPost[c.post_id] = [];
      }
      commentsByPost[c.post_id].push({
        _id: c._id,
        text: c.text,
        user: c.user,
        createdAt: c.createdAt,
        replies: c.replies || []
      });
    });
    
    // Transform posts and add comments
    const transformedPosts = posts.map(p => {
      const transformed = transformPost(p, baseUrl);
      transformed.comments = commentsByPost[p._id] || [];
      transformed.type = 'post';
      return transformed;
    });
    
    // Get saved promote reels
    const savedPromoteReels = await SavedPromoteReel.find({ user_id: userId }).sort({ createdAt: -1 }).lean();
    const promoteReelIds = savedPromoteReels.map(s => s.promote_reel_id);
    const promoteReels = await PromoteReel.find({ _id: { $in: promoteReelIds }, isDeleted: false })
      .populate('user_id', 'username full_name avatar_url followers_count following_count gender location')
      .lean();
    
    // Transform promote reels
    const transformedPromoteReels = promoteReels.map(r => {
      const transformed = transformPromoteReel(r, baseUrl);
      transformed.type = 'promote_reel';
      return transformed;
    });
    
    // Combine all items and sort by saved date (most recent first)
    const allItems = [
      ...transformedPosts.map(p => ({ ...p, savedAt: savedPosts.find(s => s.post_id.toString() === p._id.toString()).createdAt })),
      ...transformedPromoteReels.map(r => ({ ...r, savedAt: savedPromoteReels.find(s => s.promote_reel_id.toString() === r._id.toString()).createdAt }))
    ].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    
    return res.json({ success: true, items: allItems, total_items: allItems.length });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getSavedPostsByUser = async (req, res) => {
  try {
    let userId = req.params.id;
    if (!mongoose.isValidObjectId(userId)) {
      userId = req.userId;
    }
    const saved = await SavedPost.find({ user_id: userId }).lean();
    const ids = saved.map(s => s.post_id);
    const posts = await Post.find({ _id: { $in: ids } }).sort({ createdAt: -1 }).populate('user_id', 'username full_name avatar_url followers_count following_count gender location');
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const transformed = posts.map(p => transformPost(p, baseUrl));
    return res.json(transformed);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.listMySavedPosts = async (req, res) => {
  try {
    const userId = req.userId;
    const items = await SavedPost.find({ user_id: userId }).sort({ createdAt: -1 }).lean();
    const ids = items.map(s => s.post_id);
    const posts = await Post.find({ _id: { $in: ids } })
      .sort({ createdAt: -1 })
      .populate('user_id', 'username full_name avatar_url gender location');
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const data = posts.map(p => transformPost(p, baseUrl));
    return res.json({ success: true, posts: data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};
