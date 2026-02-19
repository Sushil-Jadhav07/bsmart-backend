const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Member = require('../models/Member');
const Vendor = require('../models/Vendor');

// Helper to generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

exports.register = async (req, res) => {
  try {
    const {
      email,
      password,
      username,
      full_name,
      phone,
      role,
      company_details,
      credits,
      interests,
      target_people,
      location_target,
      campaign_idea
    } = req.body;

    // 0. Role Validation
    if (role && !['member', 'vendor', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Allowed: member, vendor, admin' });
    }

    // 1. Manual Password Validation
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password is required and must be at least 6 characters' });
    }

    // 2. Check if user exists
    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email or username already exists' });
    }

    // 3. Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userRole = role || 'member';

    if (userRole === 'vendor') {
      if (!company_details || !company_details.company_name) {
        return res.status(400).json({ message: 'company_details.company_name is required for vendor role' });
      }
    }

    const user = await User.create({
      email,
      password: hashedPassword,
      username,
      full_name,
      phone,
      role: userRole
    });

    const initialCredits =
      userRole === 'vendor' && Number(credits) > 0 ? Number(credits) : 0;
    const walletBalance = initialCredits;
    const wallet = await Wallet.create({
      user_id: user._id,
      balance: walletBalance
    });

    if (userRole === 'member') {
      await Member.create({ user_id: user._id });
    } else if (userRole === 'vendor') {
      const creditsExpiresAt = initialCredits > 0 ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null;
      await Vendor.create({
        user_id: user._id,
        business_name: company_details.company_name,
        description: company_details.note,
        category: company_details.industry,
        phone: company_details.business_phone || phone,
        address: company_details.city || '',
        logo_url: company_details.logo_url || '',
        company_name: company_details.company_name,
        legal_business_name: company_details.legal_business_name || '',
        industry: company_details.industry || '',
        website: company_details.website || '',
        business_email: company_details.business_email || email,
        business_phone: company_details.business_phone || '',
        country: company_details.country || '',
        city: company_details.city || '',
        note: company_details.note || '',
        interests: interests || '',
        target_people: target_people || '',
        location_target: location_target || '',
        campaign_idea: campaign_idea || '',
        credits: initialCredits,
        credits_expires_at: creditsExpiresAt
      });
    }

    res.status(201).json({
      token: generateToken(user._id),
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        phone: user.phone,
        role: user.role,
        followers_count: user.followers_count,
        following_count: user.following_count,
        wallet: wallet
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (user.role === 'member' && user.is_active === false) {
      return res.status(403).json({ message: 'Account is inactive' });
    }

    const wallet = await Wallet.findOne({ user_id: user._id });

    let vendorPayload = {};
    if (user.role === 'vendor') {
      const vendor = await Vendor.findOne({ user_id: user._id });
      if (vendor) {
        vendorPayload = {
          company_details: {
            company_name: vendor.company_name || '',
            legal_business_name: vendor.legal_business_name || '',
            industry: vendor.industry || '',
            website: vendor.website || '',
            business_email: vendor.business_email || '',
            business_phone: vendor.business_phone || '',
            country: vendor.country || '',
            city: vendor.city || '',
            note: vendor.note || ''
          },
          credits: vendor.credits || 0,
          credits_expires_at: vendor.credits_expires_at || null,
          interests: vendor.interests || '',
          target_people: vendor.target_people || '',
          location_target: vendor.location_target || '',
          campaign_idea: vendor.campaign_idea || '',
          vendor_validated: vendor.validated === true
        };
      }
    }

    res.json({
      token: generateToken(user._id),
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        phone: user.phone,
        role: user.role,
        followers_count: user.followers_count,
        following_count: user.following_count,
        wallet: wallet,
        ...vendorPayload
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    // req.user is already attached by auth middleware
    const user = req.user;

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Fetch wallet explicitly since it's not embedded anymore
    const wallet = await Wallet.findOne({ user_id: user._id });

    const userData = user.toObject();
    if (wallet) {
      userData.wallet = wallet;
    }

    res.json(userData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
