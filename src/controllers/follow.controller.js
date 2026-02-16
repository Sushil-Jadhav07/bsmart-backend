const mongoose = require('mongoose');
const Follow = require('../models/Follow');
const User = require('../models/User');

exports.followUser = async (req, res) => {
  try {
    const followerId = req.userId;
    const { followedUserId } = req.body;
    if (!followedUserId) return res.status(400).json({ message: 'followedUserId is required' });
    if (followerId.toString() === followedUserId.toString()) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }
    const followedUser = await User.findById(followedUserId);
    if (!followedUser) return res.status(404).json({ message: 'User not found' });
    let created = false;
    try {
      await Follow.create({ follower_id: followerId, followed_id: followedUserId });
      created = true;
    } catch (e) {
      if (e.code === 11000) {
        created = false;
      } else {
        throw e;
      }
    }
    if (created) {
      await User.findByIdAndUpdate(followerId, { $inc: { following_count: 1 } });
      await User.findByIdAndUpdate(followedUserId, { $inc: { followers_count: 1 } });
    }
    return res.json({ followed: true, alreadyFollowing: !created });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.unfollowUser = async (req, res) => {
  try {
    const followerId = req.userId;
    const { followedUserId } = req.body;
    if (!followedUserId) return res.status(400).json({ message: 'followedUserId is required' });
    const rel = await Follow.findOne({ follower_id: followerId, followed_id: followedUserId });
    if (!rel) {
      return res.json({ unfollowed: true, alreadyNotFollowing: true });
    }
    await Follow.deleteOne({ _id: rel._id });
    await User.findByIdAndUpdate(followerId, { $inc: { following_count: -1 } });
    await User.findByIdAndUpdate(followedUserId, { $inc: { followers_count: -1 } });
    return res.json({ unfollowed: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getFollowers = async (req, res) => {
  try {
    const userId = req.params.id;
    const users = await Follow.find({ followed_id: userId })
      .populate('follower_id', 'username full_name avatar_url followers_count following_count')
      .lean();
    const result = users.map(u => u.follower_id);
    return res.json({ total: result.length, users: result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getFollowing = async (req, res) => {
  try {
    const userId = req.params.id;
    const users = await Follow.find({ follower_id: userId })
      .populate('followed_id', 'username full_name avatar_url followers_count following_count')
      .lean();
    const result = users.map(u => u.followed_id);
    return res.json({ total: result.length, users: result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};
