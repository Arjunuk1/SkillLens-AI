const Question  = require('../models/Question');
const User      = require('../models/User');
const Interview = require('../models/Interview');
const Resume    = require('../models/Resume');

const VALID_TYPES = ['hr', 'technical'];
const VALID_QTYPES = ['mcq', 'short', 'scenario'];

const validateQuestionShape = (q) => {
  if (!q.type || !VALID_TYPES.includes(q.type))  return 'type must be "hr" or "technical"';
  if (!q.category)                               return 'category is required';
  if (!q.text || !q.text.trim())                 return 'text is required';
  if (q.qType && !VALID_QTYPES.includes(q.qType)) return `qType must be one of ${VALID_QTYPES.join(', ')}`;
  if ((q.qType || 'short') === 'mcq') {
    if (!Array.isArray(q.options) || q.options.length < 2) return 'mcq questions need at least 2 options';
    if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex >= q.options.length)
      return 'mcq questions need a valid correctIndex pointing into options';
  }
  return null;
};

// POST /api/admin/question
const addQuestion = async (req, res, next) => {
  try {
    const { type, category, text, qType, options, correctIndex, difficulty, tags } = req.body;
    const err = validateQuestionShape(req.body);
    if (err) return res.status(400).json({ success: false, message: err });
    const q = await Question.create({
      type, category, text, qType: qType || 'short',
      options: qType === 'mcq' ? options : [],
      correctIndex: qType === 'mcq' ? correctIndex : null,
      difficulty: difficulty || 'medium', tags: tags || [],
    });
    res.status(201).json({ success: true, message: 'Question added', data: q });
  } catch (err) { next(err); }
};

// POST /api/admin/questions/bulk   { questions: [ {...}, {...} ] }
const bulkUploadQuestions = async (req, res, next) => {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions) || !questions.length) {
      return res.status(400).json({ success: false, message: 'Provide a non-empty "questions" array' });
    }
    if (questions.length > 500) {
      return res.status(400).json({ success: false, message: 'Max 500 questions per bulk upload' });
    }

    const valid = [], errors = [];
    questions.forEach((q, i) => {
      const err = validateQuestionShape(q);
      if (err) { errors.push({ index: i, error: err, text: q.text || '(missing text)' }); return; }
      valid.push({
        type: q.type, category: q.category, text: q.text.trim(),
        qType: q.qType || 'short',
        options: q.qType === 'mcq' ? q.options : [],
        correctIndex: q.qType === 'mcq' ? q.correctIndex : null,
        difficulty: q.difficulty || 'medium', tags: q.tags || [],
      });
    });

    let inserted = [];
    if (valid.length) inserted = await Question.insertMany(valid);

    res.status(errors.length && !inserted.length ? 400 : 201).json({
      success: inserted.length > 0,
      message: `Inserted ${inserted.length} of ${questions.length} questions${errors.length ? `, ${errors.length} failed validation` : ''}`,
      insertedCount: inserted.length,
      errors,
    });
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
    const { type, category, qType, page = 1, limit = 20 } = req.query;
    const filter = { isActive: true };
    if (type)     filter.type     = type;
    if (category) filter.category = category;
    if (qType)    filter.qType    = qType;
    const questions = await Question.find(filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(+limit);
    const total     = await Question.countDocuments(filter);
    res.json({ success: true, data: questions, total, page: +page, pages: Math.ceil(total/limit) });
  } catch (err) { next(err); }
};

// GET /api/admin/users
const getUsers = async (req, res, next) => {
  try {
    const users = await User.find({ isActive: true }).sort({ createdAt: -1 }).select('-password');
    // Attach lightweight per-user activity counts (real data, not fabricated)
    const withCounts = await Promise.all(users.map(async (u) => {
      const [interviewCount, resumeCount] = await Promise.all([
        Interview.countDocuments({ user: u._id, status: 'completed' }),
        Resume.countDocuments({ user: u._id }),
      ]);
      return { ...u.toObject(), interviewCount, resumeCount };
    }));
    res.json({ success: true, count: withCounts.length, data: withCounts });
  } catch (err) { next(err); }
};

// GET /api/admin/stats  — platform-wide analytics, all real DB aggregates
const getPlatformStats = async (req, res, next) => {
  try {
    const [totalUsers, totalInterviews, totalQuestions, totalResumes] = await Promise.all([
      User.countDocuments({ isActive: true }),
      Interview.countDocuments({ status: 'completed' }),
      Question.countDocuments({ isActive: true }),
      Resume.countDocuments({}),
    ]);

    const completed = await Interview.find({ status: 'completed' }).select('score type category createdAt');
    const avgScore = completed.length ? Math.round(completed.reduce((s,i)=>s+i.score,0)/completed.length) : 0;

    const byCategory = {};
    completed.forEach(i => {
      const k = i.category || i.type;
      if (!byCategory[k]) byCategory[k] = { count: 0, totalScore: 0 };
      byCategory[k].count += 1; byCategory[k].totalScore += i.score;
    });
    const categoryBreakdown = Object.entries(byCategory).map(([category, d]) => ({
      category, count: d.count, avgScore: Math.round(d.totalScore / d.count),
    })).sort((a,b) => b.count - a.count);

    // Signups over the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30*86400000);
    const recentUsers = await User.find({ createdAt: { $gte: thirtyDaysAgo } }).select('createdAt');
    const signupsByDay = {};
    recentUsers.forEach(u => {
      const k = u.createdAt.toISOString().slice(0,10);
      signupsByDay[k] = (signupsByDay[k]||0) + 1;
    });

    res.json({ success: true, data: {
      totalUsers, totalInterviews, totalQuestions, totalResumes, avgScore,
      categoryBreakdown, signupsLast30Days: signupsByDay,
    }});
  } catch (err) { next(err); }
};

// GET /api/admin/most-missed  — real per-question performance across all users
const getMostMissedQuestions = async (req, res, next) => {
  try {
    const interviews = await Interview.find({ type: 'technical', status: 'completed', 'questions.score': { $ne: null } })
      .select('questions category');

    const byQuestion = {}; // questionId -> { text, category, qType, attempts, totalScore, missCount }
    interviews.forEach(iv => {
      iv.questions.forEach(q => {
        if (q.score == null) return;
        const key = (q.questionId || q.text).toString();
        if (!byQuestion[key]) byQuestion[key] = { text: q.text, category: iv.category, qType: q.qType, attempts: 0, totalScore: 0, missCount: 0 };
        byQuestion[key].attempts += 1;
        byQuestion[key].totalScore += q.score;
        // "missed" = wrong (mcq) or scored under 50 (short/scenario)
        const missed = q.qType === 'mcq' ? q.correct === false : q.score < 50;
        if (missed) byQuestion[key].missCount += 1;
      });
    });

    const result = Object.values(byQuestion)
      .filter(q => q.attempts >= 2) // need at least a couple attempts for a meaningful signal
      .map(q => ({
        text: q.text, category: q.category, qType: q.qType, attempts: q.attempts,
        avgScore: Math.round(q.totalScore / q.attempts),
        missRate: Math.round((q.missCount / q.attempts) * 100),
      }))
      .sort((a,b) => b.missRate - a.missRate || a.avgScore - b.avgScore)
      .slice(0, 20);

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

module.exports = {
  addQuestion, bulkUploadQuestions, updateQuestion, deleteQuestion,
  getQuestions, getUsers, getPlatformStats, getMostMissedQuestions,
};
