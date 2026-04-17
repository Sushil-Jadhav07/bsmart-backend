const mongoose = require('mongoose');

const tweetMediaSchema = new mongoose.Schema({
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

const tweetSchema = new mongoose.Schema({
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
    type: [tweetMediaSchema],
    default: [],
  },
  parentTweet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tweet',
    default: null,
  },
  rootTweet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tweet',
    default: null,
  },
  repostOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tweet',
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

tweetSchema.index({ author: 1, createdAt: -1 });
tweetSchema.index({ parentTweet: 1 });
tweetSchema.index({ rootTweet: 1 });
tweetSchema.index({ repostOf: 1 });

module.exports = mongoose.model('Tweet', tweetSchema);

