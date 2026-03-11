require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');           // ← ADD THIS
const { Server } = require('socket.io'); // ← ADD THIS
const connectDB = require('./src/config/db');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./src/config/swagger');
const passport = require('./src/config/passport');

// Import routes
const authRoutes = require('./src/routes/auth.routes');
const postRoutes = require('./src/routes/post.routes');
const uploadRoutes = require('./src/routes/upload.routes');
const userRoutes = require('./src/routes/user.routes');
const commentRoutes = require('./src/routes/comment.routes');
const viewRoutes = require('./src/routes/view.routes');
const storyRoutes = require('./src/routes/story.routes');
const followRoutes = require('./src/routes/follow.routes');
const vendorRoutes = require('./src/routes/vendor.routes');
const adminRoutes = require('./src/routes/admin.routes');
const memberRoutes = require('./src/routes/member.routes');
const adRoutes = require('./src/routes/ad.routes');
const walletRoutes = require('./src/routes/wallet.routes');
const notificationRoutes = require('./src/routes/notification.routes');
const memberV1Routes = require('./src/routes/member.v1.routes');
const vendorV1Routes = require('./src/routes/vendor.v1.routes');

const app = express();
const server = http.createServer(app);  // ← WRAP app in http server

// ─── SOCKET.IO SETUP ───────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store userId → socketId mapping (in-memory)
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Client sends their userId after connecting
  socket.on('register', (userId) => {
    onlineUsers.set(userId, socket.id);
    console.log(`User ${userId} registered with socket ${socket.id}`);
  });

  socket.on('disconnect', () => {
    // Remove user from map on disconnect
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        console.log(`User ${userId} disconnected`);
        break;
      }
    }
  });
});

// Make io and onlineUsers accessible in routes
app.set('io', io);
app.set('onlineUsers', onlineUsers);
// ────────────────────────────────────────────────────────────────────────────

// Middleware
app.use(express.json());
app.use(passport.initialize());
app.use(cors({ origin: "*", credentials: true }));

const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/users', userRoutes);
app.use('/api', commentRoutes);
app.use('/api/views', viewRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api', followRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/v1/member', memberV1Routes);
app.use('/api/v1/vendor', vendorV1Routes);

app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    server.listen(PORT, () => {          // ← use `server.listen` not `app.listen`
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to connect to DB');
    process.exit(1);
  }
};

startServer();
