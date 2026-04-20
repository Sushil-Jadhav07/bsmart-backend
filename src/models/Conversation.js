const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    }],
    validate: {
      validator(value) {
        if (!Array.isArray(value) || value.length < 2 || value.length > 200) return false;
        const uniqueIds = new Set(value.map((item) => String(item)));
        return uniqueIds.size === value.length;
      },
      message: 'Conversation must contain 2 to 200 unique participants',
    },
  },
  isGroup: {
    type: Boolean,
    default: false,
  },
  groupName: {
    type: String,
    default: '',
  },
  groupAvatar: {
    type: String,
    default: '',
  },
  groupAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  isRequest: {
    type: Boolean,
    default: false,
  },
  requestStatus: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'accepted',
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
