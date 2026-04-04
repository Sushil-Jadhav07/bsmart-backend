const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

const USER_SELECT = 'username full_name avatar_url';

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const normalizeParticipantIds = (userIdA, userIdB) => {
  return [String(userIdA), String(userIdB)].sort();
};

const findConversationForUser = async (conversationId, userId) => {
  return Conversation.findOne({
    _id: conversationId,
    participants: userId,
  });
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

    let conversation = await Conversation.findOne({
      participants: { $all: [myId, participantId], $size: 2 },
    })
      .populate('participants', USER_SELECT)
      .populate({
        path: 'lastMessage',
        match: { isDeleted: false },
        populate: { path: 'sender', select: USER_SELECT },
      });

    if (!conversation) {
      const participants = normalizeParticipantIds(myId, participantId);
      conversation = await Conversation.create({ participants });
      conversation = await Conversation.findById(conversation._id)
        .populate('participants', USER_SELECT)
        .populate({
          path: 'lastMessage',
          match: { isDeleted: false },
          populate: { path: 'sender', select: USER_SELECT },
        });
    }

    res.json(conversation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getConversations = async (req, res) => {
  try {
    const userId = req.userId;

    const conversations = await Conversation.find({ participants: userId })
      .sort({ lastMessageAt: -1 })
      .populate('participants', USER_SELECT)
      .populate({
        path: 'lastMessage',
        match: { isDeleted: false },
        populate: { path: 'sender', select: USER_SELECT },
      });

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
      .populate('sender', USER_SELECT);

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

    const populatedMessage = await Message.findById(message._id).populate('sender', USER_SELECT);
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
    const { messageId } = req.params;
    const userId = req.userId;

    if (!isValidObjectId(messageId)) {
      return res.status(400).json({ message: 'Invalid messageId' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const conversation = await findConversationForUser(message.conversationId, userId);
    if (!conversation) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      {
        $addToSet: { seenBy: userId },
        ...(String(message.sender) !== String(userId) ? { $set: { seenAt: new Date() } } : {}),
      },
      { new: true }
    ).populate('sender', USER_SELECT);

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

exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.userId;

    if (!isValidObjectId(messageId)) {
      return res.status(400).json({ message: 'Invalid messageId' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const conversation = await findConversationForUser(message.conversationId, userId);
    if (!conversation) {
      return res.status(403).json({ message: 'Not authorized' });
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

    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a file' });
    }

    let mediaType = 'none';
    if (req.file.mimetype && req.file.mimetype.startsWith('image/')) {
      mediaType = 'image';
    } else if (req.file.mimetype && req.file.mimetype.startsWith('video/')) {
      mediaType = 'video';
    }

    if (mediaType === 'none') {
      return res.status(400).json({ message: 'Unsupported media type' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const mediaUrl = `${baseUrl}/uploads/${req.file.filename}`;

    res.json({ mediaUrl, mediaType });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
