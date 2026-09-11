const mongoose = require('mongoose');

// Admin overrides for the feed ranking config (src/feed/config.js). A single
// document with key 'default'; only keys that exist in the defaults are kept.

const feedSettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'default' },
  overrides: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });

module.exports = mongoose.model('FeedSettings', feedSettingsSchema);
