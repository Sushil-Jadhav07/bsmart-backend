const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Wallet = require('../models/Wallet');

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
    const wallet = await Wallet.findOne({ user_id: vendor.user_id });
    const payload = {
      _id: vendor._id,
      validated: !!vendor.validated,
      business_name: vendor.business_name,
      user: vendor.user_id,
      wallet: wallet ? { balance: wallet.balance, currency: wallet.currency } : null
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
    const { business_name, description, category, phone, address, logo_url } = req.body || {};
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

    // Check if validating for the first time
    const wasNotValidated = !vendor.validated;
    vendor.validated = validated;
    await vendor.save();

    // Credit 5000 coins if validated for the first time
    if (validated && wasNotValidated) {
      await Wallet.updateOne(
        { user_id: vendor.user_id },
        { $inc: { balance: 5000 } },
        { upsert: true }
      );
    }

    return res.json({ id: vendor._id, validated: vendor.validated });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.listValidatedVendors = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const vendors = await Vendor.find({ validated: true, isDeleted: { $ne: true } })
      .populate('user_id', 'username full_name avatar_url role')
      .sort({ createdAt: -1 });
    return res.json(vendors);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.listInvalidatedVendors = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    const vendors = await Vendor.find({ $or: [{ validated: false }, { validated: { $exists: false } }], isDeleted: { $ne: true } })
      .populate('user_id', 'username full_name avatar_url role')
      .sort({ createdAt: -1 });
    return res.json(vendors);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};
