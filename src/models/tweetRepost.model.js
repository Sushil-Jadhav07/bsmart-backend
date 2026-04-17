const mongoose = require('mongoose');

const tweetRepostSchema = new mongoose.Schema({
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

tweetRepostSchema.index({ user: 1, tweet: 1 }, { unique: true });

module.exports = mongoose.model('TweetRepost', tweetRepostSchema);

