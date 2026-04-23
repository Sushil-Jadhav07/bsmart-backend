const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  emoji: {
    type: String,
    required: true,
    trim: true,
    maxlength: 32,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  _id: false,
});

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  text: {
    type: String,
    default: '',
    trim: true,
  },
  mediaUrl: {
    type: String,
    default: '',
  },
  mediaType: {
    type: String,
    enum: ['image', 'video', 'audio', 'none'],
    default: 'none',
  },
  audioDuration: {
    type: Number,
    default: null,
  },
  replyTo: {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    text: {
      type: String,
      default: '',
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    senderName: {
      type: String,
      default: '',
    },
  },
  sharedContent: {
    contentType: {
      type: String,
      enum: ['post', 'reel', 'ad'],
      default: null,
    },
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    caption: {
      type: String,
      default: '',
      trim: true,
    },
    previewUrl: {
      type: String,
      default: '',
    },
    previewType: {
      type: String,
      enum: ['image', 'video', 'none'],
      default: 'none',
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    creatorUsername: {
      type: String,
      default: '',
      trim: true,
    },
    creatorAvatarUrl: {
      type: String,
      default: '',
    },
    creatorVerified: {
      type: Boolean,
      default: false,
    },
    shareUrl: {
      type: String,
      default: '',
    },
  },
  seenBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  seenAt: {
    type: Date,
    default: null,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  reactions: {
    type: [reactionSchema],
    default: [],
  },
  deletedFor: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    default: [],
  },
}, {
  timestamps: true,
});

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, isDeleted: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, sender: 1 });

module.exports = mongoose.model('Message', messageSchema);
