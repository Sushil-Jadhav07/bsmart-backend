const mongoose = require('mongoose');

const highlightItemSchema = new mongoose.Schema({
  highlight_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Highlight', required: true, index: true },
  story_item_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'StoryItem', required: true },
  user_id:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  order:          { type: Number, default: 0 },
  addedAt:        { type: Date, default: Date.now },
}, { timestamps: true });

highlightItemSchema.index({ highlight_id: 1, order: 1 });
// prevent adding the same story item to the same highlight twice
highlightItemSchema.index({ highlight_id: 1, story_item_id: 1 }, { unique: true });

module.exports = mongoose.model('HighlightItem', highlightItemSchema);