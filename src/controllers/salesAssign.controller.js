const mongoose = require('mongoose');
const User = require('../models/User');
const Vendor = require('../models/Vendor');

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Assign a sales officer to a vendor
// @route   POST /api/sales/assign
// @access  Private (admin only)
// Body: { vendor_user_id, sales_user_id }
// ─────────────────────────────────────────────────────────────────────────────
exports.assignSalesOfficer = async (req, res) => {
  try {
    const { vendor_user_id, sales_user_id } = req.body;

    if (!vendor_user_id || !sales_user_id) {
      return res.status(400).json({ message: 'vendor_user_id and sales_user_id are required' });
    }

    if (!isValidId(vendor_user_id) || !isValidId(sales_user_id)) {
      return res.status(400).json({ message: 'Invalid vendor_user_id or sales_user_id' });
    }

    // Validate sales officer exists and has role 'sales'
    const salesUser = await User.findById(sales_user_id);
    if (!salesUser) {
      return res.status(404).json({ message: 'Sales officer user not found' });
    }
    if (salesUser.role !== 'sales') {
      return res.status(400).json({ message: 'Provided user does not have the sales role' });
    }

    // Validate vendor exists
    const vendor = await Vendor.findOne({ user_id: vendor_user_id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found for given vendor_user_id' });
    }

    // Assign the sales officer
    vendor.assigned_sales_officer = sales_user_id;
    await vendor.save();

    // Return full vendor with populated sales officer details
    const updatedVendor = await Vendor.findById(vendor._id)
      .populate('assigned_sales_officer', '_id username full_name email phone avatar_url');

    return res.status(200).json({
      message: 'Sales officer assigned successfully',
      vendor: updatedVendor
    });

  } catch (error) {
    console.error('[assignSalesOfficer]', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Unassign the sales officer from a vendor
// @route   DELETE /api/sales/assign/:vendor_user_id
// @access  Private (admin only)
// ─────────────────────────────────────────────────────────────────────────────
exports.unassignSalesOfficer = async (req, res) => {
  try {
    const { vendor_user_id } = req.params;

    if (!isValidId(vendor_user_id)) {
      return res.status(400).json({ message: 'Invalid vendor_user_id' });
    }

    const vendor = await Vendor.findOne({ user_id: vendor_user_id });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found for given vendor_user_id' });
    }

    vendor.assigned_sales_officer = null;
    await vendor.save();

    return res.status(200).json({ message: 'Sales officer unassigned successfully' });

  } catch (error) {
    console.error('[unassignSalesOfficer]', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get all users with role 'sales'
// @route   GET /api/sales/officers
// @access  Private (admin only)
// ─────────────────────────────────────────────────────────────────────────────
exports.getAllSalesOfficers = async (req, res) => {
  try {
    const salesUsers = await User.find({ role: 'sales', isDeleted: false })
      .select('_id username full_name email phone avatar_url location createdAt')
      .lean();

    return res.status(200).json({
      total: salesUsers.length,
      sales_officers: salesUsers
    });

  } catch (error) {
    console.error('[getAllSalesOfficers]', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Vendor fetches which sales officer is assigned to them
// @route   GET /api/sales/my-officer
// @access  Private (vendor only)
// ─────────────────────────────────────────────────────────────────────────────
exports.getMyAssignedOfficer = async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ user_id: req.userId })
      .populate('assigned_sales_officer', '_id username full_name email phone avatar_url location');

    if (!vendor) {
      return res.status(404).json({ message: 'Vendor profile not found' });
    }

    if (!vendor.assigned_sales_officer) {
      return res.status(200).json({ message: 'No sales officer assigned yet', assigned_sales_officer: null });
    }

    return res.status(200).json({
      assigned_sales_officer: vendor.assigned_sales_officer
    });

  } catch (error) {
    console.error('[getMyAssignedOfficer]', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get all vendors assigned to a specific sales officer
// @route   GET /api/sales/officers/:sales_user_id/vendors
// @access  Private (admin only)
// ─────────────────────────────────────────────────────────────────────────────
exports.getVendorsAssignedToOfficer = async (req, res) => {
  try {
    const { sales_user_id } = req.params;

    if (!isValidId(sales_user_id)) {
      return res.status(400).json({ message: 'Invalid sales_user_id' });
    }

    const salesUser = await User.findById(sales_user_id);
    if (!salesUser || salesUser.role !== 'sales') {
      return res.status(404).json({ message: 'Sales officer not found' });
    }

    const vendors = await Vendor.find({ assigned_sales_officer: sales_user_id, isDeleted: false })
      .populate('user_id', '_id username full_name email phone avatar_url')
      .lean();

    return res.status(200).json({
      sales_officer: {
        _id: salesUser._id,
        username: salesUser.username,
        full_name: salesUser.full_name,
        email: salesUser.email
      },
      total_vendors: vendors.length,
      vendors
    });

  } catch (error) {
    console.error('[getVendorsAssignedToOfficer]', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};