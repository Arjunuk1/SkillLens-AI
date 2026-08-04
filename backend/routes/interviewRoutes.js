const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const {
  startInterview, submitInterview, quitInterview, getHint, toggleBookmark,
  getBookmarks, getInterviewHistory, getInterviewById,
} = require('../controllers/interviewController');

router.post('/start',      protect, startInterview);
router.post('/submit',     protect, submitInterview);
router.post('/quit',       protect, quitInterview);
router.post('/hint',       protect, getHint);
router.post('/bookmark',   protect, toggleBookmark);
router.get('/bookmarks',   protect, getBookmarks);
router.get('/history',     protect, getInterviewHistory);
router.get('/:id',         protect, getInterviewById); // must stay last — wildcard

module.exports = router;
