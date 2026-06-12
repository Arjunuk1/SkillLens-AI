const jwt  = require('jsonwebtoken');
const User = require('../models/User');

/**
 * protect
 * Middleware that verifies the JWT sent in the Authorization header.
 * Attaches the decoded user to req.user on success.
 *
 * Usage:  router.get('/profile', protect, profileController)
 */
const protect = async (req, res, next) => {
  let token;

  // Accept: "Authorization: Bearer <token>"
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach fresh user from DB (excludes password via select:false)
    req.user = await User.findById(decoded.id);

    if (!req.user || !req.user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account not found or has been deactivated.',
      });
    }

    next();
  } catch (err) {
    const msg =
      err.name === 'TokenExpiredError'
        ? 'Session expired. Please log in again.'
        : 'Invalid token. Please log in again.';

    return res.status(401).json({ success: false, message: msg });
  }
};

/**
 * adminOnly
 * Must be used AFTER protect.
 * Restricts access to users with role === 'admin'.
 */
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({
    success: false,
    message: 'Access denied. Admins only.',
  });
};

module.exports = { protect, adminOnly };
