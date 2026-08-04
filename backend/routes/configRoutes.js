const express = require('express');
const router  = express.Router();

// GET /api/config/google-client
router.get('/google-client', (req, res) => {
  const id = process.env.GOOGLE_CLIENT_ID || '';
  console.log('[configRoutes] GET /api/config/google-client from', req.get('origin') || req.ip);
  if (!id) return res.status(404).json({ success: false, message: 'Google client ID not configured on server' });
  return res.json({ success: true, googleClientId: id });
});

module.exports = router;
