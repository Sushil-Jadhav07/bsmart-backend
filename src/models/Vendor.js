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
  registration_number: { type: String },
  tax_id_or_vat: { type: String },
  year_established: { type: Number, min: 1800, max: 3000 },
  company_type: { type: String },
  industry_category: { type: String },
  business_nature: { type: String },
  service_coverage: { type: String },
  company_description: { type: String },
  social_media_links: [{ type: String }],
  profile_completion_percentage: { type: Number, default: 0, min: 0, max: 100 },
  verification_status: {
    type: String,
    enum: ['draft', 'pending_verification', 'approved', 'rejected'],
    default: 'draft'
  },
  submitted_for_verification_at: { type: Date },
  approved_at: { type: Date },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejected_at: { type: Date },
  rejection_reason: { type: String },
  credits: { type: Number, default: 0 },
  credits_expires_at: { type: Date },
  isDeleted: { type: Boolean, default: false },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);
