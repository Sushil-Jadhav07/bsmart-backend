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
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    let created = false;
    try {
      await SavedPost.create({ user_id: userId, post_id: postId });
      created = true;
    } catch (e) {
      if (e.code !== 11000) throw e;
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
    return res.json({ saved: true, alreadySaved: !created });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.unsavePost = async (req, res) => {
  try {
    const userId = req.userId;
    const postId = req.params.id;
    const rel = await SavedPost.findOne({ user_id: userId, post_id: postId });
    if (!rel) {
      return res.json({ unsaved: true, alreadyNotSaved: true });
    }
    await SavedPost.deleteOne({ _id: rel._id });
    await User.findByIdAndUpdate(userId, { $inc: { saved_posts_count: -1 } }).catch(() => {});
    return res.json({ unsaved: true });
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
