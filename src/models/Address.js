const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  label:         { type: String, default: 'Home' }, // e.g. "Home", "Work", "Other"
  name:          { type: String, required: true, trim: true },
  phone:         { type: String, required: true, trim: true },
  address_line1: { type: String, required: true, trim: true },
  address_line2: { type: String, default: '' },
  city:          { type: String, required: true, trim: true },
  state:         { type: String, required: true, trim: true },
  pincode:       { type: String, required: true, trim: true },
  country:       { type: String, default: 'India' },

  is_default: { type: Boolean, default: false },

  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },
}, { timestamps: true });

addressSchema.index({ user_id: 1, isDeleted: 1 });
addressSchema.index({ user_id: 1, is_default: 1 });

module.exports = mongoose.model('Address', addressSchema);
