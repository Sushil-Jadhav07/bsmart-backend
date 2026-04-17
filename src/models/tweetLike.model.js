const mongoose = require('mongoose');

const tweetLikeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  tweet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tweet',
    required: true,
  },
}, {
  timestamps: true,
});

tweetLikeSchema.index({ user: 1, tweet: 1 }, { unique: true });

module.exports = mongoose.model('TweetLike', tweetLikeSchema);

