const express = require('express');
const router  = express.Router();

// POST /api/resume/upload
router.post('/upload', (req, res) => {
  res.status(501).json({ success: false, message: 'Resume upload — coming in Phase 4' });
});

// GET /api/resume/history
router.get('/history', (req, res) => {
  res.status(501).json({ success: false, message: 'Resume history — coming in Phase 4' });
});

// GET /api/resume/:id
router.get('/:id', (req, res) => {
  res.status(501).json({ success: false, message: 'Resume detail — coming in Phase 4' });
});

module.exports = router;
