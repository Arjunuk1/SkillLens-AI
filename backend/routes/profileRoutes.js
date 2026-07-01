const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { getFullProfile, updateProfileFull } = require('../controllers/profileController');

router.get('/',  protect, getFullProfile);
router.put('/',  protect, updateProfileFull);

module.exports = router;
