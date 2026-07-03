const Interview = require('../models/Interview');
const Question  = require('../models/Question');
const Result    = require('../models/Result');
const { evaluateAnswerWithGemini, generateFeedbackReport } = require('../config/gemini');

const VALID_CATS = ['DSA','OOP','DBMS','OS','CN','Web Development'];

// POST /api/technical/start
const startTechnical = async (req, res, next) => {
  try {
    const { category, count = 10 } = req.body;
    if (!VALID_CATS.includes(category)) return res.status(400).json({ success: false, message: `Category must be one of: ${VALID_CATS.join(', ')}` });

    const questions = await Question.aggregate([
      { $match: { type: 'technical', category, isActive: true } },
      { $sample: { size: parseInt(count) } },
    ]);
    if (!questions.length) return res.status(404).json({ success: false, message: `No questions found for ${category}. Please seed the database.` });

    const session = await Interview.create({
      user: req.user._id, type: 'technical', category,
      questions: questions.map(q => ({ questionId: q._id, text: q.text, answer: '' })),
      status: 'in-progress',
    });

    res.status(201).json({ success: true, data: {
      sessionId: session._id, category,
      questions: questions.map(q => ({ id: q._id, text: q.text, difficulty: q.difficulty, tags: q.tags })),
    }});
  } catch (err) { next(err); }
};

// POST /api/technical/submit
const submitTechnical = async (req, res, next) => {
  try {
    const { sessionId, answers } = req.body;
    const session = await Interview.findOne({ _id: sessionId, user: req.user._id, type: 'technical' });
    if (!session) return res.status(404).json({ success: false, message: 'Technical session not found' });
    if (session.status === 'completed') return res.status(400).json({ success: false, message: 'Already submitted' });

    let totalScore = 0;
    const evaluations = [];
    for (const ans of answers) {
      const q = session.questions.find(q => q.questionId?.toString() === ans.questionId);
      if (!q) continue;
      q.answer = ans.answer;
      let ev = { score: 50, clarity: 50, confidence: 50, structure: 50, relevance: 50, strengths: [], weaknesses: [], suggestions: [] };
      try { ev = await evaluateAnswerWithGemini(q.text, ans.answer, 'technical'); } catch(e) {}
      totalScore += ev.score;
      evaluations.push({ question: q.text, answer: ans.answer, ...ev });
    }

    const avgScore = answers.length ? Math.round(totalScore / answers.length) : 0;
    let feedback = { overallScore: avgScore, strengths: [], weaknesses: [], suggestions: [], summary: '' };
    try { feedback = await generateFeedbackReport({ type: 'technical', category: session.category, evaluations, avgScore }); } catch(e) {}

    const result = await Result.create({
      user: req.user._id, interview: session._id,
      score: feedback.overallScore || avgScore,
      communication: feedback.communication || avgScore,
      technicalScore: feedback.technicalAccuracy || avgScore,
      confidence: feedback.confidence || avgScore,
      clarity: feedback.clarity || avgScore,
      problemSolving: feedback.problemSolving || avgScore,
      strengths: feedback.strengths || [],
      weaknesses: feedback.weaknesses || [],
      suggestions: feedback.suggestions || [],
      aiSummary: feedback.summary || '',
    });

    session.score = feedback.overallScore || avgScore;
    session.status = 'completed';
    await session.save();

    res.json({ success: true, data: { resultId: result._id, score: result.score, feedback, evaluations } });
  } catch (err) { next(err); }
};

// GET /api/technical/history
const getTechnicalHistory = async (req, res, next) => {
  try {
    const sessions = await Interview.find({ user: req.user._id, type: 'technical', status: 'completed' })
      .sort({ createdAt: -1 }).limit(20).select('-questions');
    res.json({ success: true, data: sessions });
  } catch (err) { next(err); }
};

module.exports = { startTechnical, submitTechnical, getTechnicalHistory };
