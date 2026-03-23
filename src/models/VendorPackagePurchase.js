'use strict';

const mongoose = require('mongoose');

/**
 * VendorPackagePurchase – one record per vendor purchase event.
 * A vendor can have only ONE active purchase at a time.
 * Buying a new package while one is active marks the old one 'superseded'.
 */
const vendorPackagePurchaseSchema = new mongoose.Schema(
  {
    vendor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    package_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VendorPackage',
      required: true,
    },

    // Snapshot of key fields at time of purchase
    // (history remains stable even if the package is later edited)
    package_snapshot: {
      name:             { type: String },
      tier:             { type: String },
      ads_allowed_min:  { type: Number },
      ads_allowed_max:  { type: Number },
      base_price:       { type: Number },
      discount_percent: { type: Number },
      final_price:      { type: Number },
      coins_granted:    { type: Number },
      validity_days:    { type: Number },
    },

    // Final price actually paid (copied from package.final_price)
    amount_paid: {
      type: Number,
      required: true,
    },
    // Coins credited to vendor wallet on this purchase
    coins_credited: {
      type: Number,
      required: true,
    },

    purchased_at: {
      type: Date,
      default: Date.now,
    },
    expires_at: {
      type: Date,
      default: null, // null = never expires (validity_days === 0)
    },

    status: {
      type: String,
      enum: ['active', 'expired', 'superseded'],
      default: 'active',
      index: true,
    },
  },
  { timestamps: true }
);

// Quick lookup: active package for a vendor
vendorPackagePurchaseSchema.index({ vendor_id: 1, status: 1 });
// Full history sorted newest-first
vendorPackagePurchaseSchema.index({ vendor_id: 1, createdAt: -1 });

module.exports = mongoose.model('VendorPackagePurchase', vendorPackagePurchaseSchema);