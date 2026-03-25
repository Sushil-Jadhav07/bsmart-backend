const mongoose = require('mongoose');

/**
 * AdEngagement — one document per save action per user per ad.
 *
 * Likes / comments / dislikes already exist on Ad and AdComment models.
 * This model fills the gap for SAVES (SavedAd has no demographics) and gives
 * the engagement report a single aggregation-friendly collection for all
 * engagement events with denormalised filter fields.
 *
 * action_type values
 * ──────────────────
 *  'save'    → user saved the ad (fires alongside SavedAd insert)
 *  'unsave'  → user removed the save  (fires alongside SavedAd delete)
 *
 * Denormalised fields (country / language / gender) allow the report
 * aggregation to filter without an extra User lookup.
 */
const adEngagementSchema = new mongoose.Schema(
  {
    ad_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ad',
      required: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    vendor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },
    action_type: {
      type: String,
      enum: ['save', 'unsave'],
      required: true,
    },
    // Denormalised at event time — no User join needed during report aggregation
    country: {
      type: String,
      default: '',
      index: true,
    },
    language: {
      type: String,
      default: '',
      index: true,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', ''],
      default: '',
      index: true,
    },
  },
  { timestamps: true }
);

// Vendor-scoped date window queries
adEngagementSchema.index({ vendor_id: 1, createdAt: -1 });

// Ad-scoped queries
adEngagementSchema.index({ ad_id: 1, action_type: 1 });

module.exports = mongoose.model('AdEngagement', adEngagementSchema);