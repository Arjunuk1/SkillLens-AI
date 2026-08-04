const Question = require('../models/Question');

// GET /api/questions?type=hr&category=DSA
const getQuestions = async (req, res, next) => {
  try {
    const filter = { isActive: true };
    if (req.query.type)     filter.type     = req.query.type;
    if (req.query.category) filter.category = req.query.category;
    const questions = await Question.find(filter).lean();
    res.json({ success: true, count: questions.length, data: questions });
  } catch (err) { next(err); }
};

// POST /api/questions  (admin)
const createQuestion = async (req, res, next) => {
  try {
    const q = await Question.create(req.body);
    res.status(201).json({ success: true, data: q });
  } catch (err) { next(err); }
};

// PUT /api/questions/:id  (admin)
const updateQuestion = async (req, res, next) => {
  try {
    const q = await Question.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!q) return res.status(404).json({ success: false, message: 'Question not found' });
    res.json({ success: true, data: q });
  } catch (err) { next(err); }
};

// DELETE /api/questions/:id  (admin)
const deleteQuestion = async (req, res, next) => {
  try {
    const q = await Question.findByIdAndDelete(req.params.id);
    if (!q) return res.status(404).json({ success: false, message: 'Question not found' });
    res.json({ success: true, message: 'Question deleted' });
  } catch (err) { next(err); }
};

// POST /api/questions/seed  (admin - one-time seed)
const seedQuestions = async (req, res, next) => {
  try {
    const count = await Question.countDocuments();
    res.json({
      success: true,
      message: 'Static seeding is deprecated. Interview questions are generated live by Groq at session start.',
      existingQuestions: count,
    });
  } catch (err) { next(err); }
};

module.exports = { getQuestions, createQuestion, updateQuestion, deleteQuestion, seedQuestions };
