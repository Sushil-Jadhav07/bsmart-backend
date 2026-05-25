const Notification = require('../models/notification.model');
const { sendPushNotification } = require('../services/pushNotification.service');

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

  return notification;
};

module.exports = sendNotification;