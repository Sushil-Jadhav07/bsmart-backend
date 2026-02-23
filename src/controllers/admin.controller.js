const mongoose = require('mongoose');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Story = require('../models/Story');
const User = require('../models/User');
const Vendor = require('../models/Vendor');

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

exports.deletePostByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid ID' });
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    post.isDeleted = true;
    post.deletedBy = req.userId;
    post.deletedAt = new Date();
    await post.save();
    return res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteReelByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid ID' });
    const post = await Post.findById(id);
    if (!post || post.type !== 'reel') return res.status(404).json({ message: 'Reel not found' });
    post.isDeleted = true;
    post.deletedBy = req.userId;
    post.deletedAt = new Date();
    await post.save();
    return res.json({ message: 'Reel deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteCommentByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid ID' });
    const comment = await Comment.findById(id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    comment.isDeleted = true;
    comment.deletedBy = req.userId;
    comment.deletedAt = new Date();
    await comment.save();
    return res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteReplyByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid ID' });
    const comment = await Comment.findById(id);
    if (!comment || !comment.parent_id) return res.status(404).json({ message: 'Reply not found' });
    comment.isDeleted = true;
    comment.deletedBy = req.userId;
    comment.deletedAt = new Date();
    await comment.save();
    return res.json({ message: 'Reply deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteStoryByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid ID' });
    const story = await Story.findById(id);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    story.isDeleted = true;
    story.deletedBy = req.userId;
    story.deletedAt = new Date();
    await story.save();
    return res.json({ message: 'Story deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteUserByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid ID' });
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isDeleted = true;
    user.is_active = false;
    user.deletedBy = req.userId;
    user.deletedAt = new Date();
    await user.save();
    return res.json({ message: 'User deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteVendorByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { downgrade_user_to_member } = req.body || {};
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid ID' });
    const vendor = await Vendor.findById(id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    vendor.isDeleted = true;
    vendor.deletedBy = req.userId;
    vendor.deletedAt = new Date();
    await vendor.save();
    if (downgrade_user_to_member && vendor.user_id) {
      await User.findByIdAndUpdate(vendor.user_id, { role: 'member' });
    }
    return res.json({ message: 'Vendor deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};
