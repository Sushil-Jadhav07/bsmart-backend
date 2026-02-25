require('dotenv').config();
const express = require('express');
const cors = require('cors');
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

const app = express();

// Middleware
app.use(express.json());

// JSON Syntax Error Handler
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Bad JSON:', err.message);
    return res.status(400).json({ 
      message: 'Invalid JSON format', 
      error: err.message 
    });
  }
  next();
});

app.use(passport.initialize()); // Initialize Passport
app.use(cors({
  origin: "*",
  credentials: true
}));

// Serve static uploads
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Swagger Documentation
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

app.get('/api/docs/full', (req, res) => {
  const path = require('path');
  res.sendFile(path.join(__dirname, 'FULL_API_DOCUMENTATION.md'));
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const PORT = process.env.PORT || 5000;

// Connect to MongoDB before starting the server
const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to connect to the database. Server not started.');
    process.exit(1);
  }
};

startServer();
