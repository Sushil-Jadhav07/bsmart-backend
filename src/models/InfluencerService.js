const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  fileUrl:  { type: String },
}, { _id: false });

const subserviceSchema = new mongoose.Schema({
  name:  { type: String, default: '' },
  hours: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
}, { _id: false });

const timeSlotSchema = new mongoose.Schema({
  start: { type: String, required: true }, // "09:00"
  end:   { type: String, required: true }, // "17:00"
}, { _id: false });

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const weeklyAvailabilitySchema = {};
for (const day of WEEKDAYS) {
  weeklyAvailabilitySchema[day] = { type: [timeSlotSchema], default: [] }; // empty = Unavailable
}

const influencerServiceSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // ── 1. Service Details ─────────────────────────────────────────────────────
  images:            { type: [imageSchema], default: [] }, // optional, unlike products
  name:              { type: String, required: true, trim: true, maxlength: 150 },
  category:          { type: String, required: true },
  provider:          { type: String, default: '' },
  short_description: { type: String, required: true, maxlength: 500 },
  key_highlights:    {
    type: [String],
    validate: v => v.length > 0 && v.length <= 5,
    required: true,
  },

  // ── 2. Pricing ──────────────────────────────────────────────────────────────
  price:       { type: Number, required: true, min: 0 },
  rate_type:   { type: String, enum: ['starting_from', 'fixed', 'per_hour', 'per_session'], required: true },
  duration:    { type: String, required: true }, // e.g. "1 hour", "30 mins"
  subservices: { type: [subserviceSchema], default: [] },

  // ── 3. Availability & Publish ────────────────────────────────────────────────
  service_method: { type: String, enum: ['at_customer_location', 'online', 'at_my_location'], required: true },
  weekly_availability: { type: weeklyAvailabilitySchema, default: {} },
  visible_to_customers: { type: Boolean, default: true },
  status: { type: String, enum: ['active', 'inactive', 'draft'], default: 'active' },

  isDeleted: { type: Boolean, default: false },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date },
}, { timestamps: true });

influencerServiceSchema.index({ user_id: 1, isDeleted: 1 });
influencerServiceSchema.index({ visible_to_customers: 1, status: 1, isDeleted: 1, category: 1 });

module.exports = mongoose.model('InfluencerService', influencerServiceSchema);
module.exports.WEEKDAYS = WEEKDAYS;
