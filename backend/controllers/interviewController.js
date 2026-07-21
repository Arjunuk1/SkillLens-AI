const Interview = require('../models/Interview');
const Question  = require('../models/Question');
const Result    = require('../models/Result');
const { evaluateHRAnswerWithGemini, generateFeedbackReport, generateHint } = require('../config/gemini');

const VALID_CATS  = ['HR', 'Behavioral', 'Situational', 'mixed'];
const VALID_DIFFS = ['easy', 'medium', 'hard', 'mixed'];
const VALID_DURATIONS = [15, 25, 45]; // minutes

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// POST /api/interview/start  — HR / Behavioral / Situational interview
const startInterview = async (req, res, next) => {
  try {
    const { category = 'mixed', difficulty = 'mixed', count = 10, duration, targetRole = '' } = req.body;
    if (!VALID_CATS.includes(category))   return res.status(400).json({ success: false, message: `category must be one of: ${VALID_CATS.join(', ')}` });
    if (!VALID_DIFFS.includes(difficulty)) return res.status(400).json({ success: false, message: `difficulty must be one of: ${VALID_DIFFS.join(', ')}` });

    const total = Math.min(20, Math.max(1, parseInt(count) || 10));
    const durationMin = VALID_DURATIONS.includes(parseInt(duration)) ? parseInt(duration) : (total <= 5 ? 15 : total <= 10 ? 25 : 45);

    const match = { type: 'hr', isActive: true };
    match.category = category === 'mixed' ? { $in: ['HR','Behavioral','Situational'] } : category;
    if (difficulty !== 'mixed') match.difficulty = difficulty;

    let picked = await Question.aggregate([{ $match: match }, { $sample: { size: total } }]);

    // Backfill across difficulty if a narrow combo doesn't have enough questions
    if (picked.length < total) {
      const have = new Set(picked.map(q => q._id.toString()));
      const looseMatch = { type: 'hr', isActive: true };
      looseMatch.category = category === 'mixed' ? { $in: ['HR','Behavioral','Situational'] } : category;
      const backfill = await Question.aggregate([
        { $match: { ...looseMatch, _id: { $nin: [...have].map(id => new (require('mongoose').Types.ObjectId)(id)) } } },
        { $sample: { size: total - picked.length } },
      ]);
      picked = [...picked, ...backfill];
    }

    if (!picked.length) return res.status(404).json({ success: false, message: `No HR questions found for this selection. Please seed the database.` });

    picked = shuffle(picked);

    const session = await Interview.create({
      user: req.user._id, type: 'hr',
      category: category === 'mixed' ? null : category,
      difficulty, durationSeconds: durationMin * 60,
      targetRole: targetRole.trim().slice(0, 200),
      startedAt: new Date(),
      questions: picked.map(q => ({
        questionId: q._id, text: q.text, qType: 'short',
        tags: q.tags || [], difficulty: q.difficulty || 'medium', answer: '',
      })),
      status: 'in-progress',
    });

    res.status(201).json({
      success: true, message: 'Interview session started',
      data: {
        sessionId: session._id, category, difficulty,
        durationSeconds: session.durationSeconds,
        totalQuestions: session.questions.length,
        questions: session.questions.map(q => ({
          id: q.questionId, text: q.text, difficulty: q.difficulty, tags: q.tags,
          category: picked.find(p => p._id.toString() === q.questionId.toString())?.category,
        })),
      },
    });
  } catch (err) { next(err); }
};

// POST /api/interview/submit
const submitInterview = async (req, res, next) => {
  try {
    const { sessionId, answers, timeTakenSeconds } = req.body;
    if (!sessionId || !answers) return res.status(400).json({ success: false, message: 'sessionId and answers are required' });

    const session = await Interview.findOne({ _id: sessionId, user: req.user._id });
    if (!session)  return res.status(404).json({ success: false, message: 'Interview session not found' });
    if (session.status === 'completed') return res.status(400).json({ success: false, message: 'Session already submitted' });

    let totalScore = 0, scoredCount = 0;
    const evaluations = [];
    const topicScores = {}; // category/tag -> {total,count}
    const starTotals = { situation: 0, task: 0, action: 0, result: 0 };
    let starCount = 0;
    const vocalTotals = { pace: 0, confidence: 0, fillerWord: 0, clarity: 0, fillerWordCount: 0 };
    let vocalCount = 0;
    let vocalSummaries = [];

    const addTopicScore = (key, score) => {
      if (!topicScores[key]) topicScores[key] = { total: 0, count: 0 };
      topicScores[key].total += score; topicScores[key].count += 1;
    };

    // ~14MB base64 per clip keeps the full multimodal request safely under
    // Gemini's 20MB inline-data limit once the prompt text is added.
    const MAX_AUDIO_BASE64_CHARS = 14 * 1024 * 1024;

    for (const ans of answers) {
      const q = session.questions.find(q => q.questionId?.toString() === ans.questionId || q.text === ans.question);
      if (!q) continue;
      q.answer = ans.answer;

      let audio = null;
      if (ans.audioBase64 && ans.audioMimeType) {
        if (ans.audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
          console.error(`Audio for question ${q._id} exceeds size limit, skipping voice analysis for this answer.`);
        } else {
          audio = { base64: ans.audioBase64, mimeType: ans.audioMimeType };
        }
      }

      let ev = null;
      // Attempt 1: with audio (if present) for full vocal-delivery analysis.
      // Attempt 2: text-only fallback — protects the interview if the audio
      // format/size causes a transient Gemini failure.
      for (let attempt = 0; attempt < 2 && !ev; attempt++) {
        try { ev = await evaluateHRAnswerWithGemini(q.text, ans.answer, session.targetRole, attempt === 0 ? audio : null); }
        catch (e) { console.error(`Eval error (attempt ${attempt + 1}):`, e.message); }
      }
      if (ev) {
        totalScore += ev.score; scoredCount += 1;
        q.score = ev.score;
        addTopicScore(session.category || 'HR', ev.score);
        starTotals.situation += ev.star.situation; starTotals.task += ev.star.task;
        starTotals.action    += ev.star.action;    starTotals.result += ev.star.result;
        starCount += 1;
        if (ev.vocalDelivery) {
          q.vocalDelivery = ev.vocalDelivery;
          vocalTotals.pace += ev.vocalDelivery.paceScore;
          vocalTotals.confidence += ev.vocalDelivery.confidenceScore;
          vocalTotals.fillerWord += ev.vocalDelivery.fillerWordScore;
          vocalTotals.clarity += ev.vocalDelivery.clarityScore;
          vocalTotals.fillerWordCount += ev.vocalDelivery.fillerWordCount;
          vocalCount += 1;
          if (ev.vocalDelivery.summary) vocalSummaries.push(ev.vocalDelivery.summary);
        }
        evaluations.push({ question: q.text, answer: ans.answer, ...ev });
      } else {
        evaluations.push({ question: q.text, answer: ans.answer, evalFailed: true, message: 'AI evaluation failed for this answer' });
      }
    }

    if (scoredCount === 0) {
      return res.status(502).json({ success: false, message: 'AI evaluation failed for all answers. Please try submitting again.' });
    }

    const avgScore = Math.round(totalScore / scoredCount);
    const vocalDelivery = vocalCount ? {
      paceScore:       Math.round(vocalTotals.pace / vocalCount),
      confidenceScore: Math.round(vocalTotals.confidence / vocalCount),
      fillerWordScore: Math.round(vocalTotals.fillerWord / vocalCount),
      fillerWordCount: vocalTotals.fillerWordCount,
      clarityScore:    Math.round(vocalTotals.clarity / vocalCount),
      summary:         vocalSummaries[0] || '',
      answersAnalyzed: vocalCount,
    } : { paceScore: null, confidenceScore: null, fillerWordScore: null, fillerWordCount: null, clarityScore: null, summary: '', answersAnalyzed: 0 };
    const starBreakdown = starCount ? {
      situation: Math.round(starTotals.situation / starCount),
      task:      Math.round(starTotals.task / starCount),
      action:    Math.round(starTotals.action / starCount),
      result:    Math.round(starTotals.result / starCount),
    } : { situation: null, task: null, action: null, result: null };

    let feedback;
    try { feedback = await generateFeedbackReport({ type: 'hr', category: session.category, targetRole: session.targetRole, evaluations, avgScore }); }
    catch (e) {
      console.error('Feedback error:', e.message);
      feedback = { overallScore: avgScore, strengths: [], weaknesses: [], suggestions: [], summary: `AI summary unavailable (${e.message}). Score is based on ${scoredCount}/${answers.length} evaluated answers.` };
    }

    const topicEntries = Object.entries(topicScores).map(([topic, d]) => ({ topic, avg: Math.round(d.total / d.count) }));
    const strongTopics = topicEntries.filter(t => t.avg >= 70).map(t => t.topic);
    const weakTopics   = topicEntries.filter(t => t.avg < 60).map(t => t.topic);
    const recommendedPractice = [
      ...weakTopics.map(t => `Practice more ${t} questions`),
      ...(feedback.suggestions || []).slice(0, 3),
    ].slice(0, 5);

    const result = await Result.create({
      user: req.user._id, interview: session._id,
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
      timeTakenSeconds: parseInt(timeTakenSeconds) || null,
      strongTopics, weakTopics, recommendedPractice,
      starBreakdown, vocalDelivery,
    });

    session.score  = feedback.overallScore || avgScore;
    session.status = 'completed';
    session.completedAt = new Date();
    await session.save();

    res.json({ success: true, message: 'Interview submitted and evaluated', data: {
      resultId: result._id, score: result.score, timeTakenSeconds: result.timeTakenSeconds,
      feedback, evaluations, starBreakdown, vocalDelivery, strongTopics, weakTopics, recommendedPractice,
    }});
  } catch (err) { next(err); }
};

// POST /api/interview/hint  { sessionId, questionId }
const getHint = async (req, res, next) => {
  try {
    const { sessionId, questionId } = req.body;
    if (!sessionId || !questionId) return res.status(400).json({ success: false, message: 'sessionId and questionId are required' });
    const session = await Interview.findOne({ _id: sessionId, user: req.user._id });
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

// POST /api/interview/bookmark  { sessionId, questionId, bookmarked }
const toggleBookmark = async (req, res, next) => {
  try {
    const { sessionId, questionId, bookmarked } = req.body;
    if (!sessionId || !questionId) return res.status(400).json({ success: false, message: 'sessionId and questionId are required' });
    const session = await Interview.findOne({ _id: sessionId, user: req.user._id });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    const q = session.questions.find(q => q.questionId?.toString() === questionId);
    if (!q) return res.status(404).json({ success: false, message: 'Question not found in this session' });
    q.bookmarked = typeof bookmarked === 'boolean' ? bookmarked : !q.bookmarked;
    await session.save();
    res.json({ success: true, data: { questionId, bookmarked: q.bookmarked } });
  } catch (err) { next(err); }
};

// GET /api/interview/bookmarks
const getBookmarks = async (req, res, next) => {
  try {
    const sessions = await Interview.find({ user: req.user._id, type: 'hr', 'questions.bookmarked': true })
      .select('category questions createdAt');
    const bookmarks = [];
    sessions.forEach(s => {
      s.questions.filter(q => q.bookmarked).forEach(q => {
        bookmarks.push({ sessionId: s._id, questionId: q.questionId, text: q.text, category: s.category || 'HR', difficulty: q.difficulty, savedAt: s.createdAt });
      });
    });
    res.json({ success: true, data: bookmarks });
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

module.exports = { startInterview, submitInterview, getHint, toggleBookmark, getBookmarks, getInterviewHistory, getInterviewById };
