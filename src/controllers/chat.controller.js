const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const Follow = require('../models/Follow');
const Post = require('../models/Post');
const Ad = require('../models/Ad');

const USER_SELECT = 'username full_name avatar_url';

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const normalizeEmoji = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeParticipantIds = (userIdA, userIdB) => {
  return [String(userIdA), String(userIdB)].sort();
};

const normalizeUniqueIds = (ids = []) => {
  return [...new Set(ids.map((id) => String(id)))];
};
const getAppBaseUrl = (req) => {
  const configured =
    process.env.CLIENT_URL
    || process.env.FRONTEND_URL
    || process.env.APP_URL
    || '';
  if (configured) return String(configured).replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
};
const toUploadsUrl = (req, fileName) => {
  const trimmed = typeof fileName === 'string' ? fileName.trim() : '';
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${req.protocol}://${req.get('host')}/uploads/${trimmed}`;
};
const resolveShareContent = async (req, contentType, contentId) => {
  const appUrl = getAppBaseUrl(req);

  if (contentType === 'post' || contentType === 'reel') {
    const post = await Post.findOne({ _id: contentId, isDeleted: { $ne: true } })
      .populate('user_id', USER_SELECT)
      .lean();

    if (!post) return null;

    if (contentType === 'reel' && post.type !== 'reel') return null;
    if (contentType === 'post' && post.type === 'reel') return null;

    const ownerName = post?.user_id?.username || post?.user_id?.full_name || 'user';
    const previewType = String(post?.media?.[0]?.type || '').toLowerCase() === 'video' ? 'video' : 'image';
    const caption = typeof post?.caption === 'string' ? post.caption.trim() : '';
    const media0 = post?.media?.[0] || {};
    const thumbnailCandidate =
      media0?.thumbnail?.fileUrl
      || media0?.thumbnail?.fileName
      || media0?.thumbnails?.[0]?.fileUrl
      || media0?.thumbnails?.[0]?.fileName
      || '';
    const primaryMediaCandidate = media0?.fileUrl || media0?.fileName || '';
    const previewCandidate = thumbnailCandidate || (previewType === 'image' ? primaryMediaCandidate : '');

    return {
      contentType,
      contentId: post._id,
      title: post.caption || `${contentType === 'reel' ? 'Reel' : 'Post'} by ${ownerName}`,
      caption,
      previewUrl: toUploadsUrl(req, previewCandidate) || (post?.user_id?.avatar_url || ''),
      previewType,
      creatorId: post?.user_id?._id || null,
      creatorUsername: post?.user_id?.username || '',
      creatorAvatarUrl: post?.user_id?.avatar_url || '',
      creatorVerified: false,
      shareUrl: contentType === 'reel'
        ? `${appUrl}/reels/${post._id}`
        : `${appUrl}/post/${post._id}`,
    };
  }

  if (contentType === 'ad') {
    const ad = await Ad.findOne({ _id: contentId, isDeleted: { $ne: true } })
      .populate('user_id', USER_SELECT)
      .lean();
    if (!ad) return null;

    const ownerName = ad?.user_id?.username || ad?.user_id?.full_name || 'vendor';
    const previewType = String(ad?.media?.[0]?.media_type || '').toLowerCase() === 'video' ? 'video' : 'image';
    const caption = typeof ad?.caption === 'string' ? ad.caption.trim() : '';
    return {
      contentType,
      contentId: ad._id,
      title: ad.ad_title || ad.caption || `Ad by ${ownerName}`,
      caption,
      previewUrl: toUploadsUrl(req, ad?.media?.[0]?.fileName),
      previewType,
      creatorId: ad?.user_id?._id || null,
      creatorUsername: ad?.user_id?.username || '',
      creatorAvatarUrl: ad?.user_id?.avatar_url || '',
      creatorVerified: false,
      shareUrl: `${appUrl}/ads/${ad._id}/details`,
    };
  }

  return null;
};

const getParticipantObjectId = (participant) => participant?._id || participant;

const syncDirectConversationRequestState = async (conversation) => {
  if (
    !conversation
    || conversation.isGroup
    || !conversation.isRequest
    || conversation.requestStatus !== 'pending'
  ) {
    return conversation;
  }

  const participantIds = normalizeUniqueIds(
    (conversation.participants || []).map((participant) => getParticipantObjectId(participant)).filter(Boolean)
  );

  if (participantIds.length !== 2) {
    return conversation;
  }

  const [participantA, participantB] = participantIds;
  const [aFollowsB, bFollowsA] = await Promise.all([
    Follow.exists({ follower_id: participantA, followed_id: participantB }),
    Follow.exists({ follower_id: participantB, followed_id: participantA }),
  ]);

  if (!aFollowsB || !bFollowsA) {
    return conversation;
  }

  conversation.isRequest = false;
  conversation.requestStatus = 'accepted';
  conversation.requestedBy = null;
  await conversation.save();
  return conversation;
};

const syncUserPendingConversationRequests = async (userId) => {
  const pendingConversations = await Conversation.find({
    participants: userId,
    isGroup: false,
    isRequest: true,
    requestStatus: 'pending',
  }).select('_id participants isGroup isRequest requestStatus requestedBy');

  if (!pendingConversations.length) {
    return;
  }

  await Promise.all(pendingConversations.map((conversation) => syncDirectConversationRequestState(conversation)));
};

const findConversationForUser = async (conversationId, userId) => {
  return Conversation.findOne({
    _id: conversationId,
    participants: userId,
  });
};

const findGroupConversationByParticipant = async (conversationId, userId) => {
  return Conversation.findOne({
    _id: conversationId,
    isGroup: true,
    participants: userId,
  });
};

const findGroupConversationForDelete = async (conversationId, userId) => {
  return Conversation.findOne({
    _id: conversationId,
    isGroup: true,
    leftUsers: userId,
  });
};

const populateConversation = (query) => query
  .populate('participants', USER_SELECT)
  .populate('groupAdmin', USER_SELECT)
  .populate('createdBy', USER_SELECT)
  .populate('requestedBy', USER_SELECT)
  .populate({
    path: 'lastMessage',
    match: { isDeleted: false },
    populate: { path: 'sender', select: USER_SELECT },
  });

const populateMessage = (query) => query
  .populate('sender', USER_SELECT)
  .populate('reactions.userId', USER_SELECT);

const getMessageIdParam = (req) => req.params.messageId || req.params.id;

const findMessageForUser = async (messageId, userId) => {
  if (!isValidObjectId(messageId)) {
    return { error: { status: 400, message: 'Invalid messageId' } };
  }

  const message = await Message.findById(messageId);
  if (!message) {
    return { error: { status: 404, message: 'Message not found' } };
  }

  const conversation = await findConversationForUser(message.conversationId, userId);
  if (!conversation) {
    return { error: { status: 403, message: 'Not authorized' } };
  }

  return { message, conversation };
};

exports.createConversation = async (req, res) => {
  try {
    const myId = req.userId;
    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({ message: 'participantId is required' });
    }

    if (!isValidObjectId(participantId)) {
      return res.status(400).json({ message: 'Invalid participantId' });
    }

    if (String(myId) === String(participantId)) {
      return res.status(400).json({ message: 'You cannot create a conversation with yourself' });
    }

    const participant = await User.findById(participantId).select('_id');
    if (!participant) {
      return res.status(404).json({ message: 'Participant not found' });
    }

    let conversation = await populateConversation(Conversation.findOne({
      participants: { $all: [myId, participantId], $size: 2 },
    }));

    if (conversation) {
      conversation = await syncDirectConversationRequestState(conversation);
      conversation = await populateConversation(Conversation.findById(conversation._id));
    }

    if (!conversation) {
      const [myFollow, participantFollow] = await Promise.all([
        Follow.exists({ follower_id: myId, followed_id: participantId }),
        Follow.exists({ follower_id: participantId, followed_id: myId }),
      ]);
      const isMutual = !!myFollow && !!participantFollow;
      const participants = normalizeParticipantIds(myId, participantId);

      conversation = await Conversation.create({
        participants,
        isRequest: !isMutual,
        requestStatus: isMutual ? 'accepted' : 'pending',
        requestedBy: isMutual ? null : myId,
      });
      conversation = await populateConversation(Conversation.findById(conversation._id));
    }

    res.json(conversation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getOnlineUsers = async (req, res) => {
  try {
    const onlineUsers = req.app.get('onlineUsers');
    const onlineUserIds = onlineUsers instanceof Map
      ? Array.from(onlineUsers.entries())
          .filter(([, socketIds]) => {
            if (socketIds instanceof Set) return socketIds.size > 0;
            return Boolean(socketIds);
          })
          .map(([userId]) => String(userId))
      : [];
    const ids = typeof req.query.ids === 'string'
      ? normalizeUniqueIds(req.query.ids.split(',').map((id) => id.trim()).filter(Boolean))
      : [];

    const filteredIds = ids.length
      ? ids.filter((id) => onlineUserIds.includes(String(id)))
      : onlineUserIds;

    res.json({ onlineUserIds: filteredIds });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getConversations = async (req, res) => {
  try {
    const userId = req.userId;
    await syncUserPendingConversationRequests(userId);
    const type = req.query.type === 'requests' ? 'requests' : 'normal';
    const query = type === 'requests'
      ? {
          participants: userId,
          deletedFor: { $ne: userId },
          isRequest: true,
          requestStatus: 'pending',
          requestedBy: { $ne: userId },
        }
      : {
          $and: [
            {
              $or: [
                { participants: userId },
                { leftUsers: userId },
              ],
            },
            { deletedFor: { $ne: userId } },
          ],
          $or: [
            { isRequest: false },
            { isRequest: true, requestStatus: 'accepted' },
            { isRequest: true, requestStatus: 'pending', requestedBy: userId },
          ],
        };

    const conversations = await populateConversation(
      Conversation.find(query).sort({ lastMessageAt: -1 })
    );

    const conversationIds = conversations.map((conversation) => conversation._id);
    let unreadMap = new Map();

    if (conversationIds.length > 0) {
      const unreadCounts = await Message.aggregate([
        {
          $match: {
            conversationId: { $in: conversationIds },
            isDeleted: false,
            deletedFor: { $ne: new mongoose.Types.ObjectId(String(userId)) },
            sender: { $ne: new mongoose.Types.ObjectId(String(userId)) },
            seenBy: { $ne: new mongoose.Types.ObjectId(String(userId)) },
          },
        },
        {
          $group: {
            _id: '$conversationId',
            count: { $sum: 1 },
          },
        },
      ]);

      unreadMap = new Map(unreadCounts.map((item) => [String(item._id), item.count]));
    }

    const result = conversations.map((conversation) => {
      const obj = conversation.toObject();
      const isActiveParticipant = (conversation.participants || []).some(
        (participantId) => String(getParticipantObjectId(participantId)) === String(userId)
      );
      obj.unreadCount = isActiveParticipant ? (unreadMap.get(String(conversation._id)) || 0) : 0;
      return obj;
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.createGroupConversation = async (req, res) => {
  try {
    const userId = req.userId;
    const participantIds = Array.isArray(req.body.participantIds) ? req.body.participantIds : [];
    const groupName = typeof req.body.groupName === 'string' ? req.body.groupName.trim() : '';
    const groupAvatar = typeof req.body.groupAvatar === 'string' ? req.body.groupAvatar.trim() : '';
    const uniqueParticipantIds = normalizeUniqueIds(
      participantIds.filter((participantId) => String(participantId) !== String(userId))
    );

    if (uniqueParticipantIds.length < 2) {
      return res.status(400).json({ message: 'participantIds must include at least 2 other users' });
    }

    if (uniqueParticipantIds.length > 199) {
      return res.status(400).json({ message: 'A group can have at most 200 participants' });
    }

    if (uniqueParticipantIds.some((participantId) => !isValidObjectId(participantId))) {
      return res.status(400).json({ message: 'Invalid participantIds' });
    }

    const users = await User.find({ _id: { $in: uniqueParticipantIds } }).select('_id');
    if (users.length !== uniqueParticipantIds.length) {
      return res.status(404).json({ message: 'One or more participants not found' });
    }

    const conversation = await Conversation.create({
      participants: [String(userId), ...uniqueParticipantIds],
      isGroup: true,
      groupName,
      groupAvatar,
      groupAdmin: userId,
      createdBy: userId,
      isRequest: false,
      requestStatus: 'accepted',
    });

    const systemMessage = await Message.create({
      conversationId: conversation._id,
      sender: userId,
      text: 'Created the group.',
      mediaUrl: '',
      mediaType: 'none',
      seenBy: [userId],
      seenAt: null,
    });

    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: systemMessage._id,
      lastMessageAt: systemMessage.createdAt,
    });

    const populatedConversation = await populateConversation(Conversation.findById(conversation._id));

    res.status(201).json(populatedConversation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateGroup = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    const groupName = typeof req.body.groupName === 'string' ? req.body.groupName.trim() : undefined;
    const groupAvatar = typeof req.body.groupAvatar === 'string' ? req.body.groupAvatar.trim() : undefined;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }

    const conversation = await findConversationForUser(conversationId, userId);
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ message: 'Group conversation not found' });
    }

    if (String(conversation.groupAdmin) !== String(userId)) {
      return res.status(403).json({ message: 'Only the group admin can update this group' });
    }

    if (typeof groupName !== 'undefined') {
      conversation.groupName = groupName;
    }

    if (typeof groupAvatar !== 'undefined') {
      conversation.groupAvatar = groupAvatar;
    }

    await conversation.save();

    const populatedConversation = await populateConversation(Conversation.findById(conversation._id));
    res.json(populatedConversation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.addGroupMember = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    const memberId = req.body.userId;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }

    if (!memberId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    if (!isValidObjectId(memberId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const conversation = await findGroupConversationByParticipant(conversationId, userId);
    if (!conversation) {
      return res.status(404).json({ message: 'Group conversation not found' });
    }

    if (String(conversation.groupAdmin) !== String(userId)) {
      return res.status(403).json({ message: 'Only the group admin can add members' });
    }

    if (conversation.participants.some((participantId) => String(participantId) === String(memberId))) {
      return res.status(400).json({ message: 'User is already a group member' });
    }

    if (conversation.participants.length >= 200) {
      return res.status(400).json({ message: 'A group can have at most 200 participants' });
    }

    const member = await User.findById(memberId).select('_id');
    if (!member) {
      return res.status(404).json({ message: 'User not found' });
    }

    conversation.leftUsers = (conversation.leftUsers || []).filter(
      (leftUserId) => String(leftUserId) !== String(memberId)
    );
    conversation.deletedFor = (conversation.deletedFor || []).filter(
      (deletedUserId) => String(deletedUserId) !== String(memberId)
    );
    conversation.participants.push(memberId);
    await conversation.save();

    const populatedConversation = await populateConversation(Conversation.findById(conversation._id));
    const io = req.app.get('io');

    if (io) {
      io.to(String(conversationId)).emit('group-member-added', {
        conversationId: String(conversationId),
        userId: String(memberId),
      });
    }

    res.json(populatedConversation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.removeGroupMember = async (req, res) => {
  try {
    const { conversationId, userId: memberId } = req.params;
    const currentUserId = req.userId;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }

    if (!isValidObjectId(memberId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const conversation = await findGroupConversationByParticipant(conversationId, currentUserId);
    if (!conversation) {
      return res.status(404).json({ message: 'Group conversation not found' });
    }

    const isAdmin = String(conversation.groupAdmin) === String(currentUserId);
    const isSelf = String(memberId) === String(currentUserId);

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ message: 'Not authorized to remove this member' });
    }

    if (!conversation.participants.some((participantId) => String(participantId) === String(memberId))) {
      return res.status(404).json({ message: 'User is not a group member' });
    }

    const updatedParticipants = conversation.participants.filter(
      (participantId) => String(participantId) !== String(memberId)
    );

    if (updatedParticipants.length < 2) {
      await Message.deleteMany({ conversationId: conversation._id });
      await conversation.deleteOne();

      const io = req.app.get('io');
      if (io) {
        io.to(String(conversationId)).emit('group-member-removed', {
          conversationId: String(conversationId),
          userId: String(memberId),
        });
      }

      return res.json({ success: true, conversationDeleted: true });
    }

    conversation.participants = updatedParticipants;
    conversation.leftUsers = normalizeUniqueIds([...(conversation.leftUsers || []), memberId]);

    if (String(conversation.groupAdmin) === String(memberId)) {
      conversation.groupAdmin = updatedParticipants[0];
    }

    await conversation.save();

    const populatedConversation = await populateConversation(Conversation.findById(conversation._id));
    const io = req.app.get('io');

    if (io) {
      io.to(String(conversationId)).emit('group-member-removed', {
        conversationId: String(conversationId),
        userId: String(memberId),
      });
    }

    res.json(populatedConversation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.leaveGroupConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }

    const conversation = await findGroupConversationByParticipant(conversationId, userId);
    if (!conversation) {
      return res.status(404).json({ message: 'Group conversation not found' });
    }

    const updatedParticipants = conversation.participants.filter(
      (participantId) => String(participantId) !== String(userId)
    );

    if (updatedParticipants.length < 2) {
      await Message.deleteMany({ conversationId: conversation._id });
      await conversation.deleteOne();
      return res.json({ success: true, conversationDeleted: true });
    }

    conversation.participants = updatedParticipants;
    conversation.leftUsers = normalizeUniqueIds([...(conversation.leftUsers || []), userId]);
    conversation.deletedFor = (conversation.deletedFor || []).filter(
      (deletedUserId) => String(deletedUserId) !== String(userId)
    );

    if (String(conversation.groupAdmin) === String(userId)) {
      conversation.groupAdmin = updatedParticipants[0];
    }

    await conversation.save();
    const populatedConversation = await populateConversation(Conversation.findById(conversation._id));
    return res.json(populatedConversation);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteGroupConversationForUser = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }

    const activeGroup = await findGroupConversationByParticipant(conversationId, userId);
    if (activeGroup) {
      return res.status(400).json({
        message: 'To stop receiving new messages from this chat, first leave the chat then delete it.',
      });
    }

    const conversation = await findGroupConversationForDelete(conversationId, userId);
    if (!conversation) {
      return res.status(404).json({ message: 'Group conversation not found or already deleted for this user' });
    }

    await Promise.all([
      Conversation.updateOne(
        { _id: conversation._id },
        { $addToSet: { deletedFor: userId } }
      ),
      Message.updateMany(
        { conversationId: conversation._id },
        { $addToSet: { deletedFor: userId } }
      ),
    ]);

    return res.json({
      success: true,
      message: 'This will remove the chat from your inbox and erase the chat history.',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.acceptMessageRequest = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }

    const conversation = await findConversationForUser(conversationId, userId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.isRequest || conversation.requestStatus !== 'pending') {
      return res.status(400).json({ message: 'Message request is not pending' });
    }

    if (String(conversation.requestedBy) === String(userId)) {
      return res.status(403).json({ message: 'Only the recipient can accept this message request' });
    }

    conversation.isRequest = false;
    conversation.requestStatus = 'accepted';
    await conversation.save();

    const populatedConversation = await populateConversation(Conversation.findById(conversation._id));
    res.json(populatedConversation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.declineMessageRequest = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }

    const conversation = await findConversationForUser(conversationId, userId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.isRequest || conversation.requestStatus !== 'pending') {
      return res.status(400).json({ message: 'Message request is not pending' });
    }

    if (String(conversation.requestedBy) === String(userId)) {
      return res.status(403).json({ message: 'Only the recipient can decline this message request' });
    }

    await Message.deleteMany({ conversationId: conversation._id });
    await conversation.deleteOne();

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      $or: [
        { participants: userId },
        { leftUsers: userId },
      ],
      deletedFor: { $ne: userId },
    });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const skip = (page - 1) * limit;
    const messages = await Message.find({
      conversationId,
      isDeleted: false,
      deletedFor: { $ne: userId },
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit + 1)
      .populate('sender', USER_SELECT)
      .populate('reactions.userId', USER_SELECT);

    const hasMore = messages.length > limit;
    const paginatedMessages = hasMore ? messages.slice(0, limit) : messages;

    res.json({
      messages: paginatedMessages,
      page,
      limit,
      hasMore,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.createMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    const mediaUrl = typeof req.body.mediaUrl === 'string' ? req.body.mediaUrl.trim() : '';
    const mediaType = req.body.mediaType || 'none';
    const rawReplyTo = req.body.replyTo;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }

    if (!['image', 'video', 'none'].includes(mediaType)) {
      return res.status(400).json({ message: 'Invalid mediaType' });
    }

    if (!text && !mediaUrl) {
      return res.status(400).json({ message: 'Message text or mediaUrl is required' });
    }

    if (mediaUrl && mediaType === 'none') {
      return res.status(400).json({ message: 'mediaType is required when mediaUrl is provided' });
    }

    if (!mediaUrl && mediaType !== 'none') {
      return res.status(400).json({ message: 'mediaUrl is required when mediaType is not none' });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      deletedFor: { $ne: userId },
    });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (conversation.isRequest && conversation.requestStatus === 'pending' && String(conversation.requestedBy) !== String(userId)) {
      return res.status(403).json({ message: 'You cannot reply until this message request is accepted' });
    }

    let replyTo = undefined;
    if (rawReplyTo && typeof rawReplyTo === 'object') {
      replyTo = {
        messageId: isValidObjectId(rawReplyTo.messageId) ? rawReplyTo.messageId : null,
        text: typeof rawReplyTo.text === 'string' ? rawReplyTo.text.trim() : '',
        senderId: isValidObjectId(rawReplyTo.senderId) ? rawReplyTo.senderId : null,
        senderName: typeof rawReplyTo.senderName === 'string' ? rawReplyTo.senderName.trim() : '',
      };
    }

    const message = await Message.create({
      conversationId,
      sender: userId,
      text,
      mediaUrl,
      mediaType: mediaUrl ? mediaType : 'none',
      replyTo,
      seenBy: [userId],
      seenAt: null,
    });

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      lastMessageAt: message.createdAt,
    });

    const populatedMessage = await populateMessage(Message.findById(message._id));
    const io = req.app.get('io');

    if (io) {
      io.to(String(conversationId)).emit('new-message', populatedMessage.toObject());
    }

    res.json(populatedMessage);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.shareContentToUsers = async (req, res) => {
  try {
    const userId = req.userId;
    const recipientIdsRaw = Array.isArray(req.body.recipientIds) ? req.body.recipientIds : [];
    const contentType = typeof req.body.contentType === 'string' ? req.body.contentType.trim().toLowerCase() : '';
    const contentId = typeof req.body.contentId === 'string' ? req.body.contentId.trim() : '';
    const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';

    if (!['post', 'reel', 'ad'].includes(contentType)) {
      return res.status(400).json({ message: 'contentType must be one of post, reel, ad' });
    }

    if (!isValidObjectId(contentId)) {
      return res.status(400).json({ message: 'Invalid contentId' });
    }

    const recipientIds = normalizeUniqueIds(
      recipientIdsRaw.filter((id) => String(id) !== String(userId))
    );

    if (!recipientIds.length) {
      return res.status(400).json({ message: 'recipientIds must include at least one user' });
    }

    if (recipientIds.some((id) => !isValidObjectId(id))) {
      return res.status(400).json({ message: 'Invalid recipientIds' });
    }

    const followed = await Follow.find({
      follower_id: userId,
      followed_id: { $in: recipientIds },
    }).select('followed_id').lean();
    const allowedRecipientIds = new Set(followed.map((item) => String(item.followed_id)));
    const blockedRecipients = recipientIds.filter((id) => !allowedRecipientIds.has(String(id)));
    if (blockedRecipients.length) {
      return res.status(403).json({
        message: 'You can only share to users you are following',
        blockedRecipientIds: blockedRecipients,
      });
    }

    const sharedContent = await resolveShareContent(req, contentType, contentId);
    if (!sharedContent) {
      return res.status(404).json({ message: 'Content not found' });
    }

    const io = req.app.get('io');
    const sentConversationIds = [];
    const failures = [];

    for (const recipientId of recipientIds) {
      let conversation = await Conversation.findOne({
        participants: { $all: [userId, recipientId], $size: 2 },
      });

      if (conversation) {
        conversation = await syncDirectConversationRequestState(conversation);
      }

      if (!conversation) {
        const recipientFollowsMe = await Follow.exists({
          follower_id: recipientId,
          followed_id: userId,
        });
        const participants = normalizeParticipantIds(userId, recipientId);
        conversation = await Conversation.create({
          participants,
          isRequest: !recipientFollowsMe,
          requestStatus: recipientFollowsMe ? 'accepted' : 'pending',
          requestedBy: recipientFollowsMe ? null : userId,
        });
      }

      if (
        conversation.isRequest
        && conversation.requestStatus === 'pending'
        && String(conversation.requestedBy) !== String(userId)
      ) {
        failures.push({
          recipientId: String(recipientId),
          reason: 'Conversation request pending for this recipient',
        });
        continue;
      }

      const text = note;
      const message = await Message.create({
        conversationId: conversation._id,
        sender: userId,
        text,
        mediaUrl: '',
        mediaType: 'none',
        sharedContent: {
          contentType: sharedContent.contentType,
          contentId: sharedContent.contentId,
          title: sharedContent.title,
          caption: sharedContent.caption,
          previewUrl: sharedContent.previewUrl,
          previewType: sharedContent.previewType,
          creatorId: sharedContent.creatorId,
          creatorUsername: sharedContent.creatorUsername,
          creatorAvatarUrl: sharedContent.creatorAvatarUrl,
          creatorVerified: sharedContent.creatorVerified,
          shareUrl: sharedContent.shareUrl,
        },
        seenBy: [userId],
        seenAt: null,
      });

      await Conversation.findByIdAndUpdate(conversation._id, {
        $set: {
          lastMessage: message._id,
          lastMessageAt: message.createdAt,
        },
        $pull: {
          deletedFor: { $in: [userId, recipientId] },
        },
      });

      const populatedMessage = await populateMessage(Message.findById(message._id));

      if (io) {
        io.to(String(conversation._id)).emit('new-message', populatedMessage.toObject());
      }

      sentConversationIds.push(String(conversation._id));
    }

    return res.json({
      success: true,
      contentType,
      contentId,
      sentCount: sentConversationIds.length,
      conversationIds: sentConversationIds,
      failures,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.markMessageSeen = async (req, res) => {
  try {
    const messageId = getMessageIdParam(req);
    const userId = req.userId;
    const { message, error } = await findMessageForUser(messageId, userId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const updatedMessage = await populateMessage(Message.findByIdAndUpdate(
      messageId,
      {
        $addToSet: { seenBy: userId },
        ...(String(message.sender) !== String(userId) ? { $set: { seenAt: new Date() } } : {}),
      },
      { new: true }
    ));

    const io = req.app.get('io');
    if (io) {
      io.to(String(message.conversationId)).emit('message-seen-update', {
        conversationId: String(message.conversationId),
        messageId: String(message._id),
        userId: String(userId),
        seenAt: updatedMessage?.seenAt || null,
      });
    }

    res.json(updatedMessage);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.addMessageReaction = async (req, res) => {
  try {
    const messageId = getMessageIdParam(req);
    const userId = req.userId;
    const emoji = normalizeEmoji(req.body.emoji);

    if (!emoji) {
      return res.status(400).json({ message: 'emoji is required' });
    }

    const { message, error } = await findMessageForUser(messageId, userId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    if (message.isDeleted) {
      return res.status(400).json({ message: 'Cannot react to a deleted message' });
    }

    const existingReaction = message.reactions.find((reaction) => String(reaction.userId) === String(userId));
    if (existingReaction) {
      existingReaction.emoji = emoji;
      existingReaction.createdAt = new Date();
    } else {
      message.reactions.push({ userId, emoji });
    }

    await message.save();

    const updatedMessage = await populateMessage(Message.findById(message._id));
    const payload = {
      conversationId: String(message.conversationId),
      messageId: String(message._id),
      action: existingReaction ? 'updated' : 'added',
      userId: String(userId),
      emoji,
      reactions: updatedMessage?.reactions || [],
    };

    const io = req.app.get('io');
    if (io) {
      io.to(String(message.conversationId)).emit('message-reaction-update', payload);
    }

    res.json(updatedMessage);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.removeMessageReaction = async (req, res) => {
  try {
    const messageId = getMessageIdParam(req);
    const userId = req.userId;
    const { message, error } = await findMessageForUser(messageId, userId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const existingReaction = message.reactions.find((reaction) => String(reaction.userId) === String(userId));
    if (!existingReaction) {
      const currentMessage = await populateMessage(Message.findById(message._id));
      return res.json(currentMessage);
    }

    const removedEmoji = existingReaction.emoji;
    message.reactions = message.reactions.filter((reaction) => String(reaction.userId) !== String(userId));
    await message.save();

    const updatedMessage = await populateMessage(Message.findById(message._id));
    const payload = {
      conversationId: String(message.conversationId),
      messageId: String(message._id),
      action: 'removed',
      userId: String(userId),
      emoji: removedEmoji,
      reactions: updatedMessage?.reactions || [],
    };

    const io = req.app.get('io');
    if (io) {
      io.to(String(message.conversationId)).emit('message-reaction-update', payload);
    }

    res.json(updatedMessage);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const messageId = getMessageIdParam(req);
    const userId = req.userId;
    const { message, conversation, error } = await findMessageForUser(messageId, userId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    if (String(message.sender) !== String(userId)) {
      return res.status(403).json({ message: 'You can only delete your own messages' });
    }

    if (message.isDeleted) {
      return res.json({ success: true, messageId: message._id });
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    if (conversation.lastMessage && String(conversation.lastMessage) === String(message._id)) {
      const previousMessage = await Message.findOne({
        conversationId: message.conversationId,
        isDeleted: false,
        _id: { $ne: message._id },
      }).sort({ createdAt: -1 });

      await Conversation.findByIdAndUpdate(message.conversationId, {
        lastMessage: previousMessage ? previousMessage._id : null,
        lastMessageAt: previousMessage ? previousMessage.createdAt : conversation.createdAt,
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(String(message.conversationId)).emit('message-removed', {
        conversationId: String(message.conversationId),
        messageId: String(message._id),
      });
    }

    res.json({ success: true, messageId: message._id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.uploadChatMedia = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }

    const conversation = await findConversationForUser(conversationId, userId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const uploadedFiles = Array.isArray(req.files)
      ? req.files
      : (req.file ? [req.file] : []);

    if (!uploadedFiles.length) {
      return res.status(400).json({ message: 'Please upload at least one file' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const media = uploadedFiles.map((file) => {
      let mediaType = 'none';

      if (file.mimetype && file.mimetype.startsWith('image/')) {
        mediaType = 'image';
      } else if (file.mimetype && file.mimetype.startsWith('video/')) {
        mediaType = 'video';
      }

      if (mediaType === 'none') {
        throw new Error('Unsupported media type');
      }

      return {
        mediaUrl: `${baseUrl}/uploads/${file.filename}`,
        mediaType,
        originalName: file.originalname,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
      };
    });

    const [firstMedia] = media;

    res.json({
      media,
      mediaUrl: firstMedia.mediaUrl,
      mediaType: firstMedia.mediaType,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.uploadVoiceMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;

    if (!isValidObjectId(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversationId' });
    }

    const conversation = await findConversationForUser(conversationId, userId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found or not authorized' });
    }

    if (conversation.isRequest && conversation.requestStatus === 'pending' && String(conversation.requestedBy) !== String(userId)) {
      return res.status(403).json({ message: 'You cannot reply until this message request is accepted' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No audio file uploaded' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const audioUrl = `${baseUrl}/uploads/${req.file.filename}`;
    const audioDuration = req.body.duration ? parseFloat(req.body.duration) : null;

    const message = await Message.create({
      conversationId,
      sender: userId,
      text: '',
      mediaUrl: audioUrl,
      mediaType: 'audio',
      audioDuration,
      seenBy: [userId],
      seenAt: null,
    });

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      lastMessageAt: message.createdAt,
    });

    const populatedMessage = await populateMessage(Message.findById(message._id));

    const io = req.app.get('io');
    if (io) {
      io.to(String(conversationId)).emit('new-message', populatedMessage.toObject());
    }

    res.json(populatedMessage);
  } catch (error) {
    console.error('[uploadVoiceMessage]', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
