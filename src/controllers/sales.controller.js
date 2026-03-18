const Sales = require('../models/Sales');

// @desc    Get my sales profile
// @route   GET /api/sales/me
// @access  Private (sales)
exports.getMySales = async (req, res) => {
  try {
    const sales = await Sales.findOne({ user_id: req.userId });
    if (!sales) return res.status(404).json({ message: 'Sales profile not found' });
    return res.json(sales);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get sales profile by user ID
// @route   GET /api/sales/users/:id
// @access  Private (admin or sales)
exports.getSalesByUserId = async (req, res) => {
  try {
    const sales = await Sales.findOne({ user_id: req.params.id });
    if (!sales) return res.status(404).json({ message: 'Sales profile not found' });
    return res.json(sales);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update my sales profile
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
    return res.json(sales);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};