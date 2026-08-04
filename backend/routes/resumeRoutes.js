const express  = require('express');
const multer   = require('multer');
const router   = express.Router();
const { protect } = require('../middleware/auth');
const { uploadResume, getResumeHistory, getResumeById } = require('../controllers/resumeController');

// In-memory storage: the file is held in RAM only (req.file.buffer) and never
// written to disk. Needed for serverless hosts like Vercel, whose filesystem
// is read-only/ephemeral — a disk-based upload would silently fail to persist
// between requests. We only ever need the file transiently anyway (to extract
// its text and hand that to Gemini), so nothing is lost by not saving it.
const upload = multer({
  storage: multer.memoryStorage(),
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
