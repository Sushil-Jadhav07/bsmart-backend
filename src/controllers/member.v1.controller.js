const mongoose = require('mongoose');
const User = require('../models/User');
const Ad = require('../models/Ad');
const MemberAdAction = require('../models/MemberAdAction');
const runMongoTransaction = require('../utils/runMongoTransaction');

const normalizeAddressInput = (raw = {}) => {
  const toStr = (v) => (v === undefined || v === null) ? '' : String(v);
  return {
    address_line1: toStr(raw.street),
    address_line2: '',
    pincode: toStr(raw.zip),
    city: toStr(raw.city),
    state: toStr(raw.state),
    country: toStr(raw.country),
  };
};

exports.updateMyProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const { gender, address } = req.body || {};

    const validGenders = ['male', 'female', 'other'];
    if (!gender || !validGenders.includes(String(gender).toLowerCase())) {
      return res.status(400).json({ message: 'gender must be one of male,female,other' });
    }
    if (!address || typeof address !== 'object') {
      return res.status(400).json({ message: 'address object is required' });
    }

    let updated;
    await runMongoTransaction({
      work: async (session) => {
        const user = await User.findById(userId).session(session);
        if (!user) {
          const err = new Error('User not found');
          err.statusCode = 404;
          throw err;
        }
        if (user.role !== 'member') {
          const err = new Error('Forbidden');
          err.statusCode = 403;
          throw err;
        }
        user.gender = String(gender).toLowerCase();
        user.address = normalizeAddressInput(address);
        await user.save({ session });
        updated = user;
      },
      fallback: async () => {
        const user = await User.findById(userId);
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }
        if (user.role !== 'member') {
          return res.status(403).json({ message: 'Forbidden' });
        }
        user.gender = String(gender).toLowerCase();
        user.address = normalizeAddressInput(address);
        await user.save();
        updated = user;
      }
    });

    res.json({
      id: updated._id,
      email: updated.email,
      username: updated.username,
      full_name: updated.full_name,
      gender: updated.gender,
      address: updated.address,
      role: updated.role
    });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status !== 500) {
      return res.status(status).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getMyAdTransactions = async (req, res) => {
  try {
    const userId = req.userId;
    const adId = req.params.adId || req.query.adId;
    const filter = { user_id: userId };
    if (adId) {
      if (!mongoose.Types.ObjectId.isValid(adId)) {
        return res.status(400).json({ message: 'Invalid adId' });
      }
      filter.ad_id = adId;
    }
    const records = await MemberAdAction.find(filter).sort({ createdAt: 1 }).lean();
    res.json({ total: records.length, transactions: records });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getVendorTransactions = async (req, res) => {
  try {
    const requester = req.user;
    if (!requester || (requester.role !== 'vendor' && requester.role !== 'admin')) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const { userId, adId } = req.query;
    const filter = {};
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid userId' });
      }
      filter.user_id = userId;
    }
    if (adId) {
      if (!mongoose.Types.ObjectId.isValid(adId)) {
        return res.status(400).json({ message: 'Invalid adId' });
      }
      filter.ad_id = adId;
    }
    if (requester.role === 'vendor') {
      const vendor = await mongoose.model('Vendor').findOne({ user_id: requester._id }).select('_id').lean();
      if (!vendor) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      filter.vendor_id = vendor._id;
    }
    const records = await MemberAdAction.find(filter)
      .sort({ createdAt: 1 })
      .populate('user_id', 'username full_name avatar_url')
      .populate('ad_id', 'caption')
      .lean();
    res.json({ total: records.length, transactions: records });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

