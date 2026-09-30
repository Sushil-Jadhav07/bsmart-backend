const mongoose = require('mongoose');
const Address = require('../models/Address');

const REQUIRED_FIELDS = ['name', 'phone', 'address_line1', 'city', 'state', 'pincode'];

const validateAddressBody = (body) => {
  for (const field of REQUIRED_FIELDS) {
    if (!body[field] || !String(body[field]).trim()) {
      return `${field} is required`;
    }
  }
  return null;
};

// ─── List the logged-in user's saved addresses (default first) ──────────────
exports.listAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ user_id: req.userId, isDeleted: false })
      .sort({ is_default: -1, createdAt: -1 })
      .lean();

    return res.json({ success: true, total: addresses.length, addresses });
  } catch (error) {
    console.error('[listAddresses]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Save a new address ───────────────────────────────────────────────────────
exports.createAddress = async (req, res) => {
  try {
    const validationError = validateAddressBody(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const { label, name, phone, address_line1, address_line2, city, state, pincode, country, is_default } = req.body;

    const existingCount = await Address.countDocuments({ user_id: req.userId, isDeleted: false });
    const shouldBeDefault = existingCount === 0 || !!is_default; // first address is always the default

    if (shouldBeDefault) {
      await Address.updateMany({ user_id: req.userId, isDeleted: false }, { is_default: false });
    }

    const address = await Address.create({
      user_id: req.userId,
      label: label || 'Home',
      name: String(name).trim(),
      phone: String(phone).trim(),
      address_line1: String(address_line1).trim(),
      address_line2: address_line2 || '',
      city: String(city).trim(),
      state: String(state).trim(),
      pincode: String(pincode).trim(),
      country: country || 'India',
      is_default: shouldBeDefault,
    });

    return res.status(201).json({ success: true, address });
  } catch (error) {
    console.error('[createAddress]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Update an address (owner only) ──────────────────────────────────────────
exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid address ID' });
    }

    const address = await Address.findOne({ _id: id, user_id: req.userId, isDeleted: false });
    if (!address) return res.status(404).json({ message: 'Address not found' });

    const { label, name, phone, address_line1, address_line2, city, state, pincode, country, is_default } = req.body;

    if (label !== undefined) address.label = label;
    if (name !== undefined) address.name = String(name).trim();
    if (phone !== undefined) address.phone = String(phone).trim();
    if (address_line1 !== undefined) address.address_line1 = String(address_line1).trim();
    if (address_line2 !== undefined) address.address_line2 = address_line2;
    if (city !== undefined) address.city = String(city).trim();
    if (state !== undefined) address.state = String(state).trim();
    if (pincode !== undefined) address.pincode = String(pincode).trim();
    if (country !== undefined) address.country = country;

    if (is_default === true) {
      await Address.updateMany({ user_id: req.userId, isDeleted: false, _id: { $ne: id } }, { is_default: false });
      address.is_default = true;
    }

    await address.save();
    return res.json({ success: true, address });
  } catch (error) {
    console.error('[updateAddress]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Delete an address (owner only, soft delete) ─────────────────────────────
exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid address ID' });
    }

    const address = await Address.findOne({ _id: id, user_id: req.userId, isDeleted: false });
    if (!address) return res.status(404).json({ message: 'Address not found' });

    address.isDeleted = true;
    address.deletedAt = new Date();
    await address.save();

    // If the deleted address was the default, promote the most recently added remaining one.
    if (address.is_default) {
      const next = await Address.findOne({ user_id: req.userId, isDeleted: false }).sort({ createdAt: -1 });
      if (next) {
        next.is_default = true;
        await next.save();
      }
    }

    return res.json({ success: true, message: 'Address deleted' });
  } catch (error) {
    console.error('[deleteAddress]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─── Set an address as the default explicitly ────────────────────────────────
exports.setDefaultAddress = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid address ID' });
    }

    const address = await Address.findOne({ _id: id, user_id: req.userId, isDeleted: false });
    if (!address) return res.status(404).json({ message: 'Address not found' });

    await Address.updateMany({ user_id: req.userId, isDeleted: false, _id: { $ne: id } }, { is_default: false });
    address.is_default = true;
    await address.save();

    return res.json({ success: true, address });
  } catch (error) {
    console.error('[setDefaultAddress]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
