'use strict';

const mongoose = require('mongoose');
const UserNotificationPreference = require('../models/UserNotificationPreference');
const User   = require('../models/User');
const Vendor = require('../models/Vendor');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/notification-preferences/users/:targetUserId/toggle
// Turn on / off post+reel notifications for a specific user profile.
// ─────────────────────────────────────────────────────────────────────────────
exports.toggleUserNotification = async (req, res) => {
  try {
    const subscriberId  = req.userId;
    const { targetUserId } = req.params;

    if (!mongoose.isValidObjectId(targetUserId)) {
      return res.status(400).json({ message: 'Invalid targetUserId' });
    }

    if (subscriberId.toString() === targetUserId.toString()) {
      return res.status(400).json({ message: 'Cannot subscribe to your own notifications' });
    }

    const targetUser = await User.findById(targetUserId).lean();
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const existing = await UserNotificationPreference.findOne({
      subscriber_id: subscriberId,
      target_id:     targetUserId,
      target_type:   'user',
    });

    if (existing) {
      // Already subscribed → turn OFF (delete the preference)
      await UserNotificationPreference.deleteOne({ _id: existing._id });
      return res.json({
        enabled:  false,
        message:  `Notifications turned off for @${targetUser.username}`,
      });
    }

    // Not subscribed yet → turn ON
    await UserNotificationPreference.create({
      subscriber_id:   subscriberId,
      target_id:       targetUserId,
      target_type:     'user',
      notify_on_post:  true,
      notify_on_reel:  true,
    });

    return res.json({
      enabled:  true,
      message:  `Notifications turned on for @${targetUser.username}`,
    });
  } catch (err) {
    console.error('[NotifPref] toggleUserNotification error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/notification-preferences/vendors/:targetVendorId/toggle
// Turn on / off notifications for a vendor profile.
// ─────────────────────────────────────────────────────────────────────────────
exports.toggleVendorNotification = async (req, res) => {
  try {
    const subscriberId    = req.userId;
    const { targetVendorId } = req.params;

    if (!mongoose.isValidObjectId(targetVendorId)) {
      return res.status(400).json({ message: 'Invalid targetVendorId' });
    }

    const vendor = await Vendor.findById(targetVendorId).lean();
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    // Prevent the vendor's own user account from subscribing to themselves
    if (vendor.user_id && vendor.user_id.toString() === subscriberId.toString()) {
      return res.status(400).json({ message: 'Cannot subscribe to your own vendor notifications' });
    }

    const existing = await UserNotificationPreference.findOne({
      subscriber_id: subscriberId,
      target_id:     targetVendorId,
      target_type:   'vendor',
    });

    if (existing) {
      await UserNotificationPreference.deleteOne({ _id: existing._id });
      return res.json({
        enabled:  false,
        message:  `Notifications turned off for ${vendor.business_name}`,
      });
    }

    await UserNotificationPreference.create({
      subscriber_id:   subscriberId,
      target_id:       targetVendorId,
      target_type:     'vendor',
      notify_on_post:  true,
      notify_on_reel:  true,
    });

    return res.json({
      enabled:  true,
      message:  `Notifications turned on for ${vendor.business_name}`,
    });
  } catch (err) {
    console.error('[NotifPref] toggleVendorNotification error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notification-preferences/users/:targetUserId/status
// Check whether the logged-in user has notifications turned on for a profile.
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserNotificationStatus = async (req, res) => {
  try {
    const subscriberId  = req.userId;
    const { targetUserId } = req.params;

    if (!mongoose.isValidObjectId(targetUserId)) {
      return res.status(400).json({ message: 'Invalid targetUserId' });
    }

    const pref = await UserNotificationPreference.findOne({
      subscriber_id: subscriberId,
      target_id:     targetUserId,
      target_type:   'user',
    }).lean();

    return res.json({ enabled: !!pref });
  } catch (err) {
    console.error('[NotifPref] getUserNotificationStatus error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notification-preferences/vendors/:targetVendorId/status
// Check whether the logged-in user has notifications turned on for a vendor.
// ─────────────────────────────────────────────────────────────────────────────
exports.getVendorNotificationStatus = async (req, res) => {
  try {
    const subscriberId    = req.userId;
    const { targetVendorId } = req.params;

    if (!mongoose.isValidObjectId(targetVendorId)) {
      return res.status(400).json({ message: 'Invalid targetVendorId' });
    }

    const pref = await UserNotificationPreference.findOne({
      subscriber_id: subscriberId,
      target_id:     targetVendorId,
      target_type:   'vendor',
    }).lean();

    return res.json({ enabled: !!pref });
  } catch (err) {
    console.error('[NotifPref] getVendorNotificationStatus error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
