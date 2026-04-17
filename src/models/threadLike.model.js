const mongoose = require('mongoose');

const threadLikeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  thread: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Thread',
    required: true,
  },
}, {
  timestamps: true,
});

threadLikeSchema.index({ user: 1, thread: 1 }, { unique: true });

module.exports = mongoose.model('ThreadLike', threadLikeSchema);
