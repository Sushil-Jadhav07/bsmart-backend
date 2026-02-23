const jwt = require('jsonwebtoken');
const User = require('../models/User');

const requireAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden - Admin only' });
    }
    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = requireAdmin;
