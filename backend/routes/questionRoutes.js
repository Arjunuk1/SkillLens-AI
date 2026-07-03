const router = require('express').Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getQuestions, createQuestion, updateQuestion, deleteQuestion, seedQuestions } = require('../controllers/questionController');

router.get('/',         protect, getQuestions);
router.post('/seed',    protect, adminOnly, seedQuestions);
router.post('/',        protect, adminOnly, createQuestion);
router.put('/:id',      protect, adminOnly, updateQuestion);
router.delete('/:id',   protect, adminOnly, deleteQuestion);

module.exports = router;
