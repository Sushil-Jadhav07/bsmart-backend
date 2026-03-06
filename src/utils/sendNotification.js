const Notification = require('../models/notification.model');

const sendNotification = async (app, { recipient, sender, type, message, link }) => {
  const notification = await Notification.create({
    recipient,
    sender,
    type,
    message,
    link
  });

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
        createdAt: notification.createdAt
      });
    }
  }

  return notification;
};

module.exports = sendNotification;
