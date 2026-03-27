const mongoose = require('mongoose');

const storyLikeSchema = new mongoose.Schema({
  story_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Story', required: true, index: true },
  story_item_id: { type: mongoose.Schema.Types.ObjectId, ref: 'StoryItem', required: true, index: true },
  owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  likedAt: { type: Date, default: Date.now },
}, { timestamps: true });

storyLikeSchema.index({ story_item_id: 1, user_id: 1 }, { unique: true });

module.exports = mongoose.model('StoryLike', storyLikeSchema);
