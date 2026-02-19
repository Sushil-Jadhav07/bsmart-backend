const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  business_name: { type: String, required: true },
  description: { type: String },
  category: { type: String },
  phone: { type: String },
  address: { type: String },
  logo_url: { type: String },
  validated: { type: Boolean, default: false },
  company_name: { type: String },
  legal_business_name: { type: String },
  industry: { type: String },
  website: { type: String },
  business_email: { type: String },
  business_phone: { type: String },
  country: { type: String },
  city: { type: String },
  note: { type: String },
  interests: { type: String },
  target_people: { type: String },
  location_target: { type: String },
  campaign_idea: { type: String },
  credits: { type: Number, default: 0 },
  credits_expires_at: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);
