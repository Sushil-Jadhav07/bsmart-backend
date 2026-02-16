const mongoose = require('mongoose');

const savedPostSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  post_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true }
}, { timestamps: true });

savedPostSchema.index({ user_id: 1, post_id: 1 }, { unique: true });

module.exports = mongoose.model('SavedPost', savedPostSchema);
