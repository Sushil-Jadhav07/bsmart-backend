const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  type: {
    type: String,
    enum: [
      'like', 'comment', 'follow', 'mention', 'order', 'payout', 'admin',
      'vendor_approved', 'ad_approved',
      'comment_like', 'comment_reply', 'post_save', 'post_tag',
      'ad_comment', 'ad_like', 'ad_save', 'ad_rejected',
      'vendor_rejected',
      'coins_credited', 'coins_debited',
      'story_view', 'login_alert'
    ],
    required: true
  },
  message: { type: String, required: true },
  link: { type: String },
  isRead: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);