const Notification = require('../models/notification.model');
const { sendPushNotification } = require('../services/pushNotification.service');

const sendNotification = async (app, { recipient, sender, type, message, link }) => {
  // ── 1. Save notification to MongoDB (existing) ────────────────────────────
  const notification = await Notification.create({
    recipient,
    sender,
    type,
    message,
    link,
  });

  // ── 2. Socket.io real-time emit (existing) ────────────────────────────────
  const io = app.get('io');
  const onlineUsers = app.get('onlineUsers');

  if (io && onlineUsers) {
    const recipientSocketId = onlineUsers.get(recipient.toString());

    if (recipientSocketId) {
      io.to(recipientSocketId).emit('new_notification', {
        _id: notification._id,
        type,
        message,
        link,
        isRead: false,
        createdAt: notification.createdAt,
      });
    }
  }

  // ── 3. Push notification — fires even when user is offline (new) ──────────
  // Fire-and-forget: never awaited so it never blocks or throws into callers
  sendPushNotification(recipient.toString(), {
    title: 'Bsmart',
    body: message,
    link: link || '/',
    type,
  }).catch(() => {});

  return notification;
};

module.exports = sendNotification;