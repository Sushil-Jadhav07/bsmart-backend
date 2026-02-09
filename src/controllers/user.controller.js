const User = require('../models/User');
const Post = require('../models/Post');

// Helper to transform post with fileUrl (duplicated from post.controller.js to avoid dependency issues)
const transformPost = (post, baseUrl) => {
  const postObj = post.toObject ? post.toObject() : post;
  
  if (postObj.media && Array.isArray(postObj.media)) {
    postObj.media = postObj.media.map(item => ({
      ...item,
      fileUrl: `${baseUrl}/uploads/${item.fileName}`
    }));
  }
  
  return postObj;
};

// @desc    Get all users (without pagination & search)
// @route   GET /api/users
// @access  Public
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get user profile
// @route   GET /api/users/:id
// @access  Public (or Private depending on requirement)
exports.getUserById = async (req, res) => {
  try {
    const userId = req.params.id;
    
    // 1. Fetch User
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);

  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update user details
// @route   PUT /api/users/:id
// @access  Private
exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if user is authorized (updating own profile or admin)
    // Note: Assuming req.user is populated by auth middleware
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this profile' });
    }

    // Update fields
    const { full_name, bio, avatar_url, phone, username } = req.body;
    
    // Build update object
    const updateFields = {};
    if (full_name) updateFields.full_name = full_name;
    if (bio) updateFields.bio = bio;
    if (avatar_url) updateFields.avatar_url = avatar_url;
    if (phone) updateFields.phone = phone;
    if (username) updateFields.username = username;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private
exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if user is authorized (deleting own profile or admin)
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this profile' });
    }

    // 1. Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 2. Delete user's posts
    await Post.deleteMany({ user_id: userId });

    // 3. Delete user
    await User.findByIdAndDelete(userId);

    res.json({ message: 'User and all associated data deleted successfully' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
