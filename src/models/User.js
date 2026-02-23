const mongoose = require('mongoose');

// Define the User Schema
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    // required: [true, 'Please add a password'], // Not required for OAuth users
    minlength: 6,
    select: false // Don't return password by default in queries
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true // Allows multiple null values
  },
  provider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  username: {
    type: String,
    required: [true, 'Please add a username'],
    unique: true,
    trim: true
  },
  full_name: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    default: ''
  },
  posts_count: {
    type: Number,
    default: 0
  },
  followers_count: {
    type: Number,
    default: 0
  },
  following_count: {
    type: Number,
    default: 0
  },
  is_active: {
    type: Boolean,
    default: true
  },
  role: {
    type: String,
    enum: ['member', 'vendor', 'admin'],
    default: 'member'
  },
  avatar_url: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true // Automatically adds createdAt and updatedAt
});

module.exports = mongoose.model('User', userSchema);
