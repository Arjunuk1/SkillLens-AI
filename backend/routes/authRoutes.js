const express = require('express');
const router  = express.Router();
const { registerUser, loginUser, getProfile, updateProfile, logoutUser } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const validate    = require('../middleware/validate');

router.post('/register', validate(['fullName','email','password']), registerUser);
router.post('/login',    validate(['email','password']),             loginUser);
router.get('/profile',   protect, getProfile);
router.put('/profile',   protect, updateProfile);
router.post('/logout',   protect, logoutUser);
module.exports = router;
