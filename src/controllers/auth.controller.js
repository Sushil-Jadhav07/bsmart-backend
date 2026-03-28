const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const Member = require('../models/Member');
const Vendor = require('../models/Vendor');
const Otp = require('../models/Otp');
const sendNotification = require('../utils/sendNotification');
const { sendEmail } = require('../services/email.service');
const { otpTemplate, passwordChangedTemplate } = require('../templates/email.templates');
const {
  sendWelcomeEmail,
  sendNewVendorAlert,
} = require('./email.controller');

const generateToken = (id) => {
  const secret = process.env.JWT_SECRET || 'default_secret_key_change_me';
  return jwt.sign({ id }, secret, { expiresIn: '30d' });
};

const normalizeCompanyDetails = (raw = {}) => {
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

const normalizeAddress = (raw = {}) => {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const toStr = (v) => (v === undefined || v === null) ? '' : String(v);
  return {
    address_line1: toStr(obj.address_line1 ?? obj.addressLine1 ?? obj.address_line_1 ?? obj.addressLine_1),
    address_line2: toStr(obj.address_line2 ?? obj.addressLine2 ?? obj.address_line_2 ?? obj.addressLine_2),
    pincode: toStr(obj.pincode ?? obj.pin_code ?? obj.pinCode ?? obj.zip ?? obj.zipcode),
    city: toStr(obj.city),
    state: toStr(obj.state),
    country: toStr(obj.country),
  };
};

const fireAndForget = (label, promise) => {
  promise.catch((err) => console.error(`[Email] ${label} failed:`, err.message));
};

exports.register = async (req, res) => {
  try {
    const {
      email,
      password,
      username,
      full_name,
      phone,
      age,
      gender,
      location,
      address,
      role,
      company_details,
      // ── `credits` is intentionally removed from destructuring.
      // All new users (member & vendor) start with 0 coins.
      // Vendors receive coins only when they purchase a package.
    } = req.body;

    // 0. Role Validation
    if (role && !['member', 'vendor', 'admin', 'sales'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Allowed: member, vendor, admin, sales' });
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

    const normalizedGender = (gender === undefined || gender === null) ? '' : String(gender).toLowerCase().trim();
    if (userRole === 'member' && normalizedGender && !['male', 'female'].includes(normalizedGender)) {
      return res.status(400).json({ message: 'Invalid gender. Allowed: male, female' });
    }

    if (age !== undefined && age !== null) {
      const parsedAge = Number(age);
      if (!Number.isInteger(parsedAge) || parsedAge < 0 || parsedAge > 120) {
        return res.status(400).json({ message: 'Age must be a valid integer between 0 and 120' });
      }
    }

    const memberAddress = userRole === 'member' ? normalizeAddress(address) : undefined;

    const user = await User.create({
      email,
      password: hashedPassword,
      username,
      full_name,
      phone,
      age: (age !== undefined && age !== null) ? Number(age) : null,
      role: userRole,
      gender: userRole === 'member' ? normalizedGender : '',
      location: location || '',
      ...(memberAddress ? { address: memberAddress } : {})
    });

    // ── Wallet always starts at 0 for every role ──────────────────────────
    const wallet = await Wallet.create({
      user_id: user._id,
      balance: 0
    });
    // No VENDOR_REGISTRATION_CREDIT transaction is created here.
    // Coins are granted only when the vendor purchases a package via
    // POST /api/vendor-packages/:packageId/buy

    if (userRole === 'member') {
      await Member.create({ user_id: user._id });
    } else if (userRole === 'sales') {
      const Sales = require('../models/Sales');
      await Sales.create({ user_id: user._id });
    } else if (userRole === 'vendor') {
      const normalizedCompanyDetails = normalizeCompanyDetails(company_details || {});

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
        credits: 0,           // always zero at registration
        credits_expires_at: null
      });
    }

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
        age: user.age,
        gender: user.gender,
        location: user.location,
        ...(userRole === 'member' ? { address: user.address } : {}),
        role: user.role,
        twoFA: {
          enabled: !!user.twoFA?.enabled
        },
        followers_count: user.followers_count,
        following_count: user.following_count,
        wallet: wallet,
        ...(vendorData || {})
      }
    });

    fireAndForget('Welcome email', sendWelcomeEmail({
      ...user.toObject(),
      company_details: userRole === 'vendor'
        ? (vendorData?.company_details || normalizeCompanyDetails(company_details || {}))
        : user.company_details,
    }));

    if (userRole === 'vendor') {
      const adminUsers = await User.find({ role: 'admin' }).select('email').lean();
      const companyName = vendorData?.company_details?.company_name
        || company_details?.company_name
        || username;

      adminUsers
        .filter((admin) => admin.email)
        .forEach((admin) => {
          fireAndForget(
            'New vendor admin alert',
            sendNewVendorAlert({
              adminEmail: admin.email,
              company_name: companyName,
              email: user.email,
              registered_at: user.createdAt,
            })
          );
        });
    }

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
      ticket = await client.verifyIdToken({
        idToken: id_token,
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

    let user = await User.findOne({ email });

    if (!user) {
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
        role: 'member'
      });

      await Wallet.create({ user_id: user._id, balance: 0 });
      await Member.create({ user_id: user._id });

      fireAndForget('Welcome email', sendWelcomeEmail(user));
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        age: user.age,
        gender: user.gender,
        location: user.location,
        role: user.role,
        twoFA: {
          enabled: !!user.twoFA?.enabled
        },
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
        age: user.age,
        gender: user.gender,
        location: user.location,
        role: user.role,
        twoFA: {
          enabled: !!user.twoFA?.enabled
        },
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
    const user = req.user;

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

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
    if (userData.password) delete userData.password;

    if (user.age !== undefined) {
      userData.age = user.age;
    }

    if (wallet) {
      userData.wallet = wallet;
    }
    userData.twoFA = {
      enabled: !!user.twoFA?.enabled
    };
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

    const targetUserId = user_id || req.userId;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Please provide both current and new passwords' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }

    const user = await User.findById(targetUserId).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid current password' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.forgotPasswordCheck = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() })
      .select('email full_name twoFA isDeleted');

    if (!user || user.isDeleted)
      return res.status(404).json({ message: 'No account found with this email.' });

    if (!user.twoFA?.enabled)
      return res.status(403).json({
        message: '2FA is not enabled on this account. You must enable 2FA to reset your password. Please contact support.',
        twoFA_required: true,
      });

    await Otp.deleteMany({ email: user.email, purpose: 'forgot_password_2fa' });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await Otp.create({ email: user.email, otp, purpose: 'forgot_password_2fa', expiresAt });

    await sendEmail({
      to: user.email,
      subject: 'Your B-Smart password reset verification code',
      html: otpTemplate({ full_name: user.full_name || '', otp, purpose: 'forgot_password_2fa', expiresInMinutes: 10 }),
    });

    return res.json({ success: true, message: 'A verification code has been sent to your email.', email: user.email });
  } catch (err) {
    console.error('[Auth] forgotPasswordCheck error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.forgotPasswordVerifyAndReset = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword)
      return res.status(400).json({ message: 'email, otp and newPassword are required' });

    if (newPassword.length < 6)
      return res.status(400).json({ message: 'New password must be at least 6 characters' });

    const record = await Otp.findOne({ email: email.toLowerCase(), purpose: 'forgot_password_2fa', used: false });

    if (!record)
      return res.status(400).json({ message: 'Invalid or expired OTP. Please request a new one.' });

    if (new Date() > record.expiresAt) {
      await record.deleteOne();
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    if (record.otp !== String(otp))
      return res.status(400).json({ message: 'Incorrect OTP. Please try again.' });

    record.used = true;
    await record.save();

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    sendEmail({
      to: user.email,
      subject: 'Your B-Smart password was changed',
      html: passwordChangedTemplate({ full_name: user.full_name }),
    }).catch(err => console.error('[Auth] passwordChanged email failed:', err.message));

    return res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('[Auth] forgotPasswordVerifyAndReset error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
