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
  ban_type: {
    type: String,
    enum: ['none', 'temporary', 'permanent'],
    default: 'none',
  },
  ban_until: {
    type: Date,
    default: null,
  },
  ban_reason: {
    type: String,
    default: '',
  },
  banned_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  banned_at: {
    type: Date,
    default: null,
  },
  role: {
    type: String,
    enum: ['member', 'vendor', 'admin', 'sales'],
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
  age: {
    type: Number,
    default: null
  },
  gender: {
    type: String,
    default: ''
  },
  location: {
    type: String,
    default: ''
  },
  address: {
    address_line1: { type: String, default: '' },
    address_line2: { type: String, default: '' },
    pincode: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    country: { type: String, default: '' }
  },
  twoFA: {
    enabled: {
      type: Boolean,
      default: false
    }
  },
  // For vendor users: store company details snapshot on the user
  company_details: {
    company_name: { type: String, default: '' },
    registered_name: { type: String, default: '' },
    industry: { type: String, default: '' },
    registration_number: { type: String, default: '' },
    tax_id: { type: String, default: '' },
    year_established: { type: String, default: '' },
    company_type: { type: String, default: '' }
  },
  // ─── Ad Interest Categories ───────────────────────────────────────────────
  // Stores the list of ad categories the user is interested in.
  // Values must come from /src/data/adCategories.js list.
  ad_interests: {
    type: [String],
    default: [],
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
  },

isPrivate: {
  type: Boolean,
  default: false,
},

followRequests: [
  { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
],

  // ─── Push Notification Tokens ─────────────────────────────────────────────
  // FCM token sent by the Android APK on login / token refresh
  fcm_token: {
    type: String,
    default: null,
  },
  // AWS SNS endpoint ARN created when FCM token is registered
  sns_endpoint_arn: {
    type: String,
    default: null,
  },
  // Web Push subscription object sent by the browser (VAPID)
  // Shape: { endpoint: String, keys: { p256dh: String, auth: String } }
  web_push_subscription: {
    type: Object,
    default: null,
  },

}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for vendor profile
userSchema.virtual('vendor_profile', {
  ref: 'Vendor',
  localField: '_id',
  foreignField: 'user_id',
  justOne: true
});

module.exports = mongoose.model('User', userSchema);
