const { GoogleGenAI } = require('@google/genai');

// ── Client setup ──────────────────────────────────────────────────────────
// NOTE: The old '@google/generative-ai' SDK is fully deprecated/retired by
// Google, and the old model name 'gemini-pro' no longer exists on the API.
// This uses the current unified SDK + a current model alias that Google
// keeps pointed at their latest fast model, so it won't silently rot again.
let _client = null;
const getClient = () => {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set in .env');
  if (!_client) _client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _client;
};

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const parseKeyList = (value) => (value || '')
  .split(/[\s,;]+/)
  .map((key) => key.trim())
  .filter(Boolean);

const GROQ_API_KEYS = parseKeyList(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY);
let groqKeyCursor = 0;

const getCurrentGroqKey = () => {
  if (!GROQ_API_KEYS.length) throw new Error('GROQ_API_KEYS not set in .env');
  return GROQ_API_KEYS[groqKeyCursor % GROQ_API_KEYS.length];
};

const advanceGroqKey = () => {
  if (!GROQ_API_KEYS.length) throw new Error('GROQ_API_KEYS not set in .env');
  groqKeyCursor = (groqKeyCursor + 1) % GROQ_API_KEYS.length;
};

const safeJSON = (text) => {
  try {
    const match = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? (match[1] || match[0]) : text);
  } catch { return null; }
};

const groqErrorMessage = (response, body) => body?.error?.message || body?.message || `Groq request failed with status ${response.status}`;

const isGroqKeyError = (response, message) => {
  const text = String(message || '').toLowerCase();
  return [401, 403, 429].includes(response.status) || text.includes('quota') || text.includes('rate limit') || text.includes('invalid') || text.includes('unauthorized');
};

const callGroq = async (prompt) => {
  if (!GROQ_API_KEYS.length) throw new Error('GROQ_API_KEYS not set in .env');

  let lastError = null;
  for (let attempt = 0; attempt < GROQ_API_KEYS.length; attempt++) {
    const apiKey = getCurrentGroqKey();
    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: 'Return only valid JSON. No markdown, no commentary.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message = groqErrorMessage(response, body);
        if (isGroqKeyError(response, message) && attempt < GROQ_API_KEYS.length - 1) {
          lastError = new Error(message);
          advanceGroqKey();
          continue;
        }
        throw new Error(message);
      }

      const text = body?.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('Groq returned an empty response');
      const parsed = safeJSON(text);
      if (!parsed) throw new Error('Could not parse Groq JSON response');
      return parsed;
    } catch (e) {
      lastError = e;
      break;
    }
  }

  throw new Error(`Groq request failed: ${lastError?.message || 'unknown error'}`);
};

// Wraps the Gemini call with a Groq fallback so AI failures degrade to a
// second provider instead of masquerading as a fake "AI said 50" score.
const callGeminiPrimary = async (prompt) => {
  const ai = getClient();
  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
  } catch (e) {
    const msg = e?.message || String(e);
    if (msg.includes('API key not valid') || msg.includes('API_KEY_INVALID')) {
      throw new Error('Gemini API key is invalid. Check GEMINI_API_KEY in .env');
    }
    if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
      throw new Error(`Gemini model "${MODEL}" not found/unsupported for this API key.`);
    }
    if (msg.includes('429') || msg.toLowerCase().includes('quota')) {
      throw new Error('Gemini API quota/rate limit exceeded. Try again shortly.');
    }
    if (msg.includes('413') || msg.toLowerCase().includes('too large') || msg.toLowerCase().includes('payload')) {
      throw new Error('Audio/content payload too large for Gemini (20MB inline limit).');
    }
    if (msg.toLowerCase().includes('mime') || msg.toLowerCase().includes('unsupported') && msg.toLowerCase().includes('format')) {
      throw new Error('Gemini could not process this audio format.');
    }
    throw new Error(`Gemini request failed: ${msg}`);
  }

  const text = response?.text;
  if (!text) throw new Error('Gemini returned an empty response');
  const parsed = safeJSON(text);
  if (!parsed) throw new Error('Could not parse Gemini JSON response');
  return parsed;
};

const callGemini = async (prompt, groqPrompt = null) => {
  try {
    return await callGeminiPrimary(prompt);
  } catch (geminiError) {
    const fallbackPrompt = groqPrompt || (typeof prompt === 'string' ? prompt : null);
    if (!fallbackPrompt) throw geminiError;

    console.warn(`Gemini failed, falling back to Groq: ${geminiError.message}`);
    try {
      return await callGroq(fallbackPrompt);
    } catch (groqError) {
      throw new Error(`Gemini failed (${geminiError.message}); Groq fallback failed (${groqError.message})`);
    }
  }
};

// ── Resume Analysis ──────────────────────────────────────────────────────────
const analyzeResumeWithGemini = async (resumeText) => {
  const prompt = `You are an expert ATS resume analyzer. Analyze the following resume carefully and return ONLY a JSON object (no markdown, no commentary) with this exact structure:
{
  "atsScore": <number 0-100, be genuinely discriminating - a weak resume should score under 50, a strong one over 80>,
  "skillsFound": ["skill1","skill2","skill3"],
  "strengths": ["specific strength 1","specific strength 2","specific strength 3"],
  "weakAreas": ["specific weakness 1","specific weakness 2"],
  "missingSkills": ["skill1","skill2","skill3"],
  "suggestions": ["actionable suggestion 1","actionable suggestion 2","actionable suggestion 3"],
  "projectsAnalysis": "<1-2 sentence assessment of the projects section - are descriptions strong and outcome-focused, or vague/underexplained? If no projects are present, say so.>",
  "recruiterImpression": <number 0-10 with one decimal, e.g. 7.5 - genuinely discriminating first-impression score a recruiter would give this resume in a 10-second scan>
}
Base every field on the actual content below - do not use generic placeholders. "skillsFound" should list real technical/professional skills you can identify directly in the resume text.
Resume text:
${resumeText.substring(0, 6000)}`;

  const parsed = await callGemini(prompt);
  return {
    atsScore:      Math.min(100, Math.max(0, parseInt(parsed.atsScore))) || 0,
    skillsFound:   Array.isArray(parsed.skillsFound)   ? parsed.skillsFound   : [],
    strengths:     Array.isArray(parsed.strengths)     ? parsed.strengths     : [],
    weakAreas:     Array.isArray(parsed.weakAreas)     ? parsed.weakAreas     : [],
    missingSkills: Array.isArray(parsed.missingSkills) ? parsed.missingSkills : [],
    suggestions:   Array.isArray(parsed.suggestions)   ? parsed.suggestions   : [],
    projectsAnalysis: typeof parsed.projectsAnalysis === 'string' ? parsed.projectsAnalysis : '',
    recruiterImpression: (typeof parsed.recruiterImpression === 'number' && !isNaN(parsed.recruiterImpression))
      ? Math.min(10, Math.max(0, Math.round(parsed.recruiterImpression * 10) / 10)) : null,
  };
};

// ── Interview Answer Evaluation ──────────────────────────────────────────────
const evaluateAnswerWithGemini = async (question, answer, type = 'hr') => {
  const prompt = `You are an expert ${type === 'hr' ? 'HR interviewer' : 'technical interviewer'}. Evaluate this interview answer carefully and return ONLY JSON (no markdown, no commentary):
{
  "score": <number 0-100>,
  "clarity": <number 0-100>,
  "confidence": <number 0-100>,
  "structure": <number 0-100>,
  "relevance": <number 0-100>,
  "strengths": ["strength1","strength2"],
  "weaknesses": ["weakness1","weakness2"],
  "suggestions": ["suggestion1","suggestion2"],
  "idealAnswer": "<brief ideal answer>"
}
Score factual correctness and whether the answer addresses what the question asks—never answer length, writing style, or similarity to an ideal-answer phrasing. A short, direct answer that is fully correct must receive 100/100 when the question can be fully answered briefly. Accept alternate terminology, valid examples, and equivalent explanations. Only deduct for a genuine factual error or for an explicitly requested part of the question that is missing. Use this rubric: 90-100 = fully correct; 80-89 = correct with a minor omission only when the question explicitly requires more detail; 40-79 = partly correct; 1-39 = substantially incorrect or off-topic; 0 = no answer. Never award points for an empty or whitespace-only answer.
Question: ${question}
Candidate's Answer: ${answer && answer.trim() ? answer.substring(0, 3000) : '(no answer provided)'}`;

  const parsed = await callGemini(prompt);
  return {
    score:       Math.min(100, Math.max(0, parseInt(parsed.score)))       || 0,
    clarity:     Math.min(100, Math.max(0, parseInt(parsed.clarity)))     || 0,
    confidence:  Math.min(100, Math.max(0, parseInt(parsed.confidence)))  || 0,
    structure:   Math.min(100, Math.max(0, parseInt(parsed.structure)))   || 0,
    relevance:   Math.min(100, Math.max(0, parseInt(parsed.relevance)))   || 0,
    strengths:   Array.isArray(parsed.strengths)   ? parsed.strengths   : [],
    weaknesses:  Array.isArray(parsed.weaknesses)  ? parsed.weaknesses  : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    idealAnswer: typeof parsed.idealAnswer === 'string' ? parsed.idealAnswer : '',
  };
};

// ── Full Feedback Report ──────────────────────────────────────────────────────
const generateFeedbackReport = async (interviewData) => {
  const prompt = `You are an expert career coach. Based on this interview performance data, generate a comprehensive, genuinely discriminating feedback report reflecting the actual scores given. Return ONLY JSON (no markdown, no commentary):
{
  "overallScore": <number 0-100>,
  "communication": <number 0-100>,
  "technicalAccuracy": <number 0-100>,
  "confidence": <number 0-100>,
  "clarity": <number 0-100>,
  "problemSolving": <number 0-100>,
  "strengths": ["strength1","strength2","strength3"],
  "weaknesses": ["weakness1","weakness2"],
  "suggestions": ["suggestion1","suggestion2","suggestion3"],
  "improvementPlan": ["step1","step2","step3"],
  "summary": "<2-3 sentence summary>"
}
Interview data: ${JSON.stringify(interviewData).substring(0, 5000)}`;

  const parsed = await callGemini(prompt);
  return parsed;
};

// ── Single Hint (not the answer) ─────────────────────────────────────────────
const generateHint = async (question) => {
  const prompt = `You are a helpful interview coach. Give ONE short hint (max 2 sentences) for the question below. Do NOT give the full answer - just point the candidate in the right direction. Return ONLY JSON:
{ "hint": "<one or two sentence hint>" }
Question: ${question}`;

  const parsed = await callGemini(prompt);
  return typeof parsed.hint === 'string' ? parsed.hint : 'Think through the core concept step by step.';
};

const shuffleArray = (arr) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const cycleValues = (values, count) => Array.from({ length: count }, (_, index) => values[index % values.length]);

const normalizeQuestionText = (text) => (typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '');

const validateGroqQuestion = (question, blueprint, mode) => {
  if (!question || typeof question !== 'object') return null;

  const normalized = {
    slot: Number.isInteger(question.slot) ? question.slot : blueprint.slot,
    text: normalizeQuestionText(question.text),
    category: typeof question.category === 'string' && question.category.trim() ? question.category.trim() : blueprint.category,
    difficulty: typeof question.difficulty === 'string' && question.difficulty.trim() ? question.difficulty.trim() : blueprint.difficulty,
    qType: typeof question.qType === 'string' && question.qType.trim() ? question.qType.trim() : blueprint.qType,
    tags: Array.isArray(question.tags) ? question.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
  };

  if (!normalized.text) return null;
  if (mode === 'hr') {
    normalized.qType = 'short';
    return normalized;
  }

  if (!['mcq', 'short', 'scenario'].includes(normalized.qType)) return null;

  if (normalized.qType === 'mcq') {
    const options = Array.isArray(question.options) ? question.options.map((option) => String(option).trim()).filter(Boolean) : [];
    if (options.length < 4) return null;
    const correctIndex = Number.isInteger(question.correctIndex) ? question.correctIndex : parseInt(question.correctIndex, 10);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) return null;
    normalized.options = options.slice(0, 4);
    normalized.correctIndex = correctIndex;
    normalized.tags = normalized.tags.length ? normalized.tags : [normalized.category, 'mcq'];
  } else {
    normalized.tags = normalized.tags.length ? normalized.tags : [normalized.category, normalized.qType];
  }

  return normalized;
};

const buildHrBlueprints = ({ category, difficulty, count }) => {
  const categories = category === 'mixed'
    ? cycleValues(shuffleArray(['HR', 'Behavioral', 'Situational']), count)
    : Array(count).fill(category);
  const difficulties = difficulty === 'mixed'
    ? cycleValues(shuffleArray(['easy', 'medium', 'hard']), count)
    : Array(count).fill(difficulty);

  return Array.from({ length: count }, (_, index) => ({
    slot: index + 1,
    category: categories[index],
    difficulty: difficulties[index],
    qType: 'short',
  }));
};

const buildTechnicalBlueprints = ({ category, difficulty, count }) => {
  const mcqCount = Math.max(1, Math.round(count * 0.4));
  const scenarioCount = Math.max(0, Math.round(count * 0.2));
  const shortCount = Math.max(0, count - mcqCount - scenarioCount);

  const qTypes = shuffleArray([
    ...Array(mcqCount).fill('mcq'),
    ...Array(shortCount).fill('short'),
    ...Array(scenarioCount).fill('scenario'),
  ]).slice(0, count);

  const difficulties = difficulty === 'mixed'
    ? cycleValues(shuffleArray(['easy', 'medium', 'hard']), count)
    : Array(count).fill(difficulty);

  return Array.from({ length: count }, (_, index) => ({
    slot: index + 1,
    category,
    difficulty: difficulties[index],
    qType: qTypes[index],
  }));
};

const buildQuestionPrompt = ({ mode, blueprints, targetRole }) => {
  const domain = mode === 'hr' ? 'HR / behavioral / situational' : 'technical';
  const modeRules = mode === 'hr'
    ? 'Every question must be a short-answer interview question. Do not include options or correctIndex.'
    : 'For mcq questions, include exactly 4 options and a valid correctIndex. For short/scenario questions, do not include options or correctIndex.';

  return `Generate EXACTLY ${blueprints.length} ${domain} interview questions as strict JSON.
Return only this shape:
{ "questions": [ { "slot": 1, "text": "...", "category": "...", "difficulty": "...", "qType": "...", "tags": ["..."], "options": ["..."], "correctIndex": 0 } ] }

Blueprints to follow exactly:
${JSON.stringify(blueprints, null, 2)}

Rules:
- Match every blueprint slot, category, difficulty, and qType exactly.
- Keep the questions realistic, non-duplicative, and specific to a live interview.
- If ${mode === 'hr' ? 'the category is mixed, vary HR, Behavioral, and Situational naturally' : 'the difficulty is mixed, vary easy, medium, and hard naturally'}.
- ${modeRules}
- Keep phrasing concise enough for a live interview.
- If a target role is provided, tailor relevance to it: ${targetRole ? targetRole : '(none)'}.
- Return JSON only, with no markdown, no code fences, and no commentary.`;
};

const generateGroqQuestionSet = async ({ mode, category, difficulty, count, targetRole = '' }) => {
  const safeCount = Math.max(1, Math.min(30, parseInt(count, 10) || 0));
  const blueprints = mode === 'hr'
    ? buildHrBlueprints({ category, difficulty, count: safeCount })
    : buildTechnicalBlueprints({ category, difficulty, count: safeCount });

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const parsed = await callGroq(buildQuestionPrompt({ mode, blueprints, targetRole }));
      const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
      const orderedQuestions = [...questions].sort((left, right) => {
        const leftSlot = Number.isInteger(left?.slot) ? left.slot : parseInt(left?.slot, 10) || 0;
        const rightSlot = Number.isInteger(right?.slot) ? right.slot : parseInt(right?.slot, 10) || 0;
        return leftSlot - rightSlot;
      });
      const normalized = questions
        .map((question, index) => validateGroqQuestion((orderedQuestions[index] || question), blueprints[index] || blueprints[0], mode))
        .filter(Boolean)
        .slice(0, safeCount);

      if (normalized.length !== safeCount) {
        throw new Error(`Groq returned ${normalized.length} valid questions, expected ${safeCount}`);
      }

      return normalized.map((question, index) => ({ ...question, slot: index + 1 }));
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  throw new Error(`Could not generate interview questions with Groq: ${lastError?.message || 'unknown error'}`);
};

// ── HR / Behavioral Answer Evaluation (STAR method) ───────────────────────────
const VOCAL_DELIVERY_SCHEMA = `,
  "vocalDelivery": {
    "paceScore": <number 0-100, 100 = ideal steady conversational pace>,
    "paceLabel": <one of "steady","too fast","too slow","varies">,
    "confidenceScore": <number 0-100, vocal confidence/tone - NOT content confidence>,
    "fillerWordCount": <integer count of filler words heard, e.g. "um","uh","like","you know">,
    "fillerWordScore": <number 0-100, 100 = no filler words, lower = more frequent>,
    "clarityScore": <number 0-100, articulation/enunciation clarity>,
    "summary": "<1-2 sentence coaching tip about vocal delivery specifically, not content>"
  }`;

// audio: { base64: string, mimeType: string } | null
// When audio is provided, Gemini listens to the actual recording and scores both
// the STAR content AND how it was vocally delivered, in a single multimodal call.
const evaluateHRAnswerWithGemini = async (question, answer, targetRole = '', audio = null) => {
  const roleContext = targetRole && targetRole.trim()
    ? `The candidate is preparing for this role/context: "${targetRole.trim()}". Factor this into your relevance judgment.`
    : '';

  const promptText = `You are an expert HR interviewer trained in the STAR method (Situation, Task, Action, Result).${audio ? ' You have been given the candidate\'s ACTUAL VOICE RECORDING of their answer, not just a transcript - listen to it and evaluate both the content and how it was delivered vocally.' : ''} Evaluate this behavioral/HR interview answer carefully and return ONLY JSON (no markdown, no commentary):
{
  "score": <number 0-100>,
  "clarity": <number 0-100>,
  "confidence": <number 0-100>,
  "structure": <number 0-100>,
  "relevance": <number 0-100>,
  "star": {
    "situation": <number 0-100 - how clearly did they set up the context/background? 0 if not applicable/not attempted>,
    "task": <number 0-100 - how clearly did they explain their specific responsibility/goal?>,
    "action": <number 0-100 - how clearly did they explain the concrete steps THEY took?>,
    "result": <number 0-100 - did they share a clear, ideally measurable outcome?>
  },
  "strengths": ["strength1","strength2"],
  "weaknesses": ["weakness1","weakness2"],
  "suggestions": ["suggestion1","suggestion2"],
  "idealAnswer": "<brief 2-3 sentence example of a strong STAR-structured answer to this question>"${audio ? VOCAL_DELIVERY_SCHEMA : ''}
}
Score factual correctness and whether the answer addresses what the question asks—never answer length, writing style, or similarity to a preferred STAR example. A short, direct answer that is fully correct must receive 100/100 when the question can be fully answered briefly. Accept alternate terminology, valid examples, and equivalent explanations. Only deduct for a genuine factual error or for an explicitly requested part of the question that is missing. Use this rubric: 90-100 = fully correct; 80-89 = correct with a minor omission only when the question explicitly requires more detail; 40-79 = partly correct; 1-39 = substantially incorrect or off-topic; 0 = no answer. Never award points for an empty or whitespace-only answer.
${roleContext}
Question: ${question}
${audio ? 'The candidate\'s spoken answer is attached as audio.' : `Candidate's Answer: ${answer && answer.trim() ? answer.substring(0, 3000) : '(no answer provided)'}`}`;

  const groqPromptText = audio
    ? `You are an expert HR interviewer trained in the STAR method (Situation, Task, Action, Result). Evaluate this behavioral/HR interview answer carefully and return ONLY JSON (no markdown, no commentary):
{
  "score": <number 0-100>,
  "clarity": <number 0-100>,
  "confidence": <number 0-100>,
  "structure": <number 0-100>,
  "relevance": <number 0-100>,
  "star": {
    "situation": <number 0-100 - how clearly did they set up the context/background? 0 if not applicable/not attempted>,
    "task": <number 0-100 - how clearly did they explain their specific responsibility/goal?>,
    "action": <number 0-100 - how clearly did they explain the concrete steps THEY took?>,
    "result": <number 0-100 - did they share a clear, ideally measurable outcome?>
  },
  "strengths": ["strength1","strength2"],
  "weaknesses": ["weakness1","weakness2"],
  "suggestions": ["suggestion1","suggestion2"],
  "idealAnswer": "<brief 2-3 sentence example of a strong STAR-structured answer to this question>"
}
Score factual correctness and whether the answer addresses what the question asks—never answer length, writing style, or similarity to a preferred STAR example. A short, direct answer that is fully correct must receive 100/100 when the question can be fully answered briefly. Accept alternate terminology, valid examples, and equivalent explanations. Only deduct for a genuine factual error or for an explicitly requested part of the question that is missing. Use this rubric: 90-100 = fully correct; 80-89 = correct with a minor omission only when the question explicitly requires more detail; 40-79 = partly correct; 1-39 = substantially incorrect or off-topic; 0 = no answer. Never award points for an empty or whitespace-only answer.
Question: ${question}
Candidate's Answer: ${answer && answer.trim() ? answer.substring(0, 3000) : '(no answer provided)'}
Note: the source system may have audio for this answer, but this fallback can only evaluate the text transcript, so do not include vocal-delivery fields.`
    : promptText;

  const contents = audio
    ? [{ text: promptText }, { inlineData: { mimeType: audio.mimeType, data: audio.base64 } }]
    : promptText;

  const parsed = await callGemini(contents, groqPromptText);
  const star = parsed.star || {};
  const result = {
    score:       Math.min(100, Math.max(0, parseInt(parsed.score)))       || 0,
    clarity:     Math.min(100, Math.max(0, parseInt(parsed.clarity)))     || 0,
    confidence:  Math.min(100, Math.max(0, parseInt(parsed.confidence)))  || 0,
    structure:   Math.min(100, Math.max(0, parseInt(parsed.structure)))   || 0,
    relevance:   Math.min(100, Math.max(0, parseInt(parsed.relevance)))   || 0,
    star: {
      situation: Math.min(100, Math.max(0, parseInt(star.situation))) || 0,
      task:      Math.min(100, Math.max(0, parseInt(star.task)))      || 0,
      action:    Math.min(100, Math.max(0, parseInt(star.action)))    || 0,
      result:    Math.min(100, Math.max(0, parseInt(star.result)))    || 0,
    },
    strengths:   Array.isArray(parsed.strengths)   ? parsed.strengths   : [],
    weaknesses:  Array.isArray(parsed.weaknesses)  ? parsed.weaknesses  : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    idealAnswer: typeof parsed.idealAnswer === 'string' ? parsed.idealAnswer : '',
    vocalDelivery: null,
  };

  if (audio && parsed.vocalDelivery) {
    const vd = parsed.vocalDelivery;
    result.vocalDelivery = {
      paceScore:       Math.min(100, Math.max(0, parseInt(vd.paceScore)))       || 0,
      paceLabel:       ['steady','too fast','too slow','varies'].includes(vd.paceLabel) ? vd.paceLabel : 'steady',
      confidenceScore: Math.min(100, Math.max(0, parseInt(vd.confidenceScore))) || 0,
      fillerWordCount: Math.max(0, parseInt(vd.fillerWordCount)) || 0,
      fillerWordScore: Math.min(100, Math.max(0, parseInt(vd.fillerWordScore))) || 0,
      clarityScore:    Math.min(100, Math.max(0, parseInt(vd.clarityScore)))    || 0,
      summary:         typeof vd.summary === 'string' ? vd.summary : '',
    };
  }

  return result;
};

module.exports = { analyzeResumeWithGemini, evaluateAnswerWithGemini, evaluateHRAnswerWithGemini, generateFeedbackReport, generateHint, generateGroqQuestionSet };
