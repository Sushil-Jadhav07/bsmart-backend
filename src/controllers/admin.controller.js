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
    await post.deleteOne();
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
    await post.deleteOne();
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
    await comment.deleteOne();
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
    await comment.deleteOne();
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
    const StoryItem = require('../models/StoryItem');
    const StoryView = require('../models/StoryView');
    await StoryItem.deleteMany({ story_id: id });
    await StoryView.deleteMany({ story_id: id });
    await story.deleteOne();
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
    await Post.deleteMany({ user_id: id });
    await Comment.deleteMany({ 'user.id': id });
    const SavedPost = require('../models/SavedPost');
    const Follow = require('../models/Follow');
    await SavedPost.deleteMany({ user_id: id });
    await Follow.deleteMany({ $or: [{ follower_id: id }, { followed_id: id }] });
    await user.deleteOne();
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
    if (downgrade_user_to_member && vendor.user_id) {
      await User.findByIdAndUpdate(vendor.user_id, { role: 'member' });
    }
    await vendor.deleteOne();
    return res.json({ message: 'Vendor deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};
