const express = require('express');
const router  = express.Router();
// const { protect } = require('../middleware/auth');

// ── Stubs — implement in Phase 5 (HR) and Phase 6 (Technical) ────────────────

// POST /api/interview/start
router.post('/start', (req, res) => {
  res.status(501).json({ success: false, message: 'Interview start — coming in Phase 5' });
});

// POST /api/interview/submit
router.post('/submit', (req, res) => {
  res.status(501).json({ success: false, message: 'Interview submit — coming in Phase 5' });
});

// GET /api/interview/history
router.get('/history', (req, res) => {
  res.status(501).json({ success: false, message: 'Interview history — coming in Phase 5' });
});

module.exports = router;
