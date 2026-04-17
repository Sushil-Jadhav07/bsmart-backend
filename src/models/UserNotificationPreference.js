const mongoose = require('mongoose');

/**
 * UserNotificationPreference
 *
 * Stores a user's "turn on notifications" preference for another user or vendor.
 *
 * When a user visits a profile and taps "Turn on notifications":
 *   - target_type = 'user'   → notified when that user creates a post/reel
 *   - target_type = 'vendor' → notified when that vendor creates a post/reel
 *
 * The compound unique index prevents duplicate subscriptions.
 */
const userNotificationPreferenceSchema = new mongoose.Schema(
  {
    // The user who turned on notifications
    subscriber_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // The user or vendor being watched
    target_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    // 'user'   → target_id refers to User._id
    // 'vendor' → target_id refers to Vendor._id
    target_type: {
      type: String,
      enum: ['user', 'vendor'],
      required: true,
    },

    // Granular toggles so the subscriber can choose what they care about
    notify_on_post: {
      type: Boolean,
      default: true,
    },
    notify_on_reel: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// One subscription record per (subscriber, target) pair
userNotificationPreferenceSchema.index(
  { subscriber_id: 1, target_id: 1, target_type: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  'UserNotificationPreference',
  userNotificationPreferenceSchema
);
