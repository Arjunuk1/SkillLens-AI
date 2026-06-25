const Question = require('../models/Question');
const User     = require('../models/User');
const Interview = require('../models/Interview');

// POST /api/admin/question
const addQuestion = async (req, res, next) => {
  try {
    const { type, category, text, difficulty, tags } = req.body;
    if (!type || !category || !text) return res.status(400).json({ success: false, message: 'type, category and text are required' });
    const q = await Question.create({ type, category, text, difficulty: difficulty || 'medium', tags: tags || [] });
    res.status(201).json({ success: true, message: 'Question added', data: q });
  } catch (err) { next(err); }
};

// PUT /api/admin/question/:id
const updateQuestion = async (req, res, next) => {
  try {
    const q = await Question.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!q) return res.status(404).json({ success: false, message: 'Question not found' });
    res.json({ success: true, data: q });
  } catch (err) { next(err); }
};

// DELETE /api/admin/question/:id
const deleteQuestion = async (req, res, next) => {
  try {
    await Question.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Question deactivated' });
  } catch (err) { next(err); }
};

// GET /api/admin/questions
const getQuestions = async (req, res, next) => {
  try {
    const { type, category, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (type)     filter.type     = type;
    if (category) filter.category = category;
    const questions = await Question.find(filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(+limit);
    const total     = await Question.countDocuments(filter);
    res.json({ success: true, data: questions, total, page: +page, pages: Math.ceil(total/limit) });
  } catch (err) { next(err); }
};

// GET /api/admin/users
const getUsers = async (req, res, next) => {
  try {
    const users = await User.find({ isActive: true }).sort({ createdAt: -1 }).select('-password');
    res.json({ success: true, count: users.length, data: users });
  } catch (err) { next(err); }
};

// GET /api/admin/stats
const getPlatformStats = async (req, res, next) => {
  try {
    const [totalUsers, totalInterviews, totalQuestions] = await Promise.all([
      User.countDocuments({ isActive: true }),
      Interview.countDocuments({ status: 'completed' }),
      Question.countDocuments({ isActive: true }),
    ]);
    res.json({ success: true, data: { totalUsers, totalInterviews, totalQuestions } });
  } catch (err) { next(err); }
};

module.exports = { addQuestion, updateQuestion, deleteQuestion, getQuestions, getUsers, getPlatformStats };
