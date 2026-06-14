const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const Session = require('../models/Session');

const auth = async (req, res, next) => {
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

    // Check if this token's session has been revoked.
    // Old tokens (created before session tracking) have no Session record — allow them through.
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const session = await Session.findOne({ token_hash: tokenHash }, { is_active: 1 }).lean();
    if (session && !session.is_active) {
      return res.status(401).json({ message: 'Session has been revoked. Please log in again.' });
    }
    // Fire-and-forget: bump last_active so sessions list stays fresh
    if (session) {
      Session.updateOne({ token_hash: tokenHash }, { last_active: new Date() }).catch(() => {});
    }

    req.user      = user;
    req.userId    = user._id;
    req.tokenHash = tokenHash;
    req.sessionId = session?._id ?? null;

    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = auth;
