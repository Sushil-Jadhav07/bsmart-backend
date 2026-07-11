'use strict';

const mongoose = require('mongoose');

const PolicyHistorySchema = new mongoose.Schema(
  {
    content:  { type: String, required: true },
    status:   { type: String, enum: ['draft', 'published'], default: 'draft' },
    version:  { type: Number, required: true },
    saved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    saved_at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const PolicySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9_-]+$/, // keeps it URL-safe since it's used directly as a route param
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      default: '', // raw HTML from the rich text editor
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
    },
    version: {
      type: Number,
      default: 1, // auto-increments on every PUT save
    },
    history: [PolicyHistorySchema],
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Policy', PolicySchema);
