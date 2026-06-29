const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const router   = express.Router();
const { protect } = require('../middleware/auth');
const { uploadResume, getResumeHistory, getResumeById } = require('../controllers/resumeController');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename:    (req, file, cb) => cb(null, `resume_${req.user._id}_${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'), false);
  },
});

router.post('/upload',  protect, (req, res, next) => upload.single('resume')(req, res, (err) => {
  if (err) return res.status(400).json({ success: false, message: err.message });
  next();
}), uploadResume);
router.get('/history',  protect, getResumeHistory);
router.get('/:id',      protect, getResumeById);

module.exports = router;
