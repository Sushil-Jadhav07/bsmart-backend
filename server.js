// ─── GLOBAL ERROR HANDLERS ─────────────────────────────────────────────────
// MUST be at the very top — prevents Node from dying on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.stack || err.message);
  // Do NOT call process.exit() — PM2 will restart if truly needed
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, '\nReason:', reason);
  // Do NOT call process.exit() — keeps server alive through async failures
});
// ───────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const connectDB = require('./src/config/db');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./src/config/swagger');
const passport = require('./src/config/passport');

// Import routes
const authRoutes         = require('./src/routes/auth.routes');
const postRoutes         = require('./src/routes/post.routes');
const uploadRoutes       = require('./src/routes/upload.routes');
const userRoutes         = require('./src/routes/user.routes');
const commentRoutes      = require('./src/routes/comment.routes');
const viewRoutes         = require('./src/routes/view.routes');
const storyRoutes        = require('./src/routes/story.routes');
const followRoutes       = require('./src/routes/follow.routes');
const vendorRoutes       = require('./src/routes/vendor.routes');
const adminRoutes        = require('./src/routes/admin.routes');
const memberRoutes       = require('./src/routes/member.routes');
const adRoutes           = require('./src/routes/ad.routes');
const walletRoutes       = require('./src/routes/wallet.routes');
const notificationRoutes = require('./src/routes/notification.routes');
const memberV1Routes     = require('./src/routes/member.v1.routes');
const vendorV1Routes     = require('./src/routes/vendor.v1.routes');
const salesRoutes        = require('./src/routes/sales.routes');
const countryRoutes      = require('./src/routes/country.routes');
const locationRoutes     = require('./src/routes/location.routes'); // ← NEW

const app    = express();
const server = http.createServer(app);

// ─── SOCKET.IO SETUP ──────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,      // how long to wait for pong before disconnecting
  pingInterval: 25000,     // how often to ping clients
  maxHttpBufferSize: 1e6,  // 1MB max socket message — prevents memory spikes
});

// userId → socketId mapping (in-memory)
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('[Socket] Connected:', socket.id);

  socket.on('register', (userId) => {
    if (!userId) return;
    // If user already has a socket, remove old entry first
    onlineUsers.set(String(userId), socket.id);
    console.log(`[Socket] User ${userId} registered → ${socket.id}`);
  });

  socket.on('disconnect', () => {
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        console.log(`[Socket] User ${userId} disconnected`);
        break;
      }
    }
  });

  // Catch any socket-level errors so they don't bubble up and crash the process
  socket.on('error', (err) => {
    console.error('[Socket] Error on socket', socket.id, err.message);
  });
});

// Make io and onlineUsers accessible inside controllers via req.app.get(...)
app.set('io', io);
app.set('onlineUsers', onlineUsers);
// ──────────────────────────────────────────────────────────────────────────

// ─── MIDDLEWARE ────────────────────────────────────────────────────────────
// Limit JSON body size to 10MB to prevent memory spikes from large payloads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(passport.initialize());
app.use(cors({ origin: '*', credentials: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Swagger docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));
// ──────────────────────────────────────────────────────────────────────────

// ─── ROUTES ───────────────────────────────────────────────────────────────
app.use('/api/auth',           authRoutes);
app.use('/api/posts',          postRoutes);
app.use('/api/upload',         uploadRoutes);
app.use('/api/users',          userRoutes);
app.use('/api',                commentRoutes);
app.use('/api/views',          viewRoutes);
app.use('/api/stories',        storyRoutes);
app.use('/api',                followRoutes);
app.use('/api/vendors',        vendorRoutes);
app.use('/api/members',        memberRoutes);
app.use('/api/admin',          adminRoutes);
app.use('/api/ads',            adRoutes);
app.use('/api/wallet',         walletRoutes);
app.use('/api/notifications',  notificationRoutes);
app.use('/api/v1/member',      memberV1Routes);
app.use('/api/v1/vendor',      vendorV1Routes);
app.use('/api/sales',          salesRoutes);
app.use('/api/location',       locationRoutes);  // ← NEW
// ── Country / State / City / Language routes ──────────────────────────────
// Flat legacy endpoints  →  GET /api/countries  /api/states  /api/cities  /api/languages
// New nested endpoints   →  GET /api/countries/all
//                           GET /api/countries/:isoCode
//                           GET /api/countries/:isoCode/states
//                           GET /api/countries/:isoCode/states/:stateCode/cities
//                           GET /api/countries/:isoCode/languages
app.use('/api/countries',      countryRoutes);
app.use('/api/states',         countryRoutes);
app.use('/api/cities',         countryRoutes);
app.use('/api/languages',      countryRoutes);

// Health check — used by PM2 / uptime monitors
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok', uptime: process.uptime() }));

// ─── GLOBAL EXPRESS ERROR HANDLER ─────────────────────────────────────────
// Catches any error passed via next(err) from any route/middleware
app.use((err, req, res, next) => {
  console.error('[Express Error]', err.stack || err.message);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
  });
});
// ──────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    server.listen(PORT, () => {
      console.log(`[Server] Running on port ${PORT}`);
    });
  } catch (error) {
    console.error('[Server] Failed to start — DB connection error:', error.message);
    process.exit(1);
  }
};

startServer();