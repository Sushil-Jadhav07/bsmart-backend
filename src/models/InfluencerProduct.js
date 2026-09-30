const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  fileUrl:  { type: String },
}, { _id: false });

const variantSchema = new mongoose.Schema({
  color:          { type: String, default: '' },
  size:           { type: String, default: '' },
  stock_quantity: { type: Number, default: 0 },
  price:          { type: Number, default: 0 },
}, { _id: false });

const dimensionsSchema = new mongoose.Schema({
  length: { type: Number, required: true },
  width:  { type: Number, required: true },
  height: { type: Number, required: true },
  unit:   { type: String, default: 'cm' },
}, { _id: false });

const influencerProductSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // ── 1. Product Details ────────────────────────────────────────────────────
  images:            { type: [imageSchema], validate: v => v.length > 0, required: true },
  name:              { type: String, required: true, trim: true, maxlength: 150 },
  category:          { type: String, required: true },
  brand:             { type: String, default: '' },
  short_description: { type: String, required: true, maxlength: 500 },
  key_highlights:    {
    type: [String],
    validate: v => v.length > 0 && v.length <= 5,
    required: true,
  },

  // ── 2. Price & Inventory ───────────────────────────────────────────────────
  mrp:             { type: Number, required: true, min: 0 },
  selling_price:   { type: Number, required: true, min: 0 },
  discount:        { type: Number, default: null }, // percentage — auto-computed if not supplied
  stock_quantity:  { type: Number, required: true, min: 0 },
  seller_sku:      { type: String, required: true },
  track_inventory: { type: Boolean, default: true },
  status:          { type: String, enum: ['active', 'inactive', 'draft', 'out_of_stock'], default: 'active' },
  variants:        { type: [variantSchema], default: [] },

  // ── 3. Delivery & Publish ──────────────────────────────────────────────────
  package_weight:             { type: Number, required: true, min: 0 },
  weight_unit:                { type: String, enum: ['kg', 'g'], default: 'kg' },
  dimensions:                 { type: dimensionsSchema, required: true },
  dispatch_time:              { type: String, required: true },
  hsn_gst:                    { type: String, default: '' },
  country_of_origin:          { type: String, required: true, default: 'India' },
  return_policy:              { type: String, required: true },
  use_store_delivery_settings: { type: Boolean, default: true },
  use_store_return_policy:     { type: Boolean, default: true },
  warranty:                    { type: String, default: 'None' },

  isDeleted: { type: Boolean, default: false },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date },
}, { timestamps: true });

influencerProductSchema.index({ user_id: 1, isDeleted: 1 });
influencerProductSchema.index({ status: 1, isDeleted: 1, category: 1 });

module.exports = mongoose.model('InfluencerProduct', influencerProductSchema);
