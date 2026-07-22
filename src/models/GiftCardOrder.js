'use strict';

const mongoose = require('mongoose');

const orderMediaSchema = new mongoose.Schema(
  {
    url:  { type: String, default: '' },
    type: { type: String, enum: ['image', 'video'], default: 'image' },
  },
  { _id: false }
);

const giftCardOrderSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    gift_card_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GiftCard',
      required: true,
    },

    // Snapshot of the catalog item at purchase time — keeps order history
    // intact even if the GiftCard is later edited or removed.
    title:  { type: String, required: true },
    vendor: { type: String, required: true },
    media:  { type: orderMediaSchema, default: null },

    // Chosen denomination (snapshot)
    bcoins: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'cancelled'],
      default: 'pending',
      index: true,
    },

    // Delivered once status becomes 'completed'
    voucher_code: { type: String, default: null },
    voucher_pin:  { type: String, default: null },
    expiry_date:  { type: Date,   default: null },
    redeem_steps: { type: [String], default: [] },

    wallet_transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletTransaction',
      default: null,
    },
    refund_transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletTransaction',
      default: null,
    },

    processed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    cancelled_at: { type: Date, default: null },
  },
  { timestamps: true }
);

giftCardOrderSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model('GiftCardOrder', giftCardOrderSchema);
