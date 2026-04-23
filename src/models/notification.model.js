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
      'story_view', 'login_alert',
      'follow_request', 'follow_accepted',

      // ── NEW types ──────────────────────────────────────────────────────────
      // Fired to subscribers when a watched user/vendor publishes content
      'subscribed_user_post',   // watched user posted a photo/video post
      'subscribed_user_reel',   // watched user posted a reel
      'subscribed_vendor_post', // watched vendor posted content

      // Fired to the vendor themselves when their subscription is expiring
      'subscription_expiring',  // sent X days before expiry
      'subscription_expired',   // sent on/after expiry day
    ],
    required: true
  },
  message: { type: String, required: true },
  link:    { type: String },
  isRead:  { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
