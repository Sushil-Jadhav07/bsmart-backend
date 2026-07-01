'use strict';

const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    category: {
      type: String,
      enum: ['general', 'account', 'payment', 'vendor', 'member', 'ads', 'other'],
      default: 'general',
      index: true,
    },
    app_source: {
      type: String,
      enum: ['member', 'vendor', 'both'],
      default: 'both',
      index: true,
    },
    order: {
      type: Number,
      default: 0,
      index: true,
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Faq', faqSchema);
