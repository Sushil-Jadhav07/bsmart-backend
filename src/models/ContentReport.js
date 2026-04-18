const mongoose = require('mongoose');

const contentReportSchema = new mongoose.Schema({
  reporter_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  content_type: {
    type: String,
    enum: ['post', 'reel', 'story', 'ad', 'comment', 'tweet'],
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
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'action_taken', 'rejected'],
    default: 'pending',
    index: true,
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
