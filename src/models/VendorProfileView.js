'use strict';

const mongoose = require('mongoose');

/**
 * VendorProfileView
 *
 * Tracks when a member views a vendor's profile page.
 * A member earns coins once every 3 minutes per vendor.
 * After each qualifying view, the `last_rewarded_at` is updated.
 * The next reward becomes eligible 3 minutes after `last_rewarded_at`.
 */
const vendorProfileViewSchema = new mongoose.Schema(
  {
    /** The member who visited the vendor profile */
    viewer_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** The vendor's user_id (User._id of the vendor) */
    vendor_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** Total number of qualifying views (each >= 3 minutes) */
    view_count: {
      type: Number,
      default: 1,
    },
    /** When the member was last rewarded for viewing this vendor's profile */
    last_rewarded_at: {
      type: Date,
      default: null,
    },
    /** Total coins this member has earned from viewing this vendor's profile */
    total_coins_earned: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// One record per (viewer, vendor) pair
vendorProfileViewSchema.index({ viewer_user_id: 1, vendor_user_id: 1 }, { unique: true });

module.exports = mongoose.model('VendorProfileView', vendorProfileViewSchema);