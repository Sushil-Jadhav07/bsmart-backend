const mongoose = require('mongoose');

const threadMediaSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['image'],
    required: true,
  },
}, { _id: false });

const threadSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  content: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
  media: {
    type: [threadMediaSchema],
    default: [],
  },
  parentThread: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Thread',
    default: null,
  },
  rootThread: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Thread',
    default: null,
  },
  repostOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Thread',
    default: null,
  },
  quoteContent: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  likesCount: {
    type: Number,
    default: 0,
  },
  repliesCount: {
    type: Number,
    default: 0,
  },
  commentsCount: {
    type: Number,
    default: 0,
  },
  repostsCount: {
    type: Number,
    default: 0,
  },
  quotesCount: {
    type: Number,
    default: 0,
  },
  viewsCount: {
    type: Number,
    default: 0,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  audience: {
    type: String,
    enum: ['everyone', 'followers'],
    default: 'everyone',
  },
}, {
  timestamps: true,
});

threadSchema.index({ author: 1, createdAt: -1 });
threadSchema.index({ parentThread: 1 });
threadSchema.index({ rootThread: 1 });
threadSchema.index({ repostOf: 1 });

module.exports = mongoose.model('Thread', threadSchema);
