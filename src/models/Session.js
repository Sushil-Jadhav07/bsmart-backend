const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  user_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token_hash:  { type: String, required: true, index: true },
  device_name: { type: String, default: '' },
  device_type: { type: String, enum: ['web', 'mobile', 'unknown'], default: 'unknown' },
  ip:          { type: String, default: '' },
  location:    { type: String, default: '' },
  last_active: { type: Date, default: Date.now },
  is_active:   { type: Boolean, default: true },
  expires_at:  { type: Date },
}, { timestamps: true });

// Auto-delete expired sessions
sessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', sessionSchema);
