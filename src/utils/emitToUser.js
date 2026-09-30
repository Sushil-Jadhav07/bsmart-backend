// Emits a Socket.io event to every active connection (tab/device) for one user.
// server.js stores onlineUsers as Map<userId, Set<socketId>> — one user can have
// multiple sockets open at once, so this fans the event out to all of them.
const emitToUser = (app, userId, event, payload) => {
  try {
    const io = app.get('io');
    const onlineUsers = app.get('onlineUsers');
    if (!io || !onlineUsers || !userId) return;

    const socketIds = onlineUsers.get(String(userId));
    if (!socketIds || !socketIds.size) return;

    for (const socketId of socketIds) {
      io.to(socketId).emit(event, payload);
    }
  } catch (err) {
    console.error('[emitToUser]', err.message);
  }
};

module.exports = emitToUser;
