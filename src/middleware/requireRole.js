/**
 * requireRole middleware
 * Usage:
 *   requireRole('sales')               — single role
 *   requireRole('admin', 'sales')      — any of these roles
 *   requireRole(['admin', 'sales'])    — array syntax also accepted
 */
module.exports = (...roles) => (req, res, next) => {
  try {
    // Flatten in case caller passes an array as first arg
    const allowed = roles.flat();
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  } catch (e) {
    return res.status(403).json({ message: 'Forbidden' });
  }
};