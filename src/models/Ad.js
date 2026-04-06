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

// ── CTA sub-schema ─────────────────────────────────────────────────────────────
const ctaSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['view_site', 'contact_info', 'install_app', 'book_now', 'learn_more', 'call_now'],
    default: 'view_site'
  },
  url: { type: String, default: '' },
  deep_link: { type: String, default: '' },
  phone_number: { type: String, default: '' },
  email: { type: String, default: '' },
  whatsapp_number: { type: String, default: '' }
}, { _id: false });

// ── Budget sub-schema ──────────────────────────────────────────────────────────
const budgetSchema = new mongoose.Schema({
  daily_budget_coins: { type: Number, default: 0, min: 0 },
  start_date: { type: Date },
  end_date: { type: Date },
  // auto_stop_on_budget_exhausted: reserved for future use — not active yet
  auto_stop_on_budget_exhausted: { type: Boolean, default: false }
}, { _id: false });

// ── Targeting sub-schema ───────────────────────────────────────────────────────
const targetingSchema = new mongoose.Schema({
  countries: { type: [String], default: [] },
  states: { type: [String], default: [] },
  cities: { type: [String], default: [] },
  age_min: { type: Number, default: 13, min: 13 },
  age_max: { type: Number, default: 65, max: 100 },
  gender: { type: String, enum: ['all', 'male', 'female', 'other'], default: 'all' },
  interests: { type: [String], default: [] },
  device_types: {
    type: [String],
    enum: ['mobile', 'ios', 'android', 'desktop'],
    default: ['mobile', 'desktop']
  }
}, { _id: false });

// ── UTM / Tracking sub-schema ──────────────────────────────────────────────────
const trackingSchema = new mongoose.Schema({
  utm_source: { type: String, default: '' },
  utm_medium: { type: String, default: '' },
  utm_campaign: { type: String, default: '' },
  utm_term: { type: String, default: '' },
  utm_content: { type: String, default: '' },
  conversion_pixel_id: { type: String, default: '' }
}, { _id: false });

// ── A/B Testing sub-schema ─────────────────────────────────────────────────────
const abVariantSchema = new mongoose.Schema({
  variant_id: { type: String },
  ad_title: { type: String },
  ad_description: { type: String },
  media_fileName: { type: String }
}, { _id: false });

const abTestingSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  variants: { type: [abVariantSchema], default: [] }
}, { _id: false });

// ── Scheduling sub-schema ──────────────────────────────────────────────────────
const timeSlotSchema = new mongoose.Schema({
  day_of_week: {
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  },
  start_time: { type: String }, // "HH:MM" 24h format
  end_time: { type: String }
}, { _id: false });

const schedulingSchema = new mongoose.Schema({
  delivery_time_slots: { type: [timeSlotSchema], default: [] }
}, { _id: false });

// ── Main Ad schema ─────────────────────────────────────────────────────────────
const adSchema = new mongoose.Schema({
  vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // ── Core ad content ──────────────────────────────────────────────────────────
  ad_title: { type: String, default: '' },
  ad_description: { type: String, default: '' },
  caption: { type: String, default: '' },       // kept for backward compat
  location: { type: String, default: '' },
  ad_type: {
    type: String,
    enum: ['banner', 'video', 'carousel', 'sponsored_post'],
    default: 'sponsored_post'
  },
  media: {
    type: [adMediaSchema],
    validate: [v => v && v.length > 0, 'At least one media item is required']
  },

  // ── CTA ───────────────────────────────────────────────────────────────────────
  cta: { type: ctaSchema, default: () => ({}) },

  // ── Budget & bidding ─────────────────────────────────────────────────────────
  total_budget_coins: { type: Number, default: 0 },   // kept at root for backward compat
  total_coins_spent: { type: Number, default: 0 },
  budget: { type: budgetSchema, default: () => ({}) },

  // ── Targeting ────────────────────────────────────────────────────────────────
  targeting: { type: targetingSchema, default: () => ({}) },
  // Legacy flat targeting fields — kept for backward compat
  target_language: { type: [String], default: [] },
  target_location: { type: [String], default: [] },
  target_states: { type: [String], default: [] },
  target_preferences: { type: [String], default: [] },

  // ── Categorization & tags ─────────────────────────────────────────────────────
  category: { type: String, required: true },
  sub_category: { type: String, default: '' },
  tags: { type: [String], default: [] },
  keywords: { type: [String], default: [] },
  hashtags: { type: [String], default: [] },

  // ── Tagged users ──────────────────────────────────────────────────────────────
  tagged_users: [{
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String },
    position_x: { type: Number },
    position_y: { type: Number }
  }],

  // ── Engagement controls ───────────────────────────────────────────────────────
  engagement_controls: {
    hide_likes_count: { type: Boolean, default: false },
    disable_comments: { type: Boolean, default: false },
    disable_share: { type: Boolean, default: false },
    disable_save: { type: Boolean, default: false },
    disable_report: { type: Boolean, default: false },
    moderation_enabled: { type: Boolean, default: false }
  },

  // ── Product (existing) ────────────────────────────────────────────────────────
  product: {
    product_id: { type: String },
    title: { type: String },
    description: { type: String },
    price: { type: Number },
    link: { type: String }
  },

  // ── Tracking & analytics ──────────────────────────────────────────────────────
  tracking: { type: trackingSchema, default: () => ({}) },

  // ── Compliance & review ───────────────────────────────────────────────────────
  compliance: {
    policy_agreed: { type: Boolean, default: false },
    // approval_status mirrors ad.status — kept here for explicit tracking
    approval_status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    }
  },

  // ── Smart enhancements ────────────────────────────────────────────────────────
  ab_testing: { type: abTestingSchema, default: () => ({}) },
  scheduling: { type: schedulingSchema, default: () => ({}) },

  // ── Status & moderation ───────────────────────────────────────────────────────
  content_type: { type: String, enum: ['post', 'reel'], default: 'reel' },
  status: {
    type: String,
    enum: ['draft', 'pending', 'active', 'paused', 'rejected'],
    default: 'pending'
  },
  rejection_reason: { type: String, default: '' },
  coins_reward: { type: Number, default: 0, min: 0 },

  // ── Counters ──────────────────────────────────────────────────────────────────
  views_count: { type: Number, default: 0 },
  unique_views_count: { type: Number, default: 0 },
  completed_views_count: { type: Number, default: 0 },
  likes_count: { type: Number, default: 0 },
  comments_count: { type: Number, default: 0 },
  clicks_count: { type: Number, default: 0 },

  // ── Likes / dislikes arrays ───────────────────────────────────────────────────
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  dislikes_count: { type: Number, default: 0 },

  // ── Soft delete ───────────────────────────────────────────────────────────────
  isDeleted: { type: Boolean, default: false },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date }
}, { timestamps: true });

// Text index for fast keyword search on caption, hashtags, tags, location, ad_title
adSchema.index({
  caption: 'text',
  ad_title: 'text',
  ad_description: 'text',
  hashtags: 'text',
  tags: 'text',
  keywords: 'text',
  location: 'text'
});

module.exports = mongoose.model('Ad', adSchema);