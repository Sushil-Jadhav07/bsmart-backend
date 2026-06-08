const mongoose = require('mongoose');

const savedPromoteReelSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  promote_reel_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PromoteReel', required: true }
}, { timestamps: true });

savedPromoteReelSchema.index({ user_id: 1, promote_reel_id: 1 }, { unique: true });

module.exports = mongoose.model('SavedPromoteReel', savedPromoteReelSchema);
