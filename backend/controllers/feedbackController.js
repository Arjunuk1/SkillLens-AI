const Result   = require('../models/Result');
const Interview = require('../models/Interview');
const { generateFeedbackReport } = require('../config/gemini');

// POST /api/feedback/generate
const generateFeedback = async (req, res, next) => {
  try {
    const { interviewId } = req.body;
    const session = await Interview.findOne({ _id: interviewId, user: req.user._id });
    if (!session) return res.status(404).json({ success: false, message: 'Interview session not found' });

    const existing = await Result.findOne({ interview: interviewId });
    if (existing) return res.json({ success: true, message: 'Feedback already exists', data: existing });

    const feedback = await generateFeedbackReport({ type: session.type, questions: session.questions, score: session.score });
    const result   = await Result.create({ user: req.user._id, interview: interviewId, score: feedback.overallScore || session.score, ...feedback });

    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
};

// GET /api/feedback/:interviewId
const getFeedback = async (req, res, next) => {
  try {
    const result = await Result.findOne({ interview: req.params.interviewId, user: req.user._id });
    if (!result) return res.status(404).json({ success: false, message: 'Feedback not found' });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// GET /api/feedback/history
const getFeedbackHistory = async (req, res, next) => {
  try {
    const results = await Result.find({ user: req.user._id })
      .sort({ createdAt: -1 }).limit(10)
      .populate('interview', 'type category createdAt');
    res.json({ success: true, data: results });
  } catch (err) { next(err); }
};

module.exports = { generateFeedback, getFeedback, getFeedbackHistory };
