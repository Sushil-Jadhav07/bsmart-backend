const mongoose = require('mongoose');

const reportAttachmentSchema = new mongoose.Schema(
  {
    url:  { type: String, required: true },
    type: { type: String, enum: ['image', 'video'], default: 'image' },
  },
  { _id: false }
);

const contentReportSchema = new mongoose.Schema({
  reporter_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  content_type: {
    type: String,
    enum: ['post', 'reel', 'story', 'ad', 'comment', 'tweet', 'promote_reel'],
    required: true,
    index: true,
  },
  content_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  owner_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  reason: {
    type: String,
    required: true,
    trim: true,
  },
  details: {
    type: String,
    default: '',
    maxlength: 1000,
  },
  attachments: {
    type: [reportAttachmentSchema],
    default: [],
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'action_taken', 'rejected'],
    default: 'pending',
    index: true,
  },
  action_taken: {
    type: String,
    enum: ['none', 'content_removed', 'warning_issued', 'temporary_suspension', 'permanent_ban'],
    default: 'none',
  },
  reviewed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reviewed_at: {
    type: Date,
    default: null,
  },
  admin_note: {
    type: String,
    default: '',
    maxlength: 1000,
  },
}, { timestamps: true });

contentReportSchema.index({ reporter_id: 1, content_type: 1, content_id: 1 });

module.exports = mongoose.model('ContentReport', contentReportSchema);
