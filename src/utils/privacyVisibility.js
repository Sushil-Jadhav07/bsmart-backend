const Follow = require('../models/Follow');
const User = require('../models/User');

const toId = (value) => String(value || '');

const getFollowedUserIds = async (viewerId) => {
  if (!viewerId) return [];
  const followed = await Follow.find({ follower_id: viewerId }).distinct('followed_id');
  return followed.map((id) => toId(id));
};

const getBlockedPrivateUserIds = async (viewerId) => {
  if (!viewerId) return [];

  const followedIds = await getFollowedUserIds(viewerId);
  const allowedIds = [toId(viewerId), ...followedIds];

  return User.find({
    isPrivate: true,
    _id: { $nin: allowedIds },
    isDeleted: { $ne: true },
    is_active: true,
  }).distinct('_id');
};

const canViewAuthorContent = async (viewerId, authorId) => {
  if (!viewerId || !authorId) return false;
  if (toId(viewerId) === toId(authorId)) return true;

  const author = await User.findById(authorId).select('isPrivate isDeleted is_active').lean();
  if (!author || author.isDeleted || author.is_active === false) return false;
  if (!author.isPrivate) return true;

  const isFollowing = await Follow.exists({ follower_id: viewerId, followed_id: authorId });
  return Boolean(isFollowing);
};

module.exports = {
  getFollowedUserIds,
  getBlockedPrivateUserIds,
  canViewAuthorContent,
};

