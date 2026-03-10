const mongoose = require('mongoose');

const savedAdSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ad_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', required: true }
}, { timestamps: true });

savedAdSchema.index({ user_id: 1, ad_id: 1 }, { unique: true });

module.exports = mongoose.model('SavedAd', savedAdSchema);
