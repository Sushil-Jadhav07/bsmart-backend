const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Member = require('../models/Member');

// Helper to generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { email, password, username, full_name, phone, role } = req.body;

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

    // 4. Create user
    const userRole = role || 'member';
    
    const user = await User.create({
      email,
      password: hashedPassword,
      username,
      full_name,
      phone,
      role: userRole
    });

    // 5. Create Wallet for user
    const initialBalance = userRole === 'vendor' ? 5000 : 0;
    const wallet = await Wallet.create({
      user_id: user._id,
      balance: initialBalance
    });
    if (userRole === 'member') {
      await Member.create({ user_id: user._id });
    }

    // 6. Return response
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

    // 1. Check for email
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // 2. Check password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // 3. Get Wallet
    const wallet = await Wallet.findOne({ user_id: user._id });

    // 4. Return response
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
        wallet: wallet
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
