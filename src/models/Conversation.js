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
        if (!Array.isArray(value) || value.length !== 2) return false;
        const uniqueIds = new Set(value.map((item) => String(item)));
        return uniqueIds.size === 2;
      },
      message: 'Conversation must contain exactly 2 unique participants',
    },
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
