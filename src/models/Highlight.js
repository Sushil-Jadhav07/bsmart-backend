const mongoose = require('mongoose');

const highlightSchema = new mongoose.Schema({
  user_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title:        { type: String, required: true, maxlength: 30 },
  cover_url:    { type: String, default: '' },   // thumbnail shown in the circle
  items_count:  { type: Number, default: 0 },
  order:        { type: Number, default: 0 },    // so user can reorder highlights
}, { timestamps: true });

highlightSchema.index({ user_id: 1, order: 1 });
module.exports = mongoose.model('Highlight', highlightSchema);