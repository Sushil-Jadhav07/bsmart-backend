const mongoose = require('mongoose');
const SavedPost = require('../models/SavedPost');
const Post = require('../models/Post');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');

const transformPost = (post, baseUrl) => {
  const obj = post.toObject ? post.toObject() : post;
  obj.post_id = obj._id;
  if (obj.media && Array.isArray(obj.media)) {
    obj.media = obj.media.map(item => ({
      ...item,
      fileUrl: `${baseUrl}/uploads/${item.fileName}`
    }));
  }
  return obj;
};

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

exports.getSavedPostsByUser = async (req, res) => {
  try {
    let userId = req.params.id;
    if (!mongoose.isValidObjectId(userId)) {
      userId = req.userId;
    }
    const saved = await SavedPost.find({ user_id: userId }).lean();
    const ids = saved.map(s => s.post_id);
    const posts = await Post.find({ _id: { $in: ids } }).sort({ createdAt: -1 }).populate('user_id', 'username full_name avatar_url followers_count following_count');
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
      .populate('user_id', 'username full_name avatar_url');
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const data = posts.map(p => transformPost(p, baseUrl));
    return res.json({ success: true, posts: data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};
