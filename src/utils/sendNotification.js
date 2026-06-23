const Notification = require('../models/notification.model');
const { sendPushNotification } = require('../services/pushNotification.service');
const admin = require('../lib/firebase');
const User = require('../models/User');

const LOGO_URL = (() => {
  const cf = process.env.CLOUDFRONT_BASE_URL
    ? process.env.CLOUDFRONT_BASE_URL.replace(/\/+$/, '')
    : null;
  if (cf) return `${cf}/assets/bsmart_logo.png`;
  const base = process.env.BASE_URL || process.env.API_URL || 'https://api.bebsmart.in';
  return `${base}/assets/bsmart_logo.png`;
})();

const sendFcmIfAvailable = async (recipientUserId, title, body, data = {}) => {
  try {
    const user = await User.findById(recipientUserId).select('fcm_token');
    if (!admin || !user?.fcm_token) return;

    await admin.messaging().send({
      token: user.fcm_token,
      notification: { title, body, image: LOGO_URL },
      android: {
        notification: { channel_id: 'bsmart_channel', icon: 'notification_icon' },
      },
      apns: {
        payload: { aps: { 'mutable-content': 1 } },
        fcm_options: { image: LOGO_URL },
      },
      data: {
        type: String(data.type || ''),
        link: String(data.link || ''),
      },
    });

    console.log('[FCM] Sent to user:', recipientUserId);
  } catch (err) {
    console.error('[FCM] Send failed (non-fatal):', err.message);
  }
};

const buildFcmTitle = (type, message, senderName) => {
  if (senderName) {
    const titles = {
      like: `${senderName} liked your post`,
      comment: `${senderName} commented on your post`,
      tweet_like: `${senderName} liked your tweet`,
      tweet_comment: `${senderName} commented on your tweet`,
      follow_request: `${senderName} requested to follow you`,
      follow_accepted: `${senderName} accepted your follow request`,
      follow: `${senderName} started following you`,
      comment_reply: `${senderName} replied to your comment`,
      comment_like: `${senderName} liked your comment`,
      post_save: `${senderName} saved your post`,
      post_tag: `${senderName} tagged you in a post`,
      reel_tag: `${senderName} tagged you in a reel`,
      ad_tag: `${senderName} tagged you in an ad`,
      promote_reel_tag: `${senderName} tagged you in a promote reel`,
      ad_comment: `${senderName} commented on your ad`,
      ad_like: `${senderName} liked your ad`,
      ad_save: `${senderName} saved your ad`,
      story_view: `${senderName} viewed your story`,
      mention: `${senderName} mentioned you`,
      chat_message: senderName,
    };
    if (titles[type]) return titles[type];
  }

  return message || 'Bsmart notification';
};

const sendNotification = async (app, { recipient, sender, type, message, link, senderName = '', senderAvatar = '' }) => {
  // ── 1. Save to MongoDB (existing) ─────────────────────────────────────────
  const notification = await Notification.create({
    recipient, sender, type, message, link,
  });

  // ── 2. Socket.io real-time (existing) ─────────────────────────────────────
  const io          = app.get('io');
  const onlineUsers = app.get('onlineUsers');
  if (io && onlineUsers) {
    const socketId = onlineUsers.get(recipient.toString());
    if (socketId) {
      io.to(socketId).emit('new_notification', {
        _id: notification._id, type, message, link,
        isRead: false, createdAt: notification.createdAt,
      });
    }
  }

  // ── 3. Push notification (new) ────────────────────────────────────────────
  sendPushNotification(recipient.toString(), {
    title:        'Bsmart',
    body:         message,
    link:         link || '/',
    type,
    senderName,
    senderAvatar,
  }).catch(() => {});

  // ── 4. Firebase Admin FCM (additive, non-blocking) ────────────────────────
  // For chat messages, use the sender name as the FCM notification title
  // so the lock screen shows "Rahul" not "Bsmart"
  const fcmTitle = (type === 'chat_message' && senderName)
    ? senderName
    : buildFcmTitle(type, message, senderName);
  sendFcmIfAvailable(recipient.toString(), fcmTitle, message, {
    type,
    link: link || '',
  }).catch(() => {});

  return notification;
};

module.exports = sendNotification;