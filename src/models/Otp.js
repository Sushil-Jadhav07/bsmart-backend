const mongoose = require('mongoose');

// ─── OTP MODEL ─────────────────────────────────────────────────────────────
// Stores OTPs (one-time passwords) for email verification and forgot-password.
// Each document auto-deletes after `expiresAt` thanks to MongoDB TTL index.
// That means you NEVER have to manually clean up expired OTPs — MongoDB does it.

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  otp: {
    type: String,
    required: true,
  },
  // 'verify_email' → used at registration to verify the email address
  // 'forgot_password' → used in the forgot-password flow
  purpose: {
    type: String,
    enum: ['verify_email', 'forgot_password', 'two_factor', 'forgot_password_2fa'],
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  used: {
    type: Boolean,
    default: false,   // mark true after the user successfully uses it
  },
}, { timestamps: true });

// TTL index: MongoDB will automatically delete the document when expiresAt is reached.
// This keeps your collection clean without any cron job.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);
