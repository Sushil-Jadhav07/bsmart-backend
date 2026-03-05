const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Wallet = require('../models/Wallet');

const calculateProfileCompletion = (vendor) => {
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
    'city',
    'note'
  ];
  
  let filledCount = 0;
  fields.forEach(field => {
    if (vendor[field] && String(vendor[field]).trim() !== '') {
      filledCount++;
    }
  });

  if (Array.isArray(vendor.social_media_links) && vendor.social_media_links.length > 0) {
    filledCount++;
  }

  // Total fields = list length + 1 (social_media_links)
  return Math.round((filledCount / (fields.length + 1)) * 100);
};

exports.updateVendorProfileByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    // Check authorization: User can only update their own profile unless admin
    if (req.user._id.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this profile' });
    }

    let vendor = await Vendor.findOne({ user_id: userId });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    // Apply updates
    const allowedFields = [
      'company_name', 'legal_business_name', 'registration_number',
      'tax_id_or_vat', 'year_established', 'company_type', 'industry_category',
      'business_nature', 'website', 'business_email', 'business_phone',
      'address', 'country', 'service_coverage', 'company_description',
      'social_media_links', 'city', 'note'
    ];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        vendor[field] = updates[field];
      }
    });

    // If verification status was approved, reset to draft on update (unless admin)
    if (vendor.verification_status === 'approved' && req.user.role !== 'admin') {
      vendor.verification_status = 'draft';
      vendor.validated = false;
    } else if (vendor.verification_status !== 'pending_verification') {
      // Ensure it's draft if not pending/approved
      vendor.verification_status = 'draft';
    }

    // Recalculate completion
    vendor.profile_completion_percentage = calculateProfileCompletion(vendor);

    await vendor.save();

    // Update User model fields as requested ("saved in user_id also")
    const userUpdates = {};
    if (updates.company_name) userUpdates.full_name = updates.company_name;
    if (updates.business_phone) userUpdates.phone = updates.business_phone;
    
    // Add city and note to User if needed, though they aren't standard User fields.
    // Assuming user wants them synced if possible or just standard ones.
    // Based on "saved in user_id also", it likely means syncing common profile fields.
    
    if (Object.keys(userUpdates).length > 0) {
      await User.findByIdAndUpdate(userId, userUpdates);
    }



    return res.json({
      message: 'Profile updated successfully',
      vendor_details: vendor
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.submitVendorVerificationByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user._id.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const vendor = await Vendor.findOne({ user_id: userId });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    // Check completion threshold (e.g., 70%)
    vendor.profile_completion_percentage = calculateProfileCompletion(vendor);
    if (vendor.profile_completion_percentage < 70) {
      return res.status(400).json({ 
        message: 'Profile completion must be at least 70% to submit for verification',
        current_completion: vendor.profile_completion_percentage
      });
    }

    vendor.verification_status = 'pending_verification';
    vendor.submitted_for_verification_at = new Date();
    await vendor.save();

    return res.json({
      message: 'Profile submitted for verification',
      vendor_details: vendor
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.adminProcessVendorVerification = async (req, res) => {
  try {
    const { userId } = req.params;
    const { action, rejection_reason } = req.body; // action: 'approve' | 'reject'

    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const vendor = await Vendor.findOne({ user_id: userId });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    if (action === 'approve') {
      vendor.verification_status = 'approved';
      vendor.validated = true;
      vendor.approved_at = new Date();
      vendor.approved_by = req.user._id;
      vendor.rejection_reason = null;
      vendor.rejected_at = null;
    } else if (action === 'reject') {
      vendor.verification_status = 'rejected';
      vendor.validated = false;
      vendor.rejected_at = new Date();
      vendor.rejection_reason = rejection_reason || 'Rejected by admin';
      vendor.approved_at = null;
      vendor.approved_by = null;
    } else {
      return res.status(400).json({ message: 'Invalid action. Use "approve" or "reject"' });
    }

    await vendor.save();

    return res.json({
      message: `Vendor profile ${action}d successfully`,
      vendor_details: vendor
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
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

exports.getVendorProfileByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    // 1. Find User to check role
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role !== 'vendor') {
      return res.status(400).json({ message: 'User is not a vendor' });
    }

    // 2. Find Vendor details
    const vendor = await Vendor.findOne({ user_id: userId });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found for this user' });
    }

    // 3. Find Wallet details
    const wallet = await Wallet.findOne({ user_id: userId });

    // 4. Combine data
    const fullProfile = {
      user: user,
      vendor_details: vendor,
      wallet: wallet || null
    };

    return res.json(fullProfile);

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
      logo_url
    });

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
    await vendor.save();
    return res.json({ id: vendor._id, validated: vendor.validated });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};
