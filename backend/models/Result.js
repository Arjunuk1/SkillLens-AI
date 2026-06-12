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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Result', resultSchema);
