const mongoose = require('mongoose');

const followSchema = new mongoose.Schema({
  follower_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  followed_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

followSchema.index({ follower_id: 1, followed_id: 1 }, { unique: true });
followSchema.index({ followed_id: 1 });

module.exports = mongoose.model('Follow', followSchema);
