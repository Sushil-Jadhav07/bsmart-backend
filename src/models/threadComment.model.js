const mongoose = require('mongoose');

const threadCommentSchema = new mongoose.Schema({
  thread_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Thread',
    required: true,
    index: true,
  },
  parent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ThreadComment',
    default: null,
  },
  user: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    avatar_url: {
      type: String,
      default: '',
    },
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  likes_count: {
    type: Number,
    default: 0,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  deletedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('ThreadComment', threadCommentSchema);
