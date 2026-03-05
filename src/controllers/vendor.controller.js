const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Wallet = require('../models/Wallet');

const calculateProfilePercentage = (vendor) => {
  let percentage = 30; // Base percentage for registered vendor

  // Business Details - 30%
  if (vendor.business_details) {
    const { industry_category, business_nature, service_coverage, country } = vendor.business_details;
    if (industry_category && business_nature && service_coverage && country) {
      percentage += 30;
    }
  }

  // Online Presence - 20%
  if (vendor.online_presence) {
    const { website_url, company_email, phone_number, address } = vendor.online_presence;
    if (website_url && company_email && phone_number && address && 
        address.address_line1 && address.city && address.pincode && address.state && address.country) {
      percentage += 20;
    }
  }

  // Social Media - 10%
  if (vendor.social_media_links) {
    const { instagram, facebook, linkedin, twitter } = vendor.social_media_links;
    if (instagram || facebook || linkedin || twitter) {
      percentage += 10;
    }
  }

  // Company Description - 10%
  if (vendor.company_description && vendor.company_description.trim().length > 0) {
    percentage += 10;
  }

  return Math.min(percentage, 100);
};

exports.updateVendorProfile = async (req, res) => {
  try {
    const { userId } = req.params; // Use userId from path parameter
    const updates = req.body;
    const requesterId = req.userId; // Authenticated user ID

    // Authorization check: User can only update their own profile unless admin
    if (req.user.role !== 'admin' && requesterId.toString() !== userId.toString()) {
        return res.status(403).json({ message: 'Not authorized to update this profile' });
    }

    let vendor = await Vendor.findOne({ user_id: userId });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    // Update fields
    if (updates.business_details) vendor.business_details = { ...vendor.business_details, ...updates.business_details };
    
    // Handle online_presence deep merge carefully
    if (updates.online_presence) {
        vendor.online_presence = {
            ...vendor.online_presence,
            ...updates.online_presence,
            address: { ...(vendor.online_presence?.address || {}), ...(updates.online_presence?.address || {}) }
        };
    }

    if (updates.social_media_links) {
        vendor.social_media_links = {
            ...vendor.social_media_links,
            ...updates.social_media_links
        };
    }
    
    if (updates.company_description) vendor.company_description = updates.company_description;
    
    // Sync company_details if provided
    if (updates.company_details) vendor.company_details = { ...vendor.company_details, ...updates.company_details };

    // Recalculate percentage
    vendor.profile_completion_percentage = calculateProfilePercentage(vendor);

    await vendor.save();

    // Sync relevant fields to User model
    const userUpdates = {};
    if (vendor.online_presence?.phone_number) userUpdates.phone = vendor.online_presence.phone_number;
    if (vendor.company_details?.company_name) userUpdates.full_name = vendor.company_details.company_name;

    if (Object.keys(userUpdates).length > 0) {
      await User.findByIdAndUpdate(userId, userUpdates);
    }

    res.json({
      message: 'Profile updated successfully',
      vendor
    });
  } catch (error) {
    console.error('Update vendor profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getVendorProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const vendor = await Vendor.findOne({ user_id: userId })
      .populate('user_id', 'username full_name avatar_url email phone role');
      
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    res.json(vendor);
  } catch (error) {
    console.error('Get vendor profile error:', error);
    res.status(500).json({ message: 'Server error' });
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
      .populate('user_id', 'username full_name avatar_url role phone email createdAt updatedAt')
      .sort({ createdAt: -1 });
    
    // Return full vendor object with user details embedded
    return res.json(vendors);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteVendorByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    // 1. Delete Vendor Profile
    const vendor = await Vendor.findOneAndDelete({ user_id: userId });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    // 2. Delete User Account (Optional: depending on requirements, usually deleting vendor implies deleting user access too if they are strictly a vendor)
    // Assuming we just want to remove vendor status/profile but keep user? 
    // Or delete user entirely? "delete api for vendor by vendor's userid" usually implies removing the vendor entity.
    // Let's delete the User as well to be clean, or at least reset role.
    // Based on typical admin flows, deleting a user/vendor deletes everything.
    
    await User.findByIdAndDelete(userId);
    await Wallet.findOneAndDelete({ user_id: userId });
    // Also delete associated ads, etc? For now, just vendor/user/wallet.

    return res.json({ message: 'Vendor and associated user account deleted successfully' });
  } catch (error) {
    console.error('Delete vendor error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getAllVendorsForAdmin = async (req, res) => {
  try {
    const vendors = await Vendor.find({})
      .populate('user_id', 'username full_name avatar_url role phone email createdAt updatedAt')
      .sort({ createdAt: -1 });
    
    return res.json(vendors);
  } catch (error) {
    console.error('Get all vendors for admin error:', error);
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

exports.listAllVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find({})
      .populate('user_id', 'username full_name avatar_url role phone createdAt updatedAt')
      .sort({ createdAt: -1 });

    const result = vendors.map(vendor => {
      const vendorObj = vendor.toObject();
      return {
        ...vendorObj,
        user: vendor.user_id
      };
    });

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
