const mongoose = require('mongoose');

const adViewSchema = new mongoose.Schema({
  ad_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ad',
    required: true,
    index: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  view_count: {
    type: Number,
    default: 1
  },
  completed: {
    type: Boolean,
    default: false
  },
  completed_at: {
    type: Date
  },
  rewarded: {
    type: Boolean,
    default: false
  },
  rewarded_at: {
    type: Date
  },
  coins_rewarded: {
    type: Number,
    default: 0
  },
  watch_time_ms: {
    type: Number,
    default: 0
  },
  fraud_flagged: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

adViewSchema.index({ ad_id: 1, user_id: 1 }, { unique: true });

module.exports = mongoose.model('AdView', adViewSchema);
