const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: sign a JWT for a given user id
// ─────────────────────────────────────────────────────────────────────────────
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/register
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const registerUser = async (req, res, next) => {
  try {
    const { fullName, email, password, college, branch, year } = req.body;

    // 1. Check for duplicate email
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    // 2. Create user (password hashed by pre-save hook in User model)
    const user = await User.create({
      fullName,
      email,
      password,
      college: college || '',
      branch:  branch  || '',
      year:    year    || undefined,
    });

    // 3. Issue JWT
    const token = signToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: user.toPublicJSON(),
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/login
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1. Find user — explicitly select password (excluded by default)
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // 2. Compare password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // 3. Issue JWT
    const token = signToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: user.toPublicJSON(),
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/auth/profile
// @access  Private (requires protect middleware)
// ─────────────────────────────────────────────────────────────────────────────
const getProfile = async (req, res, next) => {
  try {
    // req.user is populated by the protect middleware
    res.status(200).json({
      success: true,
      user: req.user.toPublicJSON(),
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   PUT /api/auth/profile
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const updateProfile = async (req, res, next) => {
  try {
    const allowed = ['fullName', 'college', 'branch', 'year', 'profilePhoto'];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new:          true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated',
      user: user.toPublicJSON(),
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/logout
// @access  Private
// Note: JWT is stateless — "logout" just tells the client to discard the token.
//       For real revocation you'd maintain a token blacklist (Redis etc.).
// ─────────────────────────────────────────────────────────────────────────────
const logoutUser = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully. Please delete the token on the client.',
  });
};

module.exports = {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  logoutUser,
};
