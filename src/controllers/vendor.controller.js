const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Wallet = require('../models/Wallet');

const normalizeSocialMediaLinks = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map(link => (typeof link === 'string' ? link.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(link => link.trim())
      .filter(Boolean);
  }
  return [];
};

const pickProfileUpdates = (body = {}) => {
  const updates = {};
  const fields = [
    'company_name',
    'legal_business_name',
    'registration_number',
    'tax_id_or_vat',
    'year_established',
    'company_type',
    'industry_category',
    'business_nature',
    'website',
    'business_email',
    'business_phone',
    'address',
    'country',
    'service_coverage',
    'company_description',
    'social_media_links',
    'logo_url',
    'city',
    'note'
  ];

  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      updates[field] = body[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'social_media_links')) {
    updates.social_media_links = normalizeSocialMediaLinks(updates.social_media_links);
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'year_established')) {
    const year = Number(updates.year_established);
    if (!Number.isInteger(year) || year < 1800 || year > 3000) {
      return { error: 'year_established must be a valid year between 1800 and 3000' };
    }
    updates.year_established = year;
  }

  // Keep existing register field names reused and mapped to old compatibility fields.
  if (Object.prototype.hasOwnProperty.call(updates, 'company_name')) {
    updates.business_name = updates.company_name;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'company_description')) {
    updates.description = updates.company_description;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'industry_category')) {
    updates.industry = updates.industry_category;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'business_phone')) {
    updates.phone = updates.business_phone;
  }

  return { updates };
};

const calculateProfileCompletion = (vendor) => {
  const checks = [
    !!vendor.company_name,
    !!vendor.legal_business_name,
    !!vendor.registration_number,
    !!vendor.tax_id_or_vat,
    !!vendor.year_established,
    !!vendor.company_type,
    !!(vendor.industry_category || vendor.industry),
    !!vendor.business_nature,
    !!vendor.website,
    !!vendor.business_email,
    !!(vendor.business_phone || vendor.phone),
    !!vendor.address,
    !!vendor.country,
    !!vendor.service_coverage,
    !!(vendor.company_description || vendor.description),
    Array.isArray(vendor.social_media_links) && vendor.social_media_links.length > 0,
    !!vendor.logo_url
  ];

  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
};

const buildVendorProfilePayload = (vendor, wallet = null) => {
  const profileCompletion = calculateProfileCompletion(vendor);

  const payload = {
    _id: vendor._id,
    user_id: vendor.user_id,
    verification_status: vendor.verification_status || 'draft',
    validated: !!vendor.validated,
    profile_completion_percentage: profileCompletion,
    submitted_for_verification_at: vendor.submitted_for_verification_at || null,
    approved_at: vendor.approved_at || null,
    rejected_at: vendor.rejected_at || null,
    rejection_reason: vendor.rejection_reason || '',
    fields: {
      company_name: vendor.company_name || '',
      legal_business_name: vendor.legal_business_name || '',
      registration_number: vendor.registration_number || '',
      tax_id_or_vat: vendor.tax_id_or_vat || '',
      year_established: vendor.year_established || null,
      company_type: vendor.company_type || '',
      industry_category: vendor.industry_category || vendor.industry || '',
      business_nature: vendor.business_nature || '',
      website: vendor.website || '',
      business_email: vendor.business_email || '',
      business_phone: vendor.business_phone || vendor.phone || '',
      address: vendor.address || '',
      country: vendor.country || '',
      service_coverage: vendor.service_coverage || '',
      company_description: vendor.company_description || vendor.description || '',
      social_media_links: vendor.social_media_links || [],
      logo_url: vendor.logo_url || '',
      city: vendor.city || '',
      note: vendor.note || ''
    }
  };

  if (wallet) payload.wallet = wallet;
  return payload;
};

const getOrCreateVendorByUser = async (userId) => {
  let vendor = await Vendor.findOne({ user_id: userId });
  if (vendor) return vendor;

  const user = await User.findById(userId);
  if (!user) return null;

  vendor = await Vendor.create({
    user_id: userId,
    business_name: user.full_name || user.username || 'Vendor',
    company_name: user.full_name || user.username || 'Vendor',
    business_email: user.email || '',
    business_phone: user.phone || ''
  });

  if (user.role !== 'vendor') {
    user.role = 'vendor';
    await user.save();
  }

  return vendor;
};

exports.listAllVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find({})
      .populate('user_id', 'username full_name avatar_url role phone createdAt updatedAt')
      .sort({ createdAt: -1 });
    const result = vendors.map(v => ({
      _id: v._id,
      validated: !!v.validated,
      business_name: v.business_name,
      user: v.user_id
    }));
    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getVendorById = async (req, res) => {
  try {
    const vendorId = req.params.id;
    const vendor = await Vendor.findById(vendorId)
      .populate('user_id', 'username full_name avatar_url role phone createdAt updatedAt');
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const payload = {
      _id: vendor._id,
      validated: !!vendor.validated,
      business_name: vendor.business_name,
      user: vendor.user_id
    };
    return res.json(payload);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};
exports.createVendor = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      business_name,
      description,
      category,
      phone,
      address,
      logo_url,
      company_name,
      legal_business_name,
      industry,
      website,
      business_email,
      business_phone,
      country,
      city,
      note
    } = req.body || {};
    if (!business_name) return res.status(400).json({ message: 'business_name is required' });
    const existing = await Vendor.findOne({ user_id: userId });
    if (existing) return res.status(400).json({ message: 'Vendor already exists' });
    const vendor = await Vendor.create({
      user_id: userId,
      business_name,
      description,
      category,
      phone,
      address,
      logo_url,
      company_name: company_name || business_name,
      legal_business_name: legal_business_name || '',
      industry: industry || category || '',
      website: website || '',
      business_email: business_email || '',
      business_phone: business_phone || phone || '',
      country: country || '',
      city: city || '',
      note: note || '',
      company_description: description || ''
    });
    vendor.profile_completion_percentage = calculateProfileCompletion(vendor);
    await vendor.save();

    await User.findByIdAndUpdate(userId, { role: 'vendor' });
    await Wallet.updateOne(
      { user_id: userId },
      { $inc: { balance: 5000 }, $setOnInsert: { currency: 'Coins' } },
      { upsert: true }
    );
    const wallet = await Wallet.findOne({ user_id: userId });
    const payload = vendor.toObject();
    payload.wallet = wallet;
    return res.status(201).json(payload);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getMyVendor = async (req, res) => {
  try {
    const userId = req.userId;
    const vendor = await Vendor.findOne({ user_id: userId });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const wallet = await Wallet.findOne({ user_id: userId });
    const payload = vendor.toObject();
    payload.wallet = wallet;
    return res.json(payload);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getVendorByUserId = async (req, res) => {
  try {
    const userId = req.params.id;
    const vendor = await Vendor.findOne({ user_id: userId });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const wallet = await Wallet.findOne({ user_id: userId });
    const payload = vendor.toObject();
    payload.wallet = wallet;
    return res.json(payload);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getMyVendorProfile = async (req, res) => {
  try {
    const vendor = await getOrCreateVendorByUser(req.userId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    vendor.profile_completion_percentage = calculateProfileCompletion(vendor);
    await vendor.save();

    const wallet = await Wallet.findOne({ user_id: req.userId });
    return res.json(buildVendorProfilePayload(vendor, wallet));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateMyVendorProfile = async (req, res) => {
  try {
    const vendor = await getOrCreateVendorByUser(req.userId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const { updates, error } = pickProfileUpdates(req.body);
    if (error) return res.status(400).json({ message: error });

    Object.assign(vendor, updates);
    vendor.profile_completion_percentage = calculateProfileCompletion(vendor);
    if (vendor.verification_status !== 'approved') {
      vendor.verification_status = 'draft';
      vendor.validated = false;
    }

    await vendor.save();
    const wallet = await Wallet.findOne({ user_id: req.userId });
    return res.json({
      message: 'Vendor profile updated',
      data: buildVendorProfilePayload(vendor, wallet)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.saveVendorProfileDraft = async (req, res) => {
  try {
    const vendor = await getOrCreateVendorByUser(req.userId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const { updates, error } = pickProfileUpdates(req.body);
    if (error) return res.status(400).json({ message: error });

    Object.assign(vendor, updates);
    vendor.verification_status = 'draft';
    vendor.validated = false;
    vendor.profile_completion_percentage = calculateProfileCompletion(vendor);
    await vendor.save();

    const wallet = await Wallet.findOne({ user_id: req.userId });
    return res.json({
      message: 'Vendor profile draft saved',
      data: buildVendorProfilePayload(vendor, wallet)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.submitVendorProfileForVerification = async (req, res) => {
  try {
    const vendor = await getOrCreateVendorByUser(req.userId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    vendor.profile_completion_percentage = calculateProfileCompletion(vendor);
    if (vendor.profile_completion_percentage < 100) {
      return res.status(400).json({
        message: 'Vendor profile is incomplete. Please complete all required fields before submission.',
        profile_completion_percentage: vendor.profile_completion_percentage
      });
    }

    vendor.verification_status = 'pending_verification';
    vendor.validated = false;
    vendor.submitted_for_verification_at = new Date();
    vendor.rejected_at = null;
    vendor.rejection_reason = '';
    await vendor.save();

    const wallet = await Wallet.findOne({ user_id: req.userId });
    return res.json({
      message: 'Vendor profile submitted for verification',
      data: buildVendorProfilePayload(vendor, wallet)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.uploadVendorLogo = async (req, res) => {
  try {
    const vendor = await getOrCreateVendorByUser(req.userId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    if (!req.file) return res.status(400).json({ message: 'logo file is required' });

    vendor.logo_url = `/uploads/${req.file.filename}`;
    vendor.profile_completion_percentage = calculateProfileCompletion(vendor);
    if (vendor.verification_status !== 'approved') {
      vendor.verification_status = 'draft';
      vendor.validated = false;
    }

    await vendor.save();
    const wallet = await Wallet.findOne({ user_id: req.userId });
    return res.json({
      message: 'Vendor logo uploaded successfully',
      data: buildVendorProfilePayload(vendor, wallet)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.listVendorProfiles = async (req, res) => {
  try {
    const vendors = await Vendor.find({})
      .populate('user_id', 'username full_name avatar_url role email phone createdAt updatedAt')
      .sort({ createdAt: -1 });

    const payload = vendors.map((vendor) => {
      const profile = buildVendorProfilePayload(vendor);
      return {
        ...profile,
        user: vendor.user_id || null
      };
    });

    return res.json(payload);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getVendorProfileById = async (req, res) => {
  try {
    const vendorId = req.params.id;
    const vendor = await Vendor.findById(vendorId)
      .populate('user_id', 'username full_name avatar_url role email phone createdAt updatedAt');

    if (!vendor) return res.status(404).json({ message: 'Vendor profile not found' });

    const wallet = await Wallet.findOne({ user_id: vendor.user_id?._id || vendor.user_id });
    const payload = buildVendorProfilePayload(vendor, wallet);

    return res.json({
      ...payload,
      user: vendor.user_id || null
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateVendorProfileApprovalStatus = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to approve/reject vendor profiles' });
    }

    const vendorId = req.params.id;
    const { action, rejection_reason } = req.body || {};

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'action must be approve or reject' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    if (action === 'approve') {
      vendor.verification_status = 'approved';
      vendor.validated = true;
      vendor.approved_at = new Date();
      vendor.approved_by = req.user._id;
      vendor.rejected_at = null;
      vendor.rejection_reason = '';
    } else {
      vendor.verification_status = 'rejected';
      vendor.validated = false;
      vendor.rejected_at = new Date();
      vendor.rejection_reason = rejection_reason || '';
      vendor.approved_at = null;
      vendor.approved_by = null;
    }

    vendor.profile_completion_percentage = calculateProfileCompletion(vendor);
    await vendor.save();

    return res.json({
      message: `Vendor profile ${action === 'approve' ? 'approved' : 'rejected'}`,
      data: buildVendorProfilePayload(vendor)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateVendorValidation = async (req, res) => {
  try {
    const vendorId = req.params.id;
    const { validated, admin_user_id } = req.body;
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update vendor validation' });
    }
    if (!admin_user_id) {
      return res.status(400).json({ message: 'admin_user_id is required' });
    }
    if (req.user._id.toString() !== admin_user_id.toString()) {
      return res.status(403).json({ message: 'Admin user mismatch' });
    }
    if (typeof validated !== 'boolean') {
      return res.status(400).json({ message: 'validated must be boolean' });
    }
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    vendor.validated = validated;
    vendor.verification_status = validated ? 'approved' : 'rejected';
    if (validated) {
      vendor.approved_at = new Date();
      vendor.approved_by = req.user._id;
      vendor.rejected_at = null;
      vendor.rejection_reason = '';
    } else {
      vendor.rejected_at = new Date();
    }
    vendor.profile_completion_percentage = calculateProfileCompletion(vendor);
    await vendor.save();
    return res.json({ id: vendor._id, validated: vendor.validated });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};
