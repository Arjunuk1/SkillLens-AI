const Interview = require('../models/Interview');
const Question  = require('../models/Question');
const Result    = require('../models/Result');
const { evaluateAnswerWithGemini, generateFeedbackReport } = require('../config/gemini');

// POST /api/interview/start  — HR interview
const startInterview = async (req, res, next) => {
  try {
    const { type = 'hr', category = 'HR', count = 10 } = req.body;
    const catMap = { hr: ['HR','Behavioral','Situational'] };
    const cats   = catMap[type] || [category];

    const questions = await Question.aggregate([
      { $match: { type, category: { $in: cats }, isActive: true } },
      { $sample: { size: parseInt(count) } },
    ]);

    if (!questions.length) return res.status(404).json({ success: false, message: 'No questions found. Please seed the database.' });

    const session = await Interview.create({
      user:      req.user._id,
      type,
      category:  type === 'hr' ? null : category,
      questions: questions.map(q => ({ questionId: q._id, text: q.text, answer: '' })),
      status:    'in-progress',
    });

    res.status(201).json({
      success:     true,
      message:     'Interview session started',
      data: {
        sessionId: session._id,
        questions: questions.map(q => ({ id: q._id, text: q.text, difficulty: q.difficulty })),
        totalQuestions: questions.length,
      },
    });
  } catch (err) { next(err); }
};

// POST /api/interview/submit
const submitInterview = async (req, res, next) => {
  try {
    const { sessionId, answers } = req.body;
    if (!sessionId || !answers) return res.status(400).json({ success: false, message: 'sessionId and answers are required' });

    const session = await Interview.findOne({ _id: sessionId, user: req.user._id });
    if (!session)  return res.status(404).json({ success: false, message: 'Interview session not found' });
    if (session.status === 'completed') return res.status(400).json({ success: false, message: 'Session already submitted' });

    // Evaluate each answer with Gemini
    let totalScore = 0;
    const evaluations = [];
    for (const ans of answers) {
      const q    = session.questions.find(q => q.questionId?.toString() === ans.questionId || q.text === ans.question);
      if (!q) continue;
      q.answer   = ans.answer;
      let evalResult = { score: 50, clarity: 50, confidence: 50, structure: 50, relevance: 50, strengths: [], weaknesses: [], suggestions: [], idealAnswer: '' };
      try { evalResult = await evaluateAnswerWithGemini(q.text, ans.answer, session.type); } catch (e) { console.error('Eval error:', e.message); }
      totalScore += evalResult.score || 50;
      evaluations.push({ question: q.text, answer: ans.answer, ...evalResult });
    }

    const avgScore = answers.length ? Math.round(totalScore / answers.length) : 0;

    // Generate full feedback
    let feedback = { overallScore: avgScore, strengths: [], weaknesses: [], suggestions: [], summary: '' };
    try { feedback = await generateFeedbackReport({ type: session.type, evaluations, avgScore }); } catch (e) { console.error('Feedback error:', e.message); }

    // Save result
    const result = await Result.create({
      user:           req.user._id,
      interview:      session._id,
      score:          feedback.overallScore || avgScore,
      communication:  feedback.communication   || avgScore,
      technicalScore: feedback.technicalAccuracy || avgScore,
      confidence:     feedback.confidence      || avgScore,
      clarity:        feedback.clarity         || avgScore,
      problemSolving: feedback.problemSolving  || avgScore,
      strengths:      feedback.strengths       || [],
      weaknesses:     feedback.weaknesses      || [],
      suggestions:    feedback.suggestions     || [],
      aiSummary:      feedback.summary         || '',
    });

    // Mark session complete
    session.score  = feedback.overallScore || avgScore;
    session.status = 'completed';
    await session.save();

    res.json({ success: true, message: 'Interview submitted and evaluated', data: { resultId: result._id, score: result.score, feedback, evaluations } });
  } catch (err) { next(err); }
};

// GET /api/interview/history
const getInterviewHistory = async (req, res, next) => {
  try {
    const sessions = await Interview.find({ user: req.user._id, status: 'completed' })
      .sort({ createdAt: -1 }).limit(20)
      .populate({ path: 'feedback', model: 'Result', foreignField: 'interview', select: 'score' })
      .select('-questions');
    res.json({ success: true, data: sessions });
  } catch (err) { next(err); }
};

// GET /api/interview/:id
const getInterviewById = async (req, res, next) => {
  try {
    const session = await Interview.findOne({ _id: req.params.id, user: req.user._id });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    const result = await Result.findOne({ interview: session._id });
    res.json({ success: true, data: { session, result } });
  } catch (err) { next(err); }
};

module.exports = { startInterview, submitInterview, getInterviewHistory, getInterviewById };
