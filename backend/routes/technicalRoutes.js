const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const {
  startTechnical, submitTechnical, getHint,
  toggleBookmark, getBookmarks, getTechnicalHistory,
} = require('../controllers/technicalController');

router.post('/start',      protect, startTechnical);
router.post('/submit',     protect, submitTechnical);
router.post('/hint',       protect, getHint);
router.post('/bookmark',   protect, toggleBookmark);
router.get('/bookmarks',   protect, getBookmarks);
router.get('/history',     protect, getTechnicalHistory);

module.exports = router;
