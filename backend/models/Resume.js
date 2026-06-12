const mongoose = require('mongoose');

/**
 * Resume model — Phase 4 will add upload & analysis logic.
 * Schema is complete now so the dashboard controller can query atsScore.
 */
const resumeSchema = new mongoose.Schema(
  {
    user: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    fileName:      { type: String, default: '' },
    fileUrl:       { type: String, default: '' }, // cloud storage URL
    extractedText: { type: String, default: '' },
    atsScore:      { type: Number, min: 0, max: 100, default: 0 },
    missingSkills: [{ type: String }],
    strengths:     [{ type: String }],
    weakAreas:     [{ type: String }],
    suggestions:   [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Resume', resumeSchema);
