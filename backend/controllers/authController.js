const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Lazy-create OAuth2 client when secret is provided
function makeOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT || `http://localhost:${process.env.PORT || 5173}/api/auth/google/callback`;
  if (!clientId || !clientSecret) return null;
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

// In-memory PKCE store for short-lived code_verifiers keyed by state
const oauthPkceStore = new Map();

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256(buffer) {
  return require('crypto').createHash('sha256').update(buffer).digest();
}

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
      branch: branch || '',
      year: year || undefined,
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
      new: true,
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/google/start
// Returns a redirect to Google's OAuth consent screen (server-side flow).
// Requires GOOGLE_CLIENT_SECRET and GOOGLE_OAUTH_REDIRECT to be set.
// ─────────────────────────────────────────────────────────────────────────────
const startGoogleOAuth = async (req, res, next) => {
  try {
    const client = makeOAuth2Client();
    // If server-side client (with secret) is configured, use it.
    if (client) {
      const url = client.generateAuthUrl({
        access_type: 'offline',
        scope: ['openid', 'profile', 'email'],
        prompt: 'consent',
      });
      return res.redirect(url);
    }

    // PKCE flow (no client secret) — build auth URL with code_challenge
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT || `http://localhost:${process.env.PORT || 5173}/api/auth/google/callback`;
    if (!clientId) {
      return res.status(501).json({ success: false, message: 'Google server-side OAuth not configured on server' });
    }

    const codeVerifier = base64UrlEncode(require('crypto').randomBytes(64));
    const codeChallenge = base64UrlEncode(await sha256(codeVerifier));
    const state = base64UrlEncode(require('crypto').randomBytes(12));

    // store verifier with TTL (5 minutes)
    oauthPkceStore.set(state, codeVerifier);
    setTimeout(() => oauthPkceStore.delete(state), 5 * 60 * 1000);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return res.redirect(url);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/google/callback
// OAuth2 redirect URI handler: exchanges code for tokens, verifies id_token,
// issues our JWT and returns a minimal HTML page that posts the JWT to the
// opener window (popup flow) and closes itself.
// ─────────────────────────────────────────────────────────────────────────────
const handleGoogleOAuthCallback = async (req, res, next) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send('Missing code');

    const client = makeOAuth2Client();
    let idToken = null;

    if (client) {
      const { tokens } = await client.getToken(code);
      idToken = tokens.id_token;
      if (!idToken) return res.status(401).send('No id_token returned by Google');
      const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
      var payload = ticket.getPayload();
      if (!payload || !payload.email) return res.status(401).send('Invalid Google token payload');
    } else {
      // PKCE exchange using token endpoint
      if (!process.env.GOOGLE_CLIENT_SECRET) {
        console.error('[Google OAuth Error] GOOGLE_CLIENT_SECRET is missing in backend/.env');
        return res.status(401).send('Google OAuth configuration error: GOOGLE_CLIENT_SECRET is missing in server environment.');
      }

      const state = req.query.state;
      const codeVerifier = state ? oauthPkceStore.get(state) : null;
      if (!codeVerifier) return res.status(400).send('Missing PKCE verifier or state expired');

      const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT || `http://localhost:${process.env.PORT || 5173}/api/auth/google/callback`;

      const tokenParams = {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      };
      if (process.env.GOOGLE_CLIENT_SECRET) {
        tokenParams.client_secret = process.env.GOOGLE_CLIENT_SECRET;
      }

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(tokenParams).toString(),
      });

      if (!tokenRes.ok) {
        const txt = await tokenRes.text();
        console.error('Token endpoint error:', txt);
        return res.status(401).send('Failed to exchange authorization code');
      }

      const tokenJson = await tokenRes.json();
      idToken = tokenJson.id_token;
      if (!idToken) return res.status(401).send('No id_token returned by Google');

      // Verify id_token using Google's tokeninfo endpoint
      const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
      if (!infoRes.ok) {
        const txt = await infoRes.text();
        console.error('Tokeninfo error:', txt);
        return res.status(401).send('Invalid id_token');
      }
      var payload = await infoRes.json();
      if (!payload || !payload.email) return res.status(401).send('Invalid Google token payload');
      // payload.email_verified may be string 'true' from tokeninfo endpoint
      if (payload.email_verified === 'false' || payload.email_verified === false) {
        return res.status(401).send('Your Google email is not verified.');
      }
      // cleanup used verifier
      oauthPkceStore.delete(state);
    }

    const email = payload.email.toLowerCase().trim();
    let user = await User.findOne({ googleId: payload.sub });
    if (!user) {
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

    if (!user.isActive) return res.status(401).send('This account has been deactivated.');

    const token = signToken(user._id);
    const userPublic = user.toPublicJSON();

    const html = `<!doctype html>
<html>
<head>
  <title>SkillLens AI - Redirecting...</title>
</head>
<body style="font-family: Inter, system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center;">
  <div style="background: #1e293b; padding: 24px 32px; border-radius: 12px; border: 1px solid #334155;">
    <h3 style="margin: 0 0 8px 0; color: #38bdf8;">Authentication Successful!</h3>
    <p style="margin: 0; color: #94a3b8; font-size: 14px;">Redirecting to your dashboard...</p>
  </div>
  <script>
    (function() {
      try {
        const token = ${JSON.stringify(token)};
        const user = ${JSON.stringify(userPublic)};
        
        localStorage.setItem('sl_token', token);
        localStorage.setItem('sl_user', JSON.stringify(user));

        if (window.opener && !window.opener.closed) {
          try { window.opener.localStorage.setItem('sl_token', token); } catch(e){}
          try { window.opener.localStorage.setItem('sl_user', JSON.stringify(user)); } catch(e){}
          try { window.opener.postMessage({ success: true, token: token, user: user }, '*'); } catch(e){}
          try { window.opener.location.href = '/pages/dashboard/dashboard.html'; } catch(e){}
          try { window.close(); } catch(e){}
        }
      } catch (err) {
        console.error('Auth handler error:', err);
      }
      try { window.close(); } catch(e){}
    })();
  </script>
</body>
</html>`;

    res.set('Content-Type', 'text/html');
    return res.send(html);
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
  startGoogleOAuth,
  handleGoogleOAuthCallback,
};
