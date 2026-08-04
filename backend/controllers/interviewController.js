const mongoose  = require('mongoose');
const Interview = require('../models/Interview');
const Result    = require('../models/Result');
const { generateGroqQuestionSet, evaluateHRAnswerWithGemini, generateFeedbackReport, generateHint } = require('../config/gemini');

const VALID_CATS  = ['HR', 'Behavioral', 'Situational', 'mixed'];
const VALID_DIFFS = ['easy', 'medium', 'hard', 'mixed'];
const VALID_DURATIONS = [15, 25]; // minutes

// POST /api/interview/start  — HR / Behavioral / Situational interview
const startInterview = async (req, res, next) => {
  try {
    const { category = 'mixed', difficulty = 'mixed', count = 10, duration, targetRole = '' } = req.body;
    if (!VALID_CATS.includes(category))   return res.status(400).json({ success: false, message: `category must be one of: ${VALID_CATS.join(', ')}` });
    if (!VALID_DIFFS.includes(difficulty)) return res.status(400).json({ success: false, message: `difficulty must be one of: ${VALID_DIFFS.join(', ')}` });

    const total = Math.min(20, Math.max(1, parseInt(count, 10) || 10));
    const requestedDuration = parseInt(duration, 10) || 25;
    if (!VALID_DURATIONS.includes(requestedDuration)) return res.status(400).json({ success: false, message: 'Duration must be 15 or 25 minutes' });
    const durationSeconds = requestedDuration * 60;

    const generated = await generateGroqQuestionSet({
      mode: 'hr',
      category,
      difficulty,
      count: total,
      targetRole,
    });

    if (!generated.length) {
      return res.status(502).json({ success: false, message: 'Could not generate HR questions right now. Please try again.' });
    }

    const savedQuestions = generated.map((q) => ({
      questionId: new mongoose.Types.ObjectId(),
      text: q.text,
      qType: 'short',
      tags: q.tags || [q.category],
      difficulty: q.difficulty || difficulty,
      answer: '',
    }));

    const session = await Interview.create({
      user: req.user._id, type: 'hr',
      category: category === 'mixed' ? null : category,
      difficulty, durationSeconds,
      targetRole: targetRole.trim().slice(0, 200),
      startedAt: new Date(),
      questions: savedQuestions,
      status: 'in-progress',
    });

    res.status(201).json({
      success: true, message: 'Interview session started',
      data: {
        sessionId: session._id, category, difficulty,
        durationSeconds: session.durationSeconds,
        totalQuestions: session.questions.length,
        questions: generated.map((q, index) => ({
          id: session.questions[index].questionId,
          text: q.text,
          difficulty: q.difficulty,
          tags: q.tags,
          category: q.category,
          qType: 'short',
        })),
      },
    });
  } catch (err) { next(err); }
};

// POST /api/interview/quit
const quitInterview = async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId is required' });

    const session = await Interview.findOne({ _id: sessionId, user: req.user._id, type: 'hr' });
    if (!session) return res.status(404).json({ success: false, message: 'Interview session not found' });
    if (session.status === 'completed') return res.status(400).json({ success: false, message: 'Session already completed' });

    session.status = 'abandoned';
    session.completedAt = new Date();
    await session.save();

    res.json({ success: true, message: 'Interview session ended' });
  } catch (err) { next(err); }
};

// POST /api/interview/submit
const submitInterview = async (req, res, next) => {
  try {
    const { sessionId, answers, timeTakenSeconds } = req.body;
    if (!sessionId || !answers) return res.status(400).json({ success: false, message: 'sessionId and answers are required' });

    const session = await Interview.findOne({ _id: sessionId, user: req.user._id });
    if (!session)  return res.status(404).json({ success: false, message: 'Interview session not found' });
    if (session.status !== 'in-progress') return res.status(400).json({ success: false, message: 'Session is no longer active' });

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

    for (const q of session.questions) {
      const ans = answers.find(answer => q.questionId?.toString() === answer.questionId || q.text === answer.question) || { answer: '' };
      q.answer = ans.answer;

      if (!String(ans.answer || '').trim()) {
        const score = 0;
        totalScore += score; scoredCount += 1;
        q.score = score;
        addTopicScore(session.category || 'HR', score);
        evaluations.push({ question: q.text, answer: '', score, clarity: 0, confidence: 0, structure: 0, relevance: 0, star: { situation: 0, task: 0, action: 0, result: 0 }, strengths: [], weaknesses: ['No answer provided'], suggestions: ['Answer this question before submitting.'], idealAnswer: '' });
        continue;
      }

      let audio = null;
      if (ans.audioBase64 && ans.audioMimeType) {
        if (ans.audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
          console.error(`[HR-VOCAL] Audio for question ${q._id} exceeds size limit (${ans.audioBase64.length} chars), skipping voice analysis for this answer.`);
        } else {
          // Gemini's documented audio MIME list includes audio/webm, audio/mp4,
          // and audio/opus — but not bare "audio/ogg". Normalize defensively
          // here too, in case a stale cached frontend sends the old label.
          const normalizedMime = ans.audioMimeType === 'audio/ogg' ? 'audio/opus' : ans.audioMimeType;
          audio = { base64: ans.audioBase64, mimeType: normalizedMime };
        }
      } else {
        console.log(`[HR-VOCAL] No audio present for question ${q._id} (text-only answer or recording failed client-side).`);
      }

      let ev = null;
      // Attempt 1: with audio (if present) for full vocal-delivery analysis.
      // Attempt 2: text-only fallback — protects the interview if the audio
      // format/size causes a transient Gemini failure.
      for (let attempt = 0; attempt < 2 && !ev; attempt++) {
        const usingAudio = attempt === 0 && audio;
        try {
          ev = await evaluateHRAnswerWithGemini(q.text, ans.answer, session.targetRole, usingAudio ? audio : null);
          if (usingAudio) {
            console.log(`[HR-VOCAL] Audio attempt succeeded for question ${q._id} (mime=${audio.mimeType}). vocalDelivery ${ev.vocalDelivery ? 'RECEIVED' : 'MISSING from Gemini response'}.`);
          }
        }
        catch (e) {
          console.error(`[HR-VOCAL] Eval error (attempt ${attempt + 1}, ${usingAudio ? `audio mime=${audio.mimeType}` : 'text-only'}):`, e.message);
        }
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
    const answeredCount = evaluations.filter(e => String(e.answer || '').trim()).length;
    if (answeredCount === 0) {
      feedback = { overallScore: 0, communication: 0, technicalAccuracy: 0, confidence: 0, clarity: 0, problemSolving: 0, strengths: [], weaknesses: ['No answers were submitted.'], suggestions: ['Attempt each question before submitting your next test.'], summary: 'No answers were submitted, so this interview received a score of 0/100.' };
    } else {
      try { feedback = await generateFeedbackReport({ type: 'hr', category: session.category, targetRole: session.targetRole, evaluations, avgScore }); }
      catch (e) {
        console.error('Feedback error:', e.message);
        feedback = { overallScore: avgScore, strengths: [], weaknesses: [], suggestions: [], summary: `AI summary unavailable (${e.message}). Score is based on ${scoredCount}/${session.questions.length} evaluated answers.` };
      }
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
      score:          avgScore,
      communication:  feedback.communication ?? avgScore,
      technicalScore: feedback.technicalAccuracy ?? avgScore,
      confidence:     feedback.confidence ?? avgScore,
      clarity:        feedback.clarity ?? avgScore,
      problemSolving: feedback.problemSolving ?? avgScore,
      strengths:      feedback.strengths       || [],
      weaknesses:     feedback.weaknesses      || [],
      suggestions:    feedback.suggestions     || [],
      aiSummary:      feedback.summary         || '',
      timeTakenSeconds: parseInt(timeTakenSeconds) || null,
      strongTopics, weakTopics, recommendedPractice,
      starBreakdown, vocalDelivery,
    });

    session.score  = avgScore;
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

module.exports = { startInterview, submitInterview, quitInterview, getHint, toggleBookmark, getBookmarks, getInterviewHistory, getInterviewById };
