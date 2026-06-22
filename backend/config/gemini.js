const { GoogleGenerativeAI } = require('@google/generative-ai');

const getGemini = () => {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set in .env');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: 'gemini-pro' });
};

const safeJSON = (text) => {
  try {
    const match = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? (match[1] || match[0]) : text);
  } catch { return null; }
};

// ── Resume Analysis ──────────────────────────────────────────────────────────
const analyzeResumeWithGemini = async (resumeText) => {
  const model  = getGemini();
  const prompt = `You are an expert ATS resume analyzer. Analyze the following resume and return ONLY a JSON object with this exact structure:
{
  "atsScore": <number 0-100>,
  "strengths": ["strength1","strength2","strength3"],
  "weakAreas": ["weakness1","weakness2"],
  "missingSkills": ["skill1","skill2","skill3"],
  "suggestions": ["suggestion1","suggestion2","suggestion3"]
}
Resume text:
${resumeText.substring(0, 4000)}`;

  const result = await model.generateContent(prompt);
  const text   = result.response.text();
  const parsed = safeJSON(text);
  if (!parsed) throw new Error('Could not parse Gemini response');
  return {
    atsScore:      Math.min(100, Math.max(0, parseInt(parsed.atsScore) || 60)),
    strengths:     Array.isArray(parsed.strengths)     ? parsed.strengths     : [],
    weakAreas:     Array.isArray(parsed.weakAreas)     ? parsed.weakAreas     : [],
    missingSkills: Array.isArray(parsed.missingSkills) ? parsed.missingSkills : [],
    suggestions:   Array.isArray(parsed.suggestions)   ? parsed.suggestions   : [],
  };
};

// ── Interview Answer Evaluation ──────────────────────────────────────────────
const evaluateAnswerWithGemini = async (question, answer, type = 'hr') => {
  const model  = getGemini();
  const prompt = `You are an expert ${type === 'hr' ? 'HR interviewer' : 'technical interviewer'}. Evaluate this interview answer and return ONLY JSON:
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
Question: ${question}
Answer: ${answer.substring(0, 2000)}`;

  const result = await model.generateContent(prompt);
  const parsed = safeJSON(result.response.text());
  if (!parsed) throw new Error('Could not parse evaluation');
  return parsed;
};

// ── Full Feedback Report ──────────────────────────────────────────────────────
const generateFeedbackReport = async (interviewData) => {
  const model  = getGemini();
  const prompt = `You are an expert career coach. Based on this interview performance data, generate a comprehensive feedback report. Return ONLY JSON:
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
Interview data: ${JSON.stringify(interviewData).substring(0, 3000)}`;

  const result = await model.generateContent(prompt);
  const parsed = safeJSON(result.response.text());
  if (!parsed) throw new Error('Could not parse feedback');
  return parsed;
};

module.exports = { analyzeResumeWithGemini, evaluateAnswerWithGemini, generateFeedbackReport };
