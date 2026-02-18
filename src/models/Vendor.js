const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  business_name: { type: String, required: true },
  description: { type: String },
  category: { type: String },
  phone: { type: String },
  address: { type: String },
  logo_url: { type: String },
  validated: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);
