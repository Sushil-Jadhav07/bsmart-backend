const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

  // Basic Info (from registration) - 30%
  business_name: { type: String, required: true },
  logo_url: { type: String },
  cover_image_urls: [{ type: String }],

  // Company Details
  company_details: {
    company_name: { type: String },
    registered_name: { type: String },
    industry: { type: String },
    registration_number: { type: String },
    tax_id: { type: String },
    year_established: { type: String },
    company_type: { type: String }
  },

  // Business Details - 20%
  business_details: {
    industry_category: { type: String },
    business_nature: { type: String },
    service_coverage: { type: String },
    country: { type: String }
  },

  // Online Presence - 20%
  online_presence: {
    website_url: { type: String },
    company_email: { type: String },
    phone_number: { type: String },
    address: {
      address_line1: { type: String },
      address_line2: { type: String },
      city: { type: String },
      pincode: { type: String },
      state: { type: String },
      country: { type: String }
    }
  },

  // Social Media - 20%
  social_media_links: {
    instagram: { type: String },
    facebook: { type: String },
    linkedin: { type: String },
    twitter: { type: String }
  },

  // Description - 10%
  company_description: { type: String },

  // Metadata
  validated: { type: Boolean, default: false },
  profile_completion_percentage: { type: Number, default: 30, min: 0, max: 100 },
  credits: { type: Number, default: 0 },
  credits_expires_at: { type: Date },

  // Legacy fields
  description: { type: String },
  category: { type: String },
  phone: { type: String },
  address: { type: String },

  // Assigned Sales Officer
  assigned_sales_officer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  isDeleted: { type: Boolean, default: false },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);