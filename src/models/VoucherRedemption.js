'use strict';

const mongoose = require('mongoose');

const voucherRedemptionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Xoxoday product details
    product_id:   { type: String, required: true },
    voucher_name: { type: String, default: '' },
    brand_name:   { type: String, default: '' },
    image_url:    { type: String, default: '' },

    // Money
    face_value:  { type: Number, required: true },    // INR value of the voucher
    coins_spent: { type: Number, required: true },    // coins deducted from member wallet

    // Delivery
    delivery_email: { type: String, default: '' },

    // Xoxoday refs
    xoxoday_order_id: { type: String, default: null, index: true },
    xoxoday_po_number: { type: String, default: null, index: true },

    // The actual voucher code/pin returned by Xoxoday (may come async via webhook)
    voucher_code: { type: String, default: null },
    voucher_pin:  { type: String, default: null },
    expires_at:   { type: Date,   default: null },

    // Lifecycle
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    failure_reason: { type: String, default: '' },

    // WalletTransaction ref for the coin deduction
    wallet_transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletTransaction',
      default: null,
    },
  },
  { timestamps: true }
);

voucherRedemptionSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model('VoucherRedemption', voucherRedemptionSchema);
