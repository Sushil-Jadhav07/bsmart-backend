const Sales = require('../models/Sales');
const User = require('../models/User');

// Helper: fetch user fields and merge with sales object
const mergeSalesWithUser = async (sales, userId) => {
  const user = await User.findById(userId)
    .select('_id email username full_name avatar_url phone location')
    .lean();

  const salesObj = sales.toObject ? sales.toObject() : { ...sales };

  return {
    _id: salesObj._id,          // sales profile doc _id
    user_id: salesObj.user_id,
    bio: salesObj.bio,
    territory: salesObj.territory,
    target: salesObj.target,
    createdAt: salesObj.createdAt,
    updatedAt: salesObj.updatedAt,
    // User fields merged in explicitly
    email: user?.email || '',
    username: user?.username || '',
    full_name: user?.full_name || '',
    avatar_url: user?.avatar_url || '',
    phone: user?.phone || '',
    location: user?.location || '',
  };
};

// @desc    Get my sales profile (merged with user info)
// @route   GET /api/sales/me
// @access  Private (sales)
exports.getMySales = async (req, res) => {
  try {
    const sales = await Sales.findOne({ user_id: req.userId });
    if (!sales) return res.status(404).json({ message: 'Sales profile not found' });
    const merged = await mergeSalesWithUser(sales, req.userId);
    return res.json(merged);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get sales profile by user ID (merged with user info)
// @route   GET /api/sales/users/:id
// @access  Private (admin or sales)
exports.getSalesByUserId = async (req, res) => {
  try {
    const sales = await Sales.findOne({ user_id: req.params.id });
    if (!sales) return res.status(404).json({ message: 'Sales profile not found' });
    const merged = await mergeSalesWithUser(sales, req.params.id);
    return res.json(merged);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update my sales profile (merged with user info)
// @route   PUT /api/sales/me
// @access  Private (sales)
exports.updateMySales = async (req, res) => {
  try {
    const { bio, territory, target } = req.body;

    const sales = await Sales.findOneAndUpdate(
      { user_id: req.userId },
      { bio, territory, target },
      { new: true, runValidators: true }
    );

    if (!sales) return res.status(404).json({ message: 'Sales profile not found' });
    const merged = await mergeSalesWithUser(sales, req.userId);
    return res.json(merged);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};