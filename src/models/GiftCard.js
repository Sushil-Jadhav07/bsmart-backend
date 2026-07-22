'use strict';

const mongoose = require('mongoose');

const giftCardMediaSchema = new mongoose.Schema(
  {
    url:  { type: String, required: true },
    type: { type: String, enum: ['image', 'video'], default: 'image' },
  },
  { _id: false }
);

const denominationSchema = new mongoose.Schema(
  {
    bcoins: { type: Number, required: true, min: 0 }, // coins a member spends
    amount: { type: Number, required: true, min: 0 }, // face value (INR) they receive
  },
  { _id: true }
);

const giftCardSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    media: {
      type: [giftCardMediaSchema],
      default: [],
    },
    category: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    denominations: {
      type: [denominationSchema],
      default: [],
      validate: [(v) => v && v.length > 0, 'At least one denomination is required'],
    },
    card_status: {
      type: String,
      enum: ['active', 'inactive', 'draft'],
      default: 'draft',
      index: true,
    },
    vendor: {
      type: String,
      required: true,
      trim: true,
    },
    terms_and_conditions: {
      type: [String],
      default: [],
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GiftCard', giftCardSchema);
