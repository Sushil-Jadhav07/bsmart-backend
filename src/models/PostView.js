const mongoose = require('mongoose');

const postViewSchema = new mongoose.Schema({
  post_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true,
    index: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['reel'],
    required: true
  },
  view_count: {
    type: Number,
    default: 1
  },
  completed: {
    type: Boolean,
    default: false
  },
  completed_at: {
    type: Date
  },
  rewarded: {
    type: Boolean,
    default: false
  },
  rewarded_at: {
    type: Date
  },
  watchTimeMs: {
    type: Number
  }
}, {
  timestamps: true
});

postViewSchema.index({ post_id: 1, user_id: 1 }, { unique: true });

module.exports = mongoose.model('PostView', postViewSchema);
