'use strict';

const mongoose = require('mongoose');

const bugAttachmentSchema = new mongoose.Schema(
  {
    url:  { type: String, required: true },
    type: { type: String, enum: ['image', 'video'], default: 'image' },
  },
  { _id: false }
);

const bugReportSchema = new mongoose.Schema(
  {
    reporter_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: [
        'app_crash', 'video_not_playing', 'login_issue', 'payment_issue',
        'rewards_issue', 'upload_issue', 'ui_problem', 'other',
      ],
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    attachments: {
      type: [bugAttachmentSchema],
      default: [],
    },

    // Auto-captured from the client at submission time
    app_version:  { type: String, default: '' },
    os_type:      { type: String, enum: ['android', 'ios', 'windows', 'macos', 'linux', 'other', ''], default: '' },
    os_version:   { type: String, default: '' },
    device_model: { type: String, default: '' },
    network_type: { type: String, enum: ['wifi', 'mobile_data', 'other', ''], default: '' },

    // Human-friendly reference shown on the admin dashboard, derived from _id after creation
    ticket_id: {
      type: String,
      unique: true,
      sparse: true,
    },

    status: {
      type: String,
      enum: ['new', 'in_progress', 'fixed', 'closed'],
      default: 'new',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true,
    },
    assigned_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    admin_note: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    resolved_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

bugReportSchema.index({ reporter_id: 1, createdAt: -1 });

module.exports = mongoose.model('BugReport', bugReportSchema);
