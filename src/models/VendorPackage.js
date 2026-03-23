'use strict';

const mongoose = require('mongoose');

/**
 * VendorPackage – master catalogue of purchasable packages.
 *
 * Package config (from docs):
 *   Basic      → ads 1–5,   base ₹25,000,  discount 80%, final ₹5,000
 *   Standard   → ads 6–10,  base ₹50,000,  discount 80%, final ₹10,000
 *   Premium    → ads 10–25, base ₹1,00,000, discount 80%, final ₹20,000
 *   Enterprise → ads 20+,   base ₹1,25,000, discount 80%, final ₹25,000
 *
 * Coin logic (on ad budget selection):
 *   basic / standard     → base coins only  (₹1 = 4 coins, no bonus)
 *   premium / enterprise → base coins + additional coins equal to ad budget
 */
const vendorPackageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // One of the four tiers — drives coin-calculation logic
    tier: {
      type: String,
      enum: ['basic', 'standard', 'premium', 'enterprise'],
      required: true,
    },

    // Ad slots allowed under this package
    ads_allowed_min: {
      type: Number,
      required: true,
      default: 1,
    },
    ads_allowed_max: {
      type: Number,
      required: true,
      default: 5,
      // For enterprise (20+) store 999 to represent unlimited
    },

    // Pricing
    base_price: {
      type: Number,
      required: true,
      min: 0,
    },
    discount_percent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
    // Final price after discount — stored explicitly so admin can override
    // Auto-formula: base_price - (base_price * discount_percent / 100)
    final_price: {
      type: Number,
      required: true,
      min: 0,
    },

    // Coins credited to vendor wallet on package purchase (wallet top-up)
    coins_granted: {
      type: Number,
      required: true,
      default: 0,
    },

    // Validity in days from purchase date (0 = never expires)
    validity_days: {
      type: Number,
      default: 30,
    },

    description: {
      type: String,
      default: '',
    },

    features: {
      type: [String],
      default: [],
    },

    is_active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('VendorPackage', vendorPackageSchema);