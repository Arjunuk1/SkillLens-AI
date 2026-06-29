const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { startInterview, submitInterview, getInterviewHistory, getInterviewById } = require('../controllers/interviewController');

router.post('/start',    protect, startInterview);
router.post('/submit',   protect, submitInterview);
router.get('/history',   protect, getInterviewHistory);
router.get('/:id',       protect, getInterviewById);

module.exports = router;
