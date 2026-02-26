const mongoose = require('mongoose');

const adMediaSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  fileUrl: { type: String, default: '' },
  media_type: { type: String, enum: ['image', 'video'], default: 'image' },
  video_meta: {
    original_length_seconds: { type: Number },
    selected_start: { type: Number },
    selected_end: { type: Number },
    final_duration: { type: Number },
    thumbnail_time: { type: Number }
  },
  image_editing: {
    filter: {
      name: { type: String, default: 'Original' },
      css: { type: String, default: '' }
    },
    adjustments: {
      brightness: { type: Number, default: 0 },
      contrast: { type: Number, default: 0 },
      saturation: { type: Number, default: 0 },
      temperature: { type: Number, default: 0 },
      fade: { type: Number, default: 0 },
      vignette: { type: Number, default: 0 }
    }
  },
  crop_settings: {
    mode: { type: String, enum: ['original', '1:1', '4:5', '16:9', '9:16'], default: 'original' },
    aspect_ratio: { type: String },
    zoom: { type: Number, default: 1 },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 }
  },
  timing_window: {
    start: { type: Number },
    end: { type: Number }
  },
  thumbnails: [{
    fileName: { type: String },
    media_type: { type: String, default: 'image' },
    fileUrl: { type: String, default: '' }
  }]
}, { _id: false });

const adSchema = new mongoose.Schema({
  vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  caption: { type: String, default: '' },
  location: { type: String, default: '' },
  media: {
    type: [adMediaSchema],
    validate: [v => v && v.length > 0, 'At least one media item is required']
  },
  hashtags: { type: [String], default: [] },
  tagged_users: [{
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String },
    position_x: { type: Number },
    position_y: { type: Number }
  }],
  engagement_controls: {
    hide_likes_count: { type: Boolean, default: false },
    disable_comments: { type: Boolean, default: false }
  },
  content_type: { type: String, enum: ['post', 'reel'], default: 'reel' },
  category: { type: String, required: true },
  tags: { type: [String], default: [] },
  target_language: { type: String, default: 'en' },
  target_location: { type: String, default: '' },
  target_preferences: { type: [String], default: [] },
  coins_reward: { type: Number, required: true, min: 1 },
  total_budget_coins: { type: Number, default: 0 },
  total_coins_spent: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'active', 'paused', 'rejected'], default: 'pending' },
  rejection_reason: { type: String, default: '' },
  views_count: { type: Number, default: 0 },
  unique_views_count: { type: Number, default: 0 },
  completed_views_count: { type: Number, default: 0 },
  likes_count: { type: Number, default: 0 },
  comments_count: { type: Number, default: 0 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isDeleted: { type: Boolean, default: false },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Ad', adSchema);
