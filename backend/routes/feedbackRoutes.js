const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { generateFeedback, getFeedback, getFeedbackHistory } = require('../controllers/feedbackController');

router.post('/generate',  protect, generateFeedback);
router.get('/history',    protect, getFeedbackHistory);
router.get('/:interviewId', protect, getFeedback);

module.exports = router;
