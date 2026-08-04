const mongoose  = require('mongoose');
const Interview = require('../models/Interview');
const Result    = require('../models/Result');
const { generateGroqQuestionSet, evaluateAnswerWithGemini, generateFeedbackReport, generateHint } = require('../config/gemini');

const VALID_CATS  = ['DSA','OOP','DBMS','OS','CN','Web Development'];
const VALID_DIFFS = ['easy','medium','hard','mixed'];
const VALID_DURATIONS = [15, 25]; // minutes

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
    const requestedDuration = parseInt(duration, 10) || 25;
    if (!VALID_DURATIONS.includes(requestedDuration)) return res.status(400).json({ success: false, message: 'Duration must be 15 or 25 minutes' });
    const durationSeconds = requestedDuration * 60;

    const generated = await generateGroqQuestionSet({
      mode: 'technical',
      category,
      difficulty,
      count: total,
    });

    if (!generated.length) {
      return res.status(502).json({ success: false, message: 'Could not generate technical questions right now. Please try again.' });
    }

    const savedQuestions = generated.map((q) => ({
      questionId: new mongoose.Types.ObjectId(),
      text: q.text,
      qType: q.qType,
      options: q.qType === 'mcq' ? q.options : [],
      correctIndex: q.qType === 'mcq' ? q.correctIndex : null,
      tags: q.tags || [q.category, q.qType],
      difficulty: q.difficulty || difficulty,
      answer: '',
    }));

    const session = await Interview.create({
      user: req.user._id, type: 'technical', category, difficulty,
      durationSeconds,
      startedAt: new Date(),
      questions: savedQuestions,
      status: 'in-progress',
    });

    res.status(201).json({ success: true, data: {
      sessionId: session._id, category, difficulty,
      durationSeconds: session.durationSeconds,
      totalQuestions: session.questions.length,
      questions: generated.map((q, index) => ({
        ...toClientQuestion(session.questions[index]),
        text: q.text,
        qType: q.qType,
        difficulty: q.difficulty,
        tags: q.tags,
        options: q.qType === 'mcq' ? q.options : undefined,
      })),
    }});
  } catch (err) { next(err); }
};

// POST /api/technical/quit
const quitTechnical = async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId is required' });

    const session = await Interview.findOne({ _id: sessionId, user: req.user._id, type: 'technical' });
    if (!session) return res.status(404).json({ success: false, message: 'Technical session not found' });
    if (session.status === 'completed') return res.status(400).json({ success: false, message: 'Session already completed' });

    session.status = 'abandoned';
    session.completedAt = new Date();
    await session.save();

    res.json({ success: true, message: 'Technical session ended' });
  } catch (err) { next(err); }
};

// POST /api/technical/submit
const submitTechnical = async (req, res, next) => {
  try {
    const { sessionId, answers, timeTakenSeconds } = req.body;
    if (!sessionId || !answers) return res.status(400).json({ success: false, message: 'sessionId and answers are required' });

    const session = await Interview.findOne({ _id: sessionId, user: req.user._id, type: 'technical' });
    if (!session) return res.status(404).json({ success: false, message: 'Technical session not found' });
    if (session.status !== 'in-progress') return res.status(400).json({ success: false, message: 'Session is no longer active' });

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

    for (const q of session.questions) {
      const ans = answers.find(answer => q.questionId?.toString() === answer.questionId) || { answer: '' };
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

      if (!String(ans.answer || '').trim()) {
        const score = 0;
        totalScore += score; scoredCount += 1;
        addTopicScore(q.tags, score);
        q.score = score;
        evaluations.push({ question: q.text, qType: q.qType, answer: '', score, strengths: [], weaknesses: ['No answer provided'], suggestions: ['Answer this question before submitting.'], idealAnswer: '' });
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
    const answeredCount = evaluations.filter(e => String(e.answer || '').trim()).length;
    if (answeredCount === 0) {
      feedback = { overallScore: 0, communication: 0, technicalAccuracy: 0, confidence: 0, clarity: 0, problemSolving: 0, strengths: [], weaknesses: ['No answers were submitted.'], suggestions: ['Attempt each question before submitting your next test.'], summary: 'No answers were submitted, so this interview received a score of 0/100.' };
    } else {
      try { feedback = await generateFeedbackReport({ type: 'technical', category: session.category, evaluations, avgScore, accuracy }); }
      catch (e) {
        console.error('Feedback error:', e.message);
        feedback = { overallScore: avgScore, strengths: [], weaknesses: [], suggestions: [], summary: `AI summary unavailable (${e.message}). Score is based on ${scoredCount}/${session.questions.length} evaluated answers.` };
      }
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
      score: avgScore,
      communication: feedback.communication ?? avgScore,
      technicalScore: feedback.technicalAccuracy ?? avgScore,
      confidence: feedback.confidence ?? avgScore,
      clarity: feedback.clarity ?? avgScore,
      problemSolving: feedback.problemSolving ?? avgScore,
      strengths: feedback.strengths || [],
      weaknesses: feedback.weaknesses || [],
      suggestions: feedback.suggestions || [],
      aiSummary: feedback.summary || '',
      accuracy,
      timeTakenSeconds: parseInt(timeTakenSeconds) || null,
      strongTopics, weakTopics, recommendedPractice,
    });

    session.score = avgScore;
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

module.exports = { startTechnical, submitTechnical, quitTechnical, getHint, toggleBookmark, getBookmarks, getTechnicalHistory };
