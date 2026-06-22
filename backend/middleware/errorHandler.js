/**
 * Global error-handling middleware.
 * Must be registered LAST in server.js (after all routes).
 *
 * Express identifies error handlers by their 4-parameter signature (err, req, res, next).
 */
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  // Log full error in development; suppress stack in production
  if (process.env.NODE_ENV !== 'production') {
    console.error('❌ Error:', err);
  } else {
    console.error(`❌ ${err.message}`);
  }

  let statusCode = err.statusCode || res.statusCode === 200 ? 500 : res.statusCode;
  let message    = err.message || 'Internal Server Error';

  // ── Mongoose: bad ObjectId ───────────────────────────────────────────────
  if (err.name === 'CastError') {
    statusCode = 400;
    message    = `Invalid ${err.path}: ${err.value}`;
  }

  // ── Mongoose: duplicate key (e.g. email already exists) ─────────────────
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message    = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
  }

  // ── Mongoose: validation errors ─────────────────────────────────────────
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message    = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  }

  // ── JWT errors (belt-and-suspenders — auth middleware handles these too) ──
  if (err.name === 'JsonWebTokenError')  { statusCode = 401; message = 'Invalid token'; }
  if (err.name === 'TokenExpiredError') { statusCode = 401; message = 'Token expired'  ; }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
