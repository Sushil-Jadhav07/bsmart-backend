const mongoose = require('mongoose');

const searchHistorySchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  query: {
    type: String,
    required: true,
    trim: true,
  },
  normalized_query: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  searches_count: {
    type: Number,
    default: 1,
  },
  searched_at: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, { timestamps: true });

searchHistorySchema.index({ user_id: 1, normalized_query: 1 }, { unique: true });
searchHistorySchema.index({ user_id: 1, searched_at: -1 });

module.exports = mongoose.model('SearchHistory', searchHistorySchema);
