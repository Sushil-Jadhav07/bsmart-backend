const mongoose = require('mongoose');

const loginHistorySchema = new mongoose.Schema({
  user_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  device_name: { type: String, default: '' },
  ip:          { type: String, default: '' },
  location:    { type: String, default: '' },
  login_at:    { type: Date, default: Date.now },
  status:      { type: String, enum: ['success', 'failed'], required: true },
}, { timestamps: false });

loginHistorySchema.index({ user_id: 1, login_at: -1 });

module.exports = mongoose.model('LoginHistory', loginHistorySchema);
