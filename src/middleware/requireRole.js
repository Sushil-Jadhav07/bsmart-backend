module.exports = (role) => (req, res, next) => {
  try {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  } catch (e) {
    return res.status(403).json({ message: 'Forbidden' });
  }
};

