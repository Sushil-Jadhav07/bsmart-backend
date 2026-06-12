const Notification = require('../models/notification.model');
const { sendPushNotification } = require('../services/pushNotification.service');
const admin = require('../lib/firebase');
const User = require('../models/User');

const sendFcmIfAvailable = async (recipientUserId, title, body, data = {}) => {
  try {
    const user = await User.findById(recipientUserId).select('fcm_token');
    if (!admin || !user?.fcm_token) return;

    await admin.messaging().send({
      token: user.fcm_token,
      notification: { title, body },
      android: {
        notification: { channel_id: 'bsmart_channel' },
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
      chat_message: `${senderName} sent you a message`,
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
  sendFcmIfAvailable(recipient.toString(), buildFcmTitle(type, message, senderName), message, {
    type,
    link: link || '',
  }).catch(() => {});

  return notification;
};

module.exports = sendNotification;
