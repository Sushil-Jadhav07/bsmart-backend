const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  sender_type: {
    type: String,
    enum: ['user', 'admin', 'sales'],
    required: true,
  },
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000,
  },
}, { timestamps: true });

const supportQuerySchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  name: {
    type: String,
    trim: true,
    maxlength: 100,
    default: '',
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 200,
    default: '',
  },
  phone: {
    type: String,
    trim: true,
    maxlength: 20,
    default: '',
  },
  app_source: {
    type: String,
    enum: ['bsmart', 'ruvees'],
    required: true,
    index: true,
  },
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000,
  },
  category: {
    type: String,
    enum: ['account', 'payment', 'technical', 'general', 'other'],
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    default: 'open',
    index: true,
  },
  assigned_to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  assigned_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  assigned_at: {
    type: Date,
    default: null,
  },
  replies: [replySchema],
}, { timestamps: true });

supportQuerySchema.index({ user_id: 1, status: 1 });
supportQuerySchema.index({ assigned_to: 1, status: 1 });

module.exports = mongoose.model('SupportQuery', supportQuerySchema);
