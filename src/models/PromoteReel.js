const mongoose = require('mongoose');

// ─── Media Sub-Schema (mirrors the reel media schema) ──────────────────────
const mediaSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  type: { type: String, enum: ['image', 'video'], default: 'video' },
  crop: {
    mode: { type: String, enum: ['original', '1:1', '4:5', '16:9'], default: 'original' },
    aspect_ratio: { type: String },
    zoom: { type: Number, default: 1 },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 }
  },
  filter: { name: { type: String, default: 'Original' }, css: { type: String, default: '' } },
  adjustments: {
    brightness: { type: Number, default: 0 }, contrast: { type: Number, default: 0 },
    saturation: { type: Number, default: 0 }, temperature: { type: Number, default: 0 },
    fade: { type: Number, default: 0 }, vignette: { type: Number, default: 0 }
  },
  videoLength: { type: Number }, finalLength: { type: Number }, finallength: { type: Number },
  totalLength: { type: Number }, totalLenght: { type: Number },
  timing: { start: { type: Number }, end: { type: Number } },
  'thumbail-time': { type: Number }, 'finalLength-start': { type: Number }, 'finallength-end': { type: Number },
  thumbnail: { fileName: { type: String }, type: { type: String, default: 'image' } },
  thumbnails: [{ fileName: { type: String }, type: { type: String, default: 'image' } }]
}, { _id: false });

// ─── Product Sub-Schema ─────────────────────────────────────────────────────
const productSchema = new mongoose.Schema({
  product_name:        { type: String, required: true, trim: true },
  product_description: { type: String, default: '', trim: true },
  product_price:       { type: Number, required: true, min: 0 },
  visit_link:          { type: String, default: '', trim: true },
  discount_amount:     { type: Number, default: 0, min: 0 },
  // Product image — full URL returned by POST /api/upload/promote-product
  promote_img:         { type: String, default: '', trim: true }
}, { _id: true });

// ─── Promote Reel Schema ────────────────────────────────────────────────────
const promoteReelSchema = new mongoose.Schema({
  user_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  caption:    { type: String, default: '' },
  location:   { type: String, default: '' },
  media:      { type: [mediaSchema], default: [], validate: [v => v && v.length > 0, '{PATH} must have at least 1 media item'] },
  tags:       { type: Array, default: [] },
  people_tags: { type: [{ user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, username: String, x: Number, y: Number }], default: [] },
  products:   { type: [productSchema], default: [] },
  hide_likes_count:    { type: Boolean, default: false },
  turn_off_commenting: { type: Boolean, default: false },
  likes_count:           { type: Number, default: 0 },
  comments_count:        { type: Number, default: 0 },
  views_count:           { type: Number, default: 0 },
  unique_views_count:    { type: Number, default: 0 },
  completed_views_count: { type: Number, default: 0 },
  latest_comments: { type: Array, default: [] },
  likes:      { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
  isDeleted:  { type: Boolean, default: false },
  deletedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt:  { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('PromoteReel', promoteReelSchema);