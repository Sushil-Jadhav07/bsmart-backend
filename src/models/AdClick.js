const mongoose = require('mongoose');

/**
 * AdClick — one document per click event.
 *
 * Captured when a member taps/clicks through an ad (e.g. CTA button, product link).
 * Distinct from AdView (impression). A view becomes a click only on deliberate action.
 *
 * Fields
 * ──────
 *  ad_id          → the ad that was clicked
 *  user_id        → the member who clicked (populated for gender/country filters)
 *  vendor_id      → denormalised for fast vendor-scoped queries (no extra join)
 *  is_unique      → true if this is the FIRST click by this user on this ad
 *  is_invalid     → true if flagged as fraudulent / bot click
 *  coins_spent    → coins deducted from ad budget for this click (CPC model)
 *  country        → denormalised from User.location.country at click time
 *  language       → denormalised from User.language at click time
 *  gender         → denormalised from User.gender at click time
 */
const adClickSchema = new mongoose.Schema(
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
    is_unique: {
      type: Boolean,
      default: false,
    },
    is_invalid: {
      type: Boolean,
      default: false,
    },
    coins_spent: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Denormalised filters — captured once so reports never need a User join
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

// Compound index — quickly count unique clicks per ad
adClickSchema.index({ ad_id: 1, user_id: 1 });

// Compound index — vendor dashboard: all clicks for a vendor in a date window
adClickSchema.index({ vendor_id: 1, createdAt: -1 });

module.exports = mongoose.model('AdClick', adClickSchema);