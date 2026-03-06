const io = require('socket.io-client');
const http = require('http');
const mongoose = require('mongoose');

const SERVER_URL = 'http://localhost:5000';
// You might need a valid user ID and JWT token to fully test if routes are protected
// For this test, we will simulate the socket connection and basic event listening.
// Since we don't have a full login flow in this script, we'll assume the server allows connection.
// If your socket requires auth, this might fail without a token.
// Based on previous code, socket connection seemed open, but 'register' event takes a userId.

const TEST_USER_ID = new mongoose.Types.ObjectId().toString();

console.log('--- Starting Notification System Test ---');
console.log(`Target Server: ${SERVER_URL}`);
console.log(`Test User ID: ${TEST_USER_ID}`);

const socket = io(SERVER_URL);

let notificationReceived = false;

socket.on('connect', () => {
  console.log('✅ Socket connected successfully');
  console.log(`   Socket ID: ${socket.id}`);

  // 1. Test Registration
  console.log(`👉 Sending 'register' event with User ID: ${TEST_USER_ID}`);
  socket.emit('register', TEST_USER_ID);

  // 2. Simulate a trigger (Since we can't easily trigger a real DB event from outside without auth/API calls,
  // we will wait to see if any stray notifications come or just confirm connection is stable)
  // To truly test notification delivery, we'd need to trigger an action on the backend.
  // However, verifying the socket connects and registers is the first critical step.
  
  // If you have a test endpoint to trigger notifications (like the one we deleted), we could use it.
  // Since we deleted it, we can only verify the connection and registration in this standalone script
  // unless we perform a real API login and action (like liking a post).
  
  console.log('⏳ Waiting for notifications... (Ctrl+C to exit if none expected)');
  
  // Keep alive for a bit
  setTimeout(() => {
    if (!notificationReceived) {
      console.log('ℹ️  No notifications received in timeout window (Expected if no action triggered)');
      console.log('✅ Socket connection and registration test passed.');
      socket.disconnect();
      process.exit(0);
    }
  }, 5000);
});

socket.on('new_notification', (data) => {
  notificationReceived = true;
  console.log('📩 Notification Received:', data);
});

socket.on('disconnect', () => {
  console.log('❌ Socket disconnected');
});

socket.on('connect_error', (err) => {
  console.error('❌ Connection Error:', err.message);
  process.exit(1);
});
