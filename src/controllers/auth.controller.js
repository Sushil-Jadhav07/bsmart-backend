const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Member = require('../models/Member');
const Vendor = require('../models/Vendor');
const sendNotification = require('../utils/sendNotification');

// Helper to generate JWT
const generateToken = (id) => {
  const secret = process.env.JWT_SECRET || 'default_secret_key_change_me';
  return jwt.sign({ id }, secret, {
    expiresIn: '30d',
  });
};

// Normalize incoming company_details keys to a consistent structure
const normalizeCompanyDetails = (raw = {}) => {
  // Build a lookup by lowercased key with non-alphanumerics removed
  const map = {};
  Object.keys(raw || {}).forEach((k) => {
    const norm = String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
    map[norm] = raw[k];
  });

  const pick = (...aliases) => {
    for (const a of aliases) {
      const norm = a.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (map[norm] !== undefined && map[norm] !== null) return map[norm];
    }
    return '';
  };

  const yearRaw = pick('Year Established', 'year_established', 'yearEstablished');
  const year_established = yearRaw !== '' ? String(yearRaw) : '';

  return {
    company_name: pick('company_name', 'companyName'),
    registered_name: pick('Registered Name', 'registered_name', 'registeredName', 'legal_business_name', 'legalBusinessName'),
    industry: pick('industry'),
    registration_number: pick('Registration Number', 'registration_number', 'registrationNumber'),
    tax_id: pick('Tax ID / VAT / GST', 'tax_id', 'taxId', 'tax_id_or_vat', 'taxIdOrVat'),
    year_established,
    company_type: pick('Company Type', 'company_type', 'companyType'),
  };
};

exports.register = async (req, res) => {
  try {
    const {
      email,
      password,
      username,
      full_name,
      phone,
      gender,
      location,
      role,
      company_details,
      credits
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
      role: userRole,
      ...(userRole === 'member' ? { gender, location } : {})
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
      
      // Extract fields from company_details with support for custom keys/aliases
      const normalizedCompanyDetails = normalizeCompanyDetails(company_details || {});

      // Persist a snapshot on the User record as requested
      await User.findByIdAndUpdate(user._id, { company_details: normalizedCompanyDetails });

      await Vendor.create({
        user_id: user._id,
        business_name: normalizedCompanyDetails.company_name || username,
        company_details: normalizedCompanyDetails,
        business_details: {},
        online_presence: { address: {} },
        social_media_links: {},
        validated: false,
        profile_completion_percentage: 30,
        credits: initialCredits,
        credits_expires_at: creditsExpiresAt
      });
    }

    // Fetch the created vendor to return in response if role is vendor
    let vendorData = null;
    if (userRole === 'vendor') {
      const vendor = await Vendor.findOne({ user_id: user._id });
      if (vendor) {
        vendorData = {
          company_details: vendor.company_details || {},
          credits: vendor.credits || 0,
          profile_completion_percentage: vendor.profile_completion_percentage || 30,
          vendor_validated: vendor.validated === true
        };
      }
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
        gender: user.gender,
        location: user.location,
        role: user.role,
        followers_count: user.followers_count,
        following_count: user.following_count,
        wallet: wallet,
        ...(vendorData || {})
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Google Login
 * @route POST /api/auth/google/token
 * @access Public
 */
exports.googleLogin = async (req, res) => {
  try {
    const { id_token } = req.body;
    if (!id_token) {
      return res.status(400).json({ message: 'id_token is required' });
    }

    const client = new OAuth2Client();
    let ticket;
    try {
      // Verify the token. 
      // If you have specific CLIENT_IDs to allow, pass them in audience: [CLIENT_ID_1, CLIENT_ID_2]
      ticket = await client.verifyIdToken({
        idToken: id_token,
        // audience: process.env.GOOGLE_CLIENT_ID 
      });
    } catch (e) {
      console.error('Google token verification failed:', e.message);
      return res.status(401).json({ message: 'Invalid Google token' });
    }

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    if (!email) {
      return res.status(400).json({ message: 'Google token does not contain email' });
    }

    // Check if user exists
    let user = await User.findOne({ email });

    if (!user) {
      // Create new user
      // Since Google doesn't provide username, we generate one or use email prefix
      // And we generate a random password since they use Google login
      const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);
      
      const username = email.split('@')[0] + Math.floor(Math.random() * 1000);

      user = await User.create({
        email,
        username,
        full_name: name,
        avatar_url: picture,
        password: hashedPassword,
        role: 'member' // Default role for Google signups
      });

      // Initialize Wallet
      await Wallet.create({
        user_id: user._id,
        balance: 0
      });

      // Initialize Member profile
      await Member.create({ user_id: user._id });
    }

    // Generate JWT
    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        gender: user.gender,
        location: user.location,
        role: user.role,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Google login error:', error);
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

    // Notify all admins when a user logs in
    try {
      const admins = await User.find({ role: 'admin' }).select('_id').lean();
      for (const admin of admins) {
        if (admin._id.toString() !== user._id.toString()) {
          await sendNotification(req.app, {
            recipient: admin._id,
            sender: user._id,
            type: 'login_alert',
            message: `${user.username} (${user.role}) just logged in`,
            link: `/admin/users/${user._id}`
          });
        }
      }
    } catch (notifErr) {
      console.error('Login alert notification error:', notifErr);
    }

    let vendorPayload = {};
    if (user.role === 'vendor') {
      const vendor = await Vendor.findOne({ user_id: user._id });
      if (vendor) {
        vendorPayload = {
          company_details: vendor.company_details || {},
          credits: vendor.credits || 0,
          profile_completion_percentage: vendor.profile_completion_percentage || 0,
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
        gender: user.gender,
        location: user.location,
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

    let vendorData = null;
    if (user.role === 'vendor') {
      const vendor = await Vendor.findOne({ user_id: user._id });
      if (vendor) {
        vendorData = {
          company_details: vendor.company_details || {},
          profile_completion_percentage: vendor.profile_completion_percentage || 30,
          vendor_validated: vendor.validated === true
        };
      }
    }

    const userData = user.toObject();
    if (wallet) {
      userData.wallet = wallet;
    }
    if (vendorData) {
      Object.assign(userData, vendorData);
    }

    res.json(userData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Change password
 * @route POST /api/auth/change-password
 * @access Private
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, user_id } = req.body;
    
    // If user_id is provided in body, use it; otherwise fallback to req.userId (authenticated user)
    const targetUserId = user_id || req.userId;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Please provide both current and new passwords' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }

    // Get user with password field
    const user = await User.findById(targetUserId).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid current password' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
