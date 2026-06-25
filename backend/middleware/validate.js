/**
 * Lightweight validation helper.
 * Returns a 400 response if any required fields are missing or empty.
 *
 * Usage:
 *   router.post('/register', validate(['fullName','email','password']), registerUser)
 */
const validate = (fields) => (req, res, next) => {
  const missing = fields.filter(
    (f) => req.body[f] === undefined || req.body[f] === null || String(req.body[f]).trim() === ''
  );

  if (missing.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missing.join(', ')}`,
    });
  }

  next();
};

module.exports = validate;
