const mongoose = require('mongoose');

const storyViewSchema = new mongoose.Schema({
  story_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Story', index: true },
  story_item_id: { type: mongoose.Schema.Types.ObjectId, ref: 'StoryItem', index: true },
  owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  viewer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  viewedAt: { type: Date, default: Date.now }
}, { timestamps: false });

storyViewSchema.index({ story_item_id: 1, viewer_id: 1 }, { unique: true });
storyViewSchema.index({ owner_id: 1, viewedAt: -1 });

module.exports = mongoose.model('StoryView', storyViewSchema);
