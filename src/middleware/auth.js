const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // 1. Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Attach user to request object
    const user = await User.findById(decoded.id);
    if (!user) {
        return res.status(401).json({ message: 'User not found' });
    }

    if (user.is_active === false) {
      if (user.ban_type === 'temporary' && user.ban_until) {
        const until = new Date(user.ban_until);
        if (!Number.isNaN(until.getTime()) && until <= new Date()) {
          user.is_active = true;
          user.ban_type = 'none';
          user.ban_until = null;
          user.ban_reason = '';
          user.banned_by = null;
          user.banned_at = null;
          await user.save();
        }
      }
      if (user.is_active === false) {
        const message = user.ban_type === 'permanent'
          ? 'This account has been banned forever.'
          : user.ban_type === 'temporary' && user.ban_until
            ? `This account has been banned and will resume after ${new Date(user.ban_until).toUTCString()}.`
            : 'This account is inactive.';
        return res.status(403).json({
          code: 'ACCOUNT_BANNED',
          ban_type: user.ban_type || 'none',
          ban_until: user.ban_until || null,
          message,
        });
      }
    }

    req.user = user;
    req.userId = user._id; // Keep this for backward compatibility if needed

    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = auth;
