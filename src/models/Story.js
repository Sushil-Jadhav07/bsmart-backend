const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  items_count: { type: Number, default: 0 },
  views_count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: true },
  isArchived: { type: Boolean, default: false },
  archivedAt: { type: Date }
}, { timestamps: true });

storySchema.index({ user_id: 1, expiresAt: 1 });
storySchema.index({ expiresAt: 1, isArchived: 1 });

module.exports = mongoose.model('Story', storySchema);
