const mongoose = require('mongoose');

/**
 * Result / Feedback model — Phase 7 (AI Feedback Engine) will populate this.
 */
const resultSchema = new mongoose.Schema(
  {
    user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',      required: true, index: true },
    interview: { type: mongoose.Schema.Types.ObjectId, ref: 'Interview', required: true },
    score:          { type: Number, min: 0, max: 100, default: 0 },
    communication:  { type: Number, min: 0, max: 100, default: 0 },
    technicalScore: { type: Number, min: 0, max: 100, default: 0 },
    confidence:     { type: Number, min: 0, max: 100, default: 0 },
    clarity:        { type: Number, min: 0, max: 100, default: 0 },
    problemSolving: { type: Number, min: 0, max: 100, default: 0 },
    strengths:      [{ type: String }],
    weaknesses:     [{ type: String }],
    suggestions:    [{ type: String }],
    aiSummary:      { type: String, default: '' },
    accuracy:        { type: Number, min: 0, max: 100, default: null }, // % correct on objective (MCQ) questions
    timeTakenSeconds:{ type: Number, default: null },
    strongTopics:    [{ type: String }],
    weakTopics:      [{ type: String }],
    recommendedPractice: [{ type: String }],
    // STAR method breakdown — only populated for HR/behavioral interviews
    starBreakdown: {
      situation: { type: Number, min: 0, max: 100, default: null },
      task:      { type: Number, min: 0, max: 100, default: null },
      action:    { type: Number, min: 0, max: 100, default: null },
      result:    { type: Number, min: 0, max: 100, default: null },
    },
    // Vocal delivery — only populated when the candidate answered by voice (real Gemini audio analysis)
    vocalDelivery: {
      paceScore:       { type: Number, min: 0, max: 100, default: null },
      confidenceScore: { type: Number, min: 0, max: 100, default: null },
      fillerWordScore: { type: Number, min: 0, max: 100, default: null },
      fillerWordCount: { type: Number, default: null },
      clarityScore:    { type: Number, min: 0, max: 100, default: null },
      summary:         { type: String, default: '' },
      answersAnalyzed: { type: Number, default: 0 }, // how many of the session's answers had usable audio
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Result', resultSchema);
