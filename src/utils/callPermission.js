const Follow = require('../models/Follow');

// Calling requires a MUTUAL follow — both users follow each other.
// A one-way follow is not enough; this is the agreed abuse-prevention rule.
const canCall = async (callerId, receiverId) => {
  if (String(callerId) === String(receiverId)) return false;

  const [callerFollowsReceiver, receiverFollowsCaller] = await Promise.all([
    Follow.exists({ follower_id: callerId, followed_id: receiverId }),
    Follow.exists({ follower_id: receiverId, followed_id: callerId }),
  ]);

  return !!(callerFollowsReceiver && receiverFollowsCaller);
};

module.exports = { canCall };
