const mongoose = require('mongoose');

const adSchema = new mongoose.Schema({
  vendor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  video_fileName: {
    type: String,
    required: true
  },
  video_url: {
    type: String,
    required: true
  },
  thumbnail_fileName: {
    type: String,
    default: ''
  },
  thumbnail_url: {
    type: String,
    default: ''
  },
  duration_seconds: {
    type: Number,
    required: true
  },
  coins_reward: {
    type: Number,
    required: true,
    min: 1
  },
  category: {
    type: String,
    required: true
  },
  tags: {
    type: [String],
    default: []
  },
  target_language: {
    type: String,
    default: 'en'
  },
  target_location: {
    type: String,
    default: ''
  },
  target_preferences: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'paused', 'rejected'],
    default: 'pending'
  },
  rejection_reason: {
    type: String,
    default: ''
  },
  views_count: {
    type: Number,
    default: 0
  },
  unique_views_count: {
    type: Number,
    default: 0
  },
  completed_views_count: {
    type: Number,
    default: 0
  },
  likes_count: {
    type: Number,
    default: 0
  },
  comments_count: {
    type: Number,
    default: 0
  },
  likes: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    default: []
  },
  daily_limit: {
    type: Number,
    default: 0
  },
  total_budget_coins: {
    type: Number,
    default: 0
  },
  total_coins_spent: {
    type: Number,
    default: 0
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Ad', adSchema);
