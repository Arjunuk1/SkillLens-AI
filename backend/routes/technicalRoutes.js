const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { startTechnical, submitTechnical, getTechnicalHistory } = require('../controllers/technicalController');

router.post('/start',   protect, startTechnical);
router.post('/submit',  protect, submitTechnical);
router.get('/history',  protect, getTechnicalHistory);

module.exports = router;
