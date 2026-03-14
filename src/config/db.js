const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // ── Connection pool ─────────────────────────────────────────────────
      maxPoolSize: 10,          // max simultaneous connections to MongoDB
      minPoolSize: 2,           // keep at least 2 connections open

      // ── Timeouts ────────────────────────────────────────────────────────
      serverSelectionTimeoutMS: 5000,   // fail fast if MongoDB is unreachable
      connectTimeoutMS: 10000,          // max time to establish initial connection
      socketTimeoutMS: 45000,           // max time waiting for a query response

      // ── Reliability ─────────────────────────────────────────────────────
      bufferCommands: false,            // fail immediately if not connected (don't queue forever)
      heartbeatFrequencyMS: 10000,      // check connection health every 10s
    });

    console.log(`[DB] MongoDB connected: ${conn.connection.host}`);

    // ── Connection event listeners ────────────────────────────────────────
    mongoose.connection.on('disconnected', () => {
      console.warn('[DB] MongoDB disconnected — will attempt reconnect automatically');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[DB] MongoDB reconnected successfully');
    });

    mongoose.connection.on('error', (err) => {
      console.error('[DB] MongoDB connection error:', err.message);
    });

  } catch (error) {
    console.error('[DB] MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;