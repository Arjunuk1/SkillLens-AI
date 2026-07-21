const Interview = require('../models/Interview');
const Question  = require('../models/Question');
const Result    = require('../models/Result');
const { evaluateAnswerWithGemini, generateFeedbackReport, generateHint } = require('../config/gemini');

const VALID_CATS  = ['DSA','OOP','DBMS','OS','CN','Web Development'];
const VALID_DIFFS = ['easy','medium','hard','mixed'];
const VALID_DURATIONS = [15, 25, 45]; // minutes

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Strips fields the client must not see before submitting (correct MCQ answer)
const toClientQuestion = (q) => ({
  id: q.questionId || q._id,
  text: q.text,
  qType: q.qType,
  options: q.qType === 'mcq' ? q.options : undefined,
  difficulty: q.difficulty,
  tags: q.tags,
});

// POST /api/technical/start
const startTechnical = async (req, res, next) => {
  try {
    const { category, difficulty = 'mixed', count = 10, duration } = req.body;
    if (!VALID_CATS.includes(category)) return res.status(400).json({ success: false, message: `Category must be one of: ${VALID_CATS.join(', ')}` });
    if (!VALID_DIFFS.includes(difficulty)) return res.status(400).json({ success: false, message: `Difficulty must be one of: ${VALID_DIFFS.join(', ')}` });

    const total = Math.min(30, Math.max(1, parseInt(count) || 10));
    const durationMin = VALID_DURATIONS.includes(parseInt(duration)) ? parseInt(duration) : (total <= 5 ? 15 : total <= 10 ? 25 : 45);

    const baseMatch = { type: 'technical', category, isActive: true };
    if (difficulty !== 'mixed') baseMatch.difficulty = difficulty;

    // Mixed question-type interview: MCQ (fast, objective) + short theory + scenario
    const mcqCount      = Math.max(1, Math.round(total * 0.4));
    const scenarioCount = Math.max(0, Math.round(total * 0.2));
    const shortCount    = Math.max(0, total - mcqCount - scenarioCount);

    const sampleByType = async (qType, n) => {
      if (n <= 0) return [];
      return Question.aggregate([
        { $match: { ...baseMatch, qType } },
        { $sample: { size: n } },
      ]);
    };

    let [mcqQs, scenarioQs, shortQs] = await Promise.all([
      sampleByType('mcq', mcqCount),
      sampleByType('scenario', scenarioCount),
      sampleByType('short', shortCount),
    ]);

    let combined = [...mcqQs, ...scenarioQs, ...shortQs];

    // Backfill from 'short' if the category doesn't have enough of a given type yet
    if (combined.length < total) {
      const have = new Set(combined.map(q => q._id.toString()));
      const backfill = await Question.aggregate([
        { $match: { ...baseMatch, _id: { $nin: [...have].map(id => new (require('mongoose').Types.ObjectId)(id)) } } },
        { $sample: { size: total - combined.length } },
      ]);
      combined = [...combined, ...backfill];
    }

    if (!combined.length) return res.status(404).json({ success: false, message: `No questions found for ${category}${difficulty !== 'mixed' ? ' at ' + difficulty + ' difficulty' : ''}. Please seed the database.` });

    combined = shuffle(combined).slice(0, total);

    const session = await Interview.create({
      user: req.user._id, type: 'technical', category, difficulty,
      durationSeconds: durationMin * 60,
      startedAt: new Date(),
      questions: combined.map(q => ({
        questionId: q._id, text: q.text, qType: q.qType || 'short',
        options: q.options || [], correctIndex: q.correctIndex ?? null,
        tags: q.tags || [], difficulty: q.difficulty || 'medium', answer: '',
      })),
      status: 'in-progress',
    });

    res.status(201).json({ success: true, data: {
      sessionId: session._id, category, difficulty,
      durationSeconds: session.durationSeconds,
      totalQuestions: session.questions.length,
      questions: session.questions.map(toClientQuestion),
    }});
  } catch (err) { next(err); }
};

// POST /api/technical/submit
const submitTechnical = async (req, res, next) => {
  try {
    const { sessionId, answers, timeTakenSeconds } = req.body;
    if (!sessionId || !answers) return res.status(400).json({ success: false, message: 'sessionId and answers are required' });

    const session = await Interview.findOne({ _id: sessionId, user: req.user._id, type: 'technical' });
    if (!session) return res.status(404).json({ success: false, message: 'Technical session not found' });
    if (session.status === 'completed') return res.status(400).json({ success: false, message: 'Already submitted' });

    let totalScore = 0, scoredCount = 0;
    let mcqCorrect = 0, mcqTotal = 0;
    const evaluations = [];
    const topicScores = {}; // tag/category -> {total,count}

    const addTopicScore = (tags, score) => {
      const keys = tags && tags.length ? tags : [session.category];
      keys.forEach(k => {
        if (!topicScores[k]) topicScores[k] = { total: 0, count: 0 };
        topicScores[k].total += score;
        topicScores[k].count += 1;
      });
    };

    for (const ans of answers) {
      const q = session.questions.find(q => q.questionId?.toString() === ans.questionId);
      if (!q) continue;
      q.answer = ans.answer;

      if (q.qType === 'mcq') {
        const selected = parseInt(ans.answer);
        const correct  = Number.isInteger(selected) && selected === q.correctIndex;
        const score    = correct ? 100 : 0;
        mcqTotal += 1;
        if (correct) mcqCorrect += 1;
        totalScore += score; scoredCount += 1;
        addTopicScore(q.tags, score);
        q.score = score; q.correct = correct;
        evaluations.push({
          question: q.text, qType: 'mcq', answer: ans.answer, correct,
          correctIndex: q.correctIndex, options: q.options, score,
        });
        continue;
      }

      // short / scenario -> AI evaluated, with one retry on transient failure
      let ev = null;
      for (let attempt = 0; attempt < 2 && !ev; attempt++) {
        try { ev = await evaluateAnswerWithGemini(q.text, ans.answer, 'technical'); }
        catch (e) { console.error(`Eval error (attempt ${attempt + 1}):`, e.message); }
      }
      if (ev) {
        totalScore += ev.score; scoredCount += 1;
        addTopicScore(q.tags, ev.score);
        q.score = ev.score;
        evaluations.push({ question: q.text, qType: q.qType, answer: ans.answer, ...ev });
      } else {
        evaluations.push({ question: q.text, qType: q.qType, answer: ans.answer, evalFailed: true, message: 'AI evaluation failed for this answer' });
      }
    }

    if (scoredCount === 0) {
      return res.status(502).json({ success: false, message: 'Evaluation failed for all answers. Please try submitting again.' });
    }

    const avgScore = Math.round(totalScore / scoredCount);
    const accuracy = mcqTotal > 0 ? Math.round((mcqCorrect / mcqTotal) * 100) : null;

    let feedback;
    try { feedback = await generateFeedbackReport({ type: 'technical', category: session.category, evaluations, avgScore, accuracy }); }
    catch (e) {
      console.error('Feedback error:', e.message);
      feedback = { overallScore: avgScore, strengths: [], weaknesses: [], suggestions: [], summary: `AI summary unavailable (${e.message}). Score is based on ${scoredCount}/${answers.length} evaluated answers.` };
    }

    // Strong / weak topics from per-tag average scores
    const topicEntries = Object.entries(topicScores).map(([topic, d]) => ({ topic, avg: Math.round(d.total / d.count) }));
    const strongTopics = topicEntries.filter(t => t.avg >= 70).sort((a,b)=>b.avg-a.avg).map(t => t.topic).slice(0, 5);
    const weakTopics   = topicEntries.filter(t => t.avg < 60).sort((a,b)=>a.avg-b.avg).map(t => t.topic).slice(0, 5);

    const recommendedPractice = [
      ...weakTopics.map(t => `Practice more ${t} questions`),
      ...(feedback.suggestions || []).slice(0, 3),
    ].slice(0, 5);

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
      accuracy,
      timeTakenSeconds: parseInt(timeTakenSeconds) || null,
      strongTopics, weakTopics, recommendedPractice,
    });

    session.score = feedback.overallScore || avgScore;
    session.status = 'completed';
    session.completedAt = new Date();
    await session.save();

    res.json({ success: true, data: {
      resultId: result._id, score: result.score, accuracy,
      timeTakenSeconds: result.timeTakenSeconds,
      feedback, evaluations, strongTopics, weakTopics, recommendedPractice,
    }});
  } catch (err) { next(err); }
};

// POST /api/technical/hint  { sessionId, questionId }
const getHint = async (req, res, next) => {
  try {
    const { sessionId, questionId } = req.body;
    if (!sessionId || !questionId) return res.status(400).json({ success: false, message: 'sessionId and questionId are required' });

    const session = await Interview.findOne({ _id: sessionId, user: req.user._id, type: 'technical' });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    const q = session.questions.find(q => q.questionId?.toString() === questionId);
    if (!q) return res.status(404).json({ success: false, message: 'Question not found in this session' });

    let hint;
    try { hint = await generateHint(q.text); }
    catch (e) { return res.status(502).json({ success: false, message: `Hint generation failed: ${e.message}` }); }

    const alreadyUsed = q.hintUsed;
    q.hintUsed = true;
    await session.save();

    res.json({ success: true, data: { hint, alreadyUsed } });
  } catch (err) { next(err); }
};

// POST /api/technical/bookmark  { sessionId, questionId, bookmarked }
const toggleBookmark = async (req, res, next) => {
  try {
    const { sessionId, questionId, bookmarked } = req.body;
    if (!sessionId || !questionId) return res.status(400).json({ success: false, message: 'sessionId and questionId are required' });

    const session = await Interview.findOne({ _id: sessionId, user: req.user._id, type: 'technical' });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    const q = session.questions.find(q => q.questionId?.toString() === questionId);
    if (!q) return res.status(404).json({ success: false, message: 'Question not found in this session' });

    q.bookmarked = typeof bookmarked === 'boolean' ? bookmarked : !q.bookmarked;
    await session.save();

    res.json({ success: true, data: { questionId, bookmarked: q.bookmarked } });
  } catch (err) { next(err); }
};

// GET /api/technical/bookmarks
const getBookmarks = async (req, res, next) => {
  try {
    const sessions = await Interview.find({ user: req.user._id, type: 'technical', 'questions.bookmarked': true })
      .select('category difficulty questions createdAt');

    const bookmarks = [];
    sessions.forEach(s => {
      s.questions.filter(q => q.bookmarked).forEach(q => {
        bookmarks.push({
          sessionId: s._id, questionId: q.questionId, text: q.text,
          qType: q.qType, difficulty: q.difficulty, category: s.category, savedAt: s.createdAt,
        });
      });
    });

    res.json({ success: true, data: bookmarks });
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

module.exports = { startTechnical, submitTechnical, getHint, toggleBookmark, getBookmarks, getTechnicalHistory };
