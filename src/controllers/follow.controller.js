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

exports.followByParam = async (req, res) => {
  try {
    const followerId = req.userId;
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid userId' });
    if (followerId.toString() === userId.toString()) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }
    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ message: 'User not found' });
    const existing = await Follow.findOne({ follower_id: followerId, followed_id: userId });
    if (existing) {
      return res.status(409).json({ message: 'Already following' });
    }
    await Follow.create({ follower_id: followerId, followed_id: userId });
    await User.findByIdAndUpdate(followerId, { $inc: { following_count: 1 } });
    await User.findByIdAndUpdate(userId, { $inc: { followers_count: 1 } });
    const me = await User.findById(followerId);
    const you = await User.findById(userId);
    return res.json({
      success: true,
      follower: { _id: me._id, username: me.username, email: me.email, role: me.role },
      following: { _id: you._id, username: you.username, email: you.email, role: you.role },
      followingCount: me.following_count || 0,
      followersCount: you.followers_count || 0
    });
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

exports.getAllFollowers = async (req, res) => {
  try {
    const rels = await Follow.find({})
      .populate('follower_id', 'username full_name avatar_url followers_count following_count')
      .populate('followed_id', 'username full_name avatar_url followers_count following_count')
      .lean();
    const result = rels.map(r => ({ follower: r.follower_id, followed: r.followed_id }));
    return res.json({ total: result.length, relations: result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getAllFollowing = async (req, res) => {
  try {
    const rels = await Follow.find({})
      .populate('follower_id', 'username full_name avatar_url followers_count following_count')
      .populate('followed_id', 'username full_name avatar_url followers_count following_count')
      .lean();
    const result = rels.map(r => ({ follower: r.follower_id, followed: r.followed_id }));
    return res.json({ total: result.length, relations: result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};
