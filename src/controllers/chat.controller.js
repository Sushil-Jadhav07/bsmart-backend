const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const Follow = require('../models/Follow');

const USER_SELECT = 'username full_name avatar_url';

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const normalizeEmoji = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeParticipantIds = (userIdA, userIdB) => {
  return [String(userIdA), String(userIdB)].sort();
};

const normalizeUniqueIds = (ids = []) => {
  return [...new Set(ids.map((id) => String(id)))];
};

const findConversationForUser = async (conversationId, userId) => {
  return Conversation.findOne({
    _id: conversationId,
    participants: userId,
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
    const onlineUserIds = onlineUsers instanceof Map ? Array.from(onlineUsers.keys()) : [];
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
    const type = req.query.type === 'requests' ? 'requests' : 'normal';
    const query = type === 'requests'
      ? {
          participants: userId,
          isRequest: true,
          requestStatus: 'pending',
          requestedBy: { $ne: userId },
        }
      : {
          participants: userId,
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
      obj.unreadCount = unreadMap.get(String(conversation._id)) || 0;
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

    if (!groupName) {
      return res.status(400).json({ message: 'groupName is required' });
    }

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

    const conversation = await findConversationForUser(conversationId, userId);
    if (!conversation || !conversation.isGroup) {
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

    const conversation = await findConversationForUser(conversationId, currentUserId);
    if (!conversation || !conversation.isGroup) {
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

    const conversation = await findConversationForUser(conversationId, userId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const skip = (page - 1) * limit;
    const messages = await Message.find({
      conversationId,
      isDeleted: false,
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

    const conversation = await findConversationForUser(conversationId, userId);
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
