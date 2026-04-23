const mongoose = require('mongoose');
const Follow = require('../models/Follow');
const User = require('../models/User');
const sendNotification = require('../utils/sendNotification');

// ─── HELPER ────────────────────────────────────────────────────────────────
const toStr = (id) => id?.toString();

const buildFollowStatus = ({
  targetId,
  isFollowing = false,
  isFollowedBy = false,
  isPending = false,
}) => {
  const normalizedPending = Boolean(!isFollowing && isPending);
  return {
    userId: String(targetId),
    isFollowing: Boolean(isFollowing),
    isFollowedBy: Boolean(isFollowedBy),
    isPending: normalizedPending,
    requestPending: normalizedPending,
    requested: normalizedPending,
    status: isFollowing ? 'following' : (normalizedPending ? 'pending' : 'not_following'),
  };
};

// ─── followUser (body: { followedUserId }) ─────────────────────────────────
exports.followUser = async (req, res) => {
  try {
    const followerId = req.userId;
    const { followedUserId } = req.body;

    if (!followedUserId) return res.status(400).json({ message: 'followedUserId is required' });
    if (toStr(followerId) === toStr(followedUserId)) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }

    const followedUser = await User.findById(followedUserId);
    if (!followedUser) return res.status(404).json({ message: 'User not found' });

    // ── PRIVATE ACCOUNT: send request instead ──────────────────────────────
    if (followedUser.isPrivate) {
      const alreadyFollowing = await Follow.findOne({ follower_id: followerId, followed_id: followedUserId });
      if (alreadyFollowing) return res.json({ followed: true, alreadyFollowing: true });

      const alreadyRequested = followedUser.followRequests?.some(
        (id) => toStr(id) === toStr(followerId)
      );
      if (alreadyRequested) {
        return res.status(409).json({ message: 'Follow request already sent' });
      }

      await User.findByIdAndUpdate(followedUserId, { $addToSet: { followRequests: followerId } });

      const follower = await User.findById(followerId);
      if (follower) {
        await sendNotification(req.app, {
          recipient: followedUserId,
          sender: followerId,
          type: 'follow_request',
          message: `${follower.username} requested to follow you`,
          link: `/profile/${followerId}`
        }).catch(() => {});
      }

      return res.json({
        requested: true,
        pending: true,
        requestPending: true,
        status: 'pending',
        message: 'Follow request sent',
      });
    }

    // ── PUBLIC ACCOUNT: direct follow ──────────────────────────────────────
    let created = false;
    try {
      await Follow.create({ follower_id: followerId, followed_id: followedUserId });
      created = true;
    } catch (e) {
      if (e.code === 11000) { created = false; } else { throw e; }
    }

    if (created) {
      await User.findByIdAndUpdate(followerId, { $inc: { following_count: 1 } });
      await User.findByIdAndUpdate(followedUserId, { $inc: { followers_count: 1 } });

      const follower = await User.findById(followerId);
      if (follower) {
        await sendNotification(req.app, {
          recipient: followedUserId,
          sender: followerId,
          type: 'follow',
          message: `${follower.username} started following you`,
          link: `/profile/${followerId}`
        }).catch(() => {});
      }
    }

    return res.json({ followed: true, alreadyFollowing: !created });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── followByParam (param: :userId) ────────────────────────────────────────
exports.followByParam = async (req, res) => {
  try {
    const followerId = req.userId;
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid userId' });
    if (toStr(followerId) === toStr(userId)) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }

    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ message: 'User not found' });

    const existing = await Follow.findOne({ follower_id: followerId, followed_id: userId });
    if (existing) return res.status(409).json({ message: 'Already following' });

    // ── PRIVATE ACCOUNT: send request instead ──────────────────────────────
    if (target.isPrivate) {
      const alreadyRequested = target.followRequests?.some(
        (id) => toStr(id) === toStr(followerId)
      );
      if (alreadyRequested) {
        return res.status(409).json({ message: 'Follow request already sent' });
      }

      await User.findByIdAndUpdate(userId, { $addToSet: { followRequests: followerId } });

      const me = await User.findById(followerId);
      await sendNotification(req.app, {
        recipient: userId,
        sender: followerId,
        type: 'follow_request',
        message: `${me?.username} requested to follow you`,
        link: `/profile/${followerId}`
      }).catch(() => {});

      return res.json({
        requested: true,
        pending: true,
        requestPending: true,
        status: 'pending',
        message: 'Follow request sent',
      });
    }

    // ── PUBLIC ACCOUNT: direct follow ──────────────────────────────────────
    await Follow.create({ follower_id: followerId, followed_id: userId });
    await User.findByIdAndUpdate(followerId, { $inc: { following_count: 1 } });
    await User.findByIdAndUpdate(userId, { $inc: { followers_count: 1 } });

    const me = await User.findById(followerId);
    const you = await User.findById(userId);
    return res.json({
      success: true,
      follower: { _id: me._id, username: me.username, email: me.email, role: me.role, gender: me.gender, location: me.location },
      following: { _id: you._id, username: you.username, email: you.email, role: you.role, gender: you.gender, location: you.location },
      followingCount: me.following_count || 0,
      followersCount: you.followers_count || 0
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── unfollowUser ──────────────────────────────────────────────────────────
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

// ─── getFollowers ──────────────────────────────────────────────────────────
exports.getFollowers = async (req, res) => {
  try {
    const userId = req.params.id;
    const users = await Follow.find({ followed_id: userId })
      .populate('follower_id', 'username full_name avatar_url followers_count following_count gender location')
      .lean();
    const result = users.map(u => u.follower_id);
    return res.json({ total: result.length, users: result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── getFollowing ──────────────────────────────────────────────────────────
exports.getFollowing = async (req, res) => {
  try {
    const userId = req.params.id;
    const users = await Follow.find({ follower_id: userId })
      .populate('followed_id', 'username full_name avatar_url followers_count following_count gender location')
      .lean();
    const result = users.map(u => u.followed_id);
    return res.json({ total: result.length, users: result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── getAllFollowers ───────────────────────────────────────────────────────
exports.getAllFollowers = async (req, res) => {
  try {
    const rels = await Follow.find({})
      .populate('follower_id', 'username full_name avatar_url followers_count following_count gender location')
      .populate('followed_id', 'username full_name avatar_url followers_count following_count gender location')
      .lean();
    const result = rels.map(r => ({ follower: r.follower_id, followed: r.followed_id }));
    return res.json({ total: result.length, relations: result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── getAllFollowing ───────────────────────────────────────────────────────
exports.getAllFollowing = async (req, res) => {
  try {
    const rels = await Follow.find({})
      .populate('follower_id', 'username full_name avatar_url followers_count following_count gender location')
      .populate('followed_id', 'username full_name avatar_url followers_count following_count gender location')
      .lean();
    const result = rels.map(r => ({ follower: r.follower_id, followed: r.followed_id }));
    return res.json({ total: result.length, relations: result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// NEW: PRIVACY — Follow Request Management
// ══════════════════════════════════════════════════════════════════════════════

// ─── togglePrivacy ─────────────────────────────────────────────────────────
// PATCH /api/follow/privacy/toggle
exports.togglePrivacy = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('isPrivate followRequests username');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const wasPrivate = user.isPrivate;
    user.isPrivate = !wasPrivate;

    // Going public → auto-accept all pending requests
    if (wasPrivate && user.followRequests.length > 0) {
      const pendingIds = user.followRequests;

      try {
        await Follow.insertMany(
          pendingIds.map(rid => ({ follower_id: rid, followed_id: req.userId })),
          { ordered: false }
        );
      } catch (e) {
        if (e.code !== 11000 && !e.writeErrors) throw e;
      }

      await User.updateMany({ _id: { $in: pendingIds } }, { $inc: { following_count: 1 } });
      await User.findByIdAndUpdate(req.userId, { $inc: { followers_count: pendingIds.length } });

      for (const rid of pendingIds) {
        await sendNotification(req.app, {
          recipient: rid,
          sender: req.userId,
          type: 'follow_accepted',
          message: `${user.username} accepted your follow request`,
          link: `/profile/${req.userId}`
        }).catch(() => {});
      }

      user.followRequests = [];
    }

    await user.save();
    return res.json({
      success: true,
      isPrivate: user.isPrivate,
      message: user.isPrivate ? 'Account is now private' : 'Account is now public — all pending requests accepted'
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── setPrivacy ────────────────────────────────────────────────────────────
// PATCH /api/follow/privacy/set  body: { isPrivate: true/false }
exports.setPrivacy = async (req, res) => {
  try {
    const { isPrivate } = req.body;
    if (typeof isPrivate !== 'boolean') {
      return res.status(400).json({ message: 'isPrivate must be a boolean' });
    }

    const user = await User.findById(req.userId).select('isPrivate followRequests username');
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.isPrivate === isPrivate) {
      return res.json({ success: true, isPrivate: user.isPrivate, message: 'No change' });
    }

    const wasPrivate = user.isPrivate;
    user.isPrivate = isPrivate;

    if (wasPrivate && !isPrivate && user.followRequests.length > 0) {
      const pendingIds = user.followRequests;

      try {
        await Follow.insertMany(
          pendingIds.map(rid => ({ follower_id: rid, followed_id: req.userId })),
          { ordered: false }
        );
      } catch (e) {
        if (e.code !== 11000 && !e.writeErrors) throw e;
      }

      await User.updateMany({ _id: { $in: pendingIds } }, { $inc: { following_count: 1 } });
      await User.findByIdAndUpdate(req.userId, { $inc: { followers_count: pendingIds.length } });

      for (const rid of pendingIds) {
        await sendNotification(req.app, {
          recipient: rid,
          sender: req.userId,
          type: 'follow_accepted',
          message: `${user.username} accepted your follow request`,
          link: `/profile/${req.userId}`
        }).catch(() => {});
      }

      user.followRequests = [];
    }

    await user.save();
    return res.json({
      success: true,
      isPrivate: user.isPrivate,
      message: user.isPrivate ? 'Account set to private' : 'Account set to public'
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── getPrivacyStatus ──────────────────────────────────────────────────────
// GET /api/follow/privacy/status
exports.getPrivacyStatus = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('isPrivate followRequests');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ isPrivate: user.isPrivate, pendingRequestsCount: user.followRequests.length });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── getFollowRequests ─────────────────────────────────────────────────────
// GET /api/follow/requests
exports.getFollowRequests = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('followRequests')
      .populate('followRequests', '_id username profilePicture bio followers_count following_count');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ count: user.followRequests.length, requests: user.followRequests });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── acceptFollowRequest ───────────────────────────────────────────────────
// POST /api/follow/requests/:requesterId/accept
exports.acceptFollowRequest = async (req, res) => {
  try {
    const userId = req.userId;
    const { requesterId } = req.params;

    if (!mongoose.isValidObjectId(requesterId)) {
      return res.status(400).json({ message: 'Invalid requesterId' });
    }

    const user = await User.findById(userId).select('followRequests username');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isPending = user.followRequests.some(id => toStr(id) === toStr(requesterId));
    if (!isPending) return res.status(404).json({ message: 'No pending request from this user' });

    try {
      await Follow.create({ follower_id: requesterId, followed_id: userId });
    } catch (e) {
      if (e.code !== 11000) throw e;
    }

    await User.findByIdAndUpdate(requesterId, { $inc: { following_count: 1 } });
    await User.findByIdAndUpdate(userId, { $inc: { followers_count: 1 } });
    await User.findByIdAndUpdate(userId, { $pull: { followRequests: requesterId } });

    await sendNotification(req.app, {
      recipient: requesterId,
      sender: userId,
      type: 'follow_accepted',
      message: `${user.username} accepted your follow request`,
      link: `/profile/${userId}`
    }).catch(() => {});

    return res.json({ success: true, message: 'Follow request accepted' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── declineFollowRequest ──────────────────────────────────────────────────
// POST /api/follow/requests/:requesterId/decline
exports.declineFollowRequest = async (req, res) => {
  try {
    const { requesterId } = req.params;
    if (!mongoose.isValidObjectId(requesterId)) {
      return res.status(400).json({ message: 'Invalid requesterId' });
    }
    await User.findByIdAndUpdate(req.userId, { $pull: { followRequests: requesterId } });
    return res.json({ success: true, message: 'Follow request declined' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── cancelFollowRequest ───────────────────────────────────────────────────
// DELETE /api/follow/request/:userId/cancel
exports.cancelFollowRequest = async (req, res) => {
  try {
    const requesterId = req.userId;
    const { userId: targetId } = req.params;
    if (!mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }
    await User.findByIdAndUpdate(targetId, { $pull: { followRequests: requesterId } });
    return res.json({ success: true, message: 'Follow request cancelled' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── removeFollower ────────────────────────────────────────────────────────
// DELETE /api/follow/followers/:followerId/remove
exports.removeFollower = async (req, res) => {
  try {
    const userId = req.userId;
    const { followerId } = req.params;
    if (!mongoose.isValidObjectId(followerId)) {
      return res.status(400).json({ message: 'Invalid followerId' });
    }
    const rel = await Follow.findOne({ follower_id: followerId, followed_id: userId });
    if (!rel) return res.status(404).json({ message: 'This user is not following you' });

    await Follow.deleteOne({ _id: rel._id });
    await User.findByIdAndUpdate(followerId, { $inc: { following_count: -1 } });
    await User.findByIdAndUpdate(userId, { $inc: { followers_count: -1 } });

    return res.json({ success: true, message: 'Follower removed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/follows/check/:userId
exports.checkFollowStatus = async (req, res) => {
  try {
    const me = req.userId;
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    if (toStr(me) === toStr(userId)) {
      return res.json(buildFollowStatus({
        targetId: userId,
        isFollowing: false,
        isFollowedBy: false,
        isPending: false,
      }));
    }

    const [targetUser, followingRel, followedByRel] = await Promise.all([
      User.findById(userId).select('_id followRequests'),
      Follow.exists({ follower_id: me, followed_id: userId }),
      Follow.exists({ follower_id: userId, followed_id: me }),
    ]);

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isPending = targetUser.followRequests?.some((id) => toStr(id) === toStr(me));
    return res.json(buildFollowStatus({
      targetId: userId,
      isFollowing: Boolean(followingRel),
      isFollowedBy: Boolean(followedByRel),
      isPending: Boolean(isPending),
    }));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/follows/status/bulk   body: { userIds: string[] }
exports.bulkCheckFollowStatus = async (req, res) => {
  try {
    const me = req.userId;
    const { userIds } = req.body || {};

    if (!Array.isArray(userIds)) {
      return res.status(400).json({ message: 'userIds must be an array' });
    }

    const cleanedIds = Array.from(
      new Set(
        userIds
          .filter((id) => mongoose.isValidObjectId(id))
          .map((id) => String(id))
          .filter((id) => id !== String(me))
      )
    ).slice(0, 200);

    if (!cleanedIds.length) {
      return res.json([]);
    }

    const [targets, followingRels, followedByRels] = await Promise.all([
      User.find({ _id: { $in: cleanedIds } }).select('_id followRequests').lean(),
      Follow.find({ follower_id: me, followed_id: { $in: cleanedIds } }).select('followed_id').lean(),
      Follow.find({ follower_id: { $in: cleanedIds }, followed_id: me }).select('follower_id').lean(),
    ]);

    const targetMap = new Map(targets.map((user) => [String(user._id), user]));
    const followingSet = new Set(followingRels.map((rel) => String(rel.followed_id)));
    const followedBySet = new Set(followedByRels.map((rel) => String(rel.follower_id)));

    const result = cleanedIds
      .filter((targetId) => targetMap.has(targetId))
      .map((targetId) => {
        const targetUser = targetMap.get(targetId);
        const isFollowing = followingSet.has(targetId);
        const isPending = (targetUser.followRequests || []).some((id) => toStr(id) === toStr(me));
        return buildFollowStatus({
          targetId,
          isFollowing,
          isFollowedBy: followedBySet.has(targetId),
          isPending,
        });
      });

    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};
