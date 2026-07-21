const jwt  = require('jsonwebtoken');
const User = require('../models/User');
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

    // Google-authenticated accounts have no password to compare against
    if (user.authProvider === 'google' && !user.password) {
      return res.status(401).json({
        success: false,
        message: 'This account uses Google Sign-In. Please continue with Google instead.',
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

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/google
// @access  Public
// Body: { credential } — the ID token string returned by Google Identity Services
// ─────────────────────────────────────────────────────────────────────────────
const googleAuth = async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ success: false, message: 'Missing Google credential' });
    }

    // Verify the token's signature, audience, and expiry with Google directly —
    // never trust an unverified token from the client.
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (e) {
      console.error('Google token verification failed:', e.message);
      return res.status(401).json({ success: false, message: 'Invalid or expired Google sign-in. Please try again.' });
    }

    if (!payload || !payload.email) {
      return res.status(401).json({ success: false, message: 'Google did not return a valid account.' });
    }
    if (payload.email_verified === false) {
      return res.status(401).json({ success: false, message: 'Your Google email is not verified.' });
    }

    const email = payload.email.toLowerCase().trim();
    let user = await User.findOne({ googleId: payload.sub });

    if (!user) {
      // No account linked to this Google ID yet — check if an email/password
      // account already exists with the same email, and link it instead of
      // creating a duplicate. Otherwise, create a brand-new Google account.
      user = await User.findOne({ email });
      if (user) {
        user.googleId = payload.sub;
        if (!user.profilePhoto && payload.picture) user.profilePhoto = payload.picture;
        await user.save();
      } else {
        user = await User.create({
          fullName: payload.name || email.split('@')[0],
          email,
          googleId: payload.sub,
          authProvider: 'google',
          profilePhoto: payload.picture || '',
        });
      }
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'This account has been deactivated.' });
    }

    const token = signToken(user._id);
    res.status(200).json({
      success: true,
      message: 'Signed in with Google successfully',
      token,
      user: user.toPublicJSON(),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  registerUser,
  loginUser,
  googleAuth,
  getProfile,
  updateProfile,
  logoutUser,
};
