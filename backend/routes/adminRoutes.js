const express = require('express');
const router  = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const {
  addQuestion, bulkUploadQuestions, updateQuestion, deleteQuestion,
  getQuestions, getUsers, getPlatformStats, getMostMissedQuestions,
} = require('../controllers/adminController');

router.use(protect, adminOnly);
router.get('/stats',            getPlatformStats);
router.get('/most-missed',      getMostMissedQuestions);
router.get('/users',            getUsers);
router.get('/questions',        getQuestions);
router.post('/question',        addQuestion);
router.post('/questions/bulk',  bulkUploadQuestions);
router.put('/question/:id',     updateQuestion);
router.delete('/question/:id',  deleteQuestion);

module.exports = router;
