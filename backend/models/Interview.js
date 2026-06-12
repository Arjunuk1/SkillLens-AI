const mongoose = require('mongoose');

/**
 * Interview model — covers both HR and Technical interview sessions.
 * Phase 5 & 6 will flesh out the full feature set.
 * The schema is already complete so the dashboard controller works today.
 */
const interviewSchema = new mongoose.Schema(
  {
    user: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    type: {
      type:     String,
      enum:     ['hr', 'technical'],
      required: true,
    },
    category: {
      // Only set for technical interviews: DSA | OOP | DBMS | OS | CN | Web
      type: String,
      enum: ['DSA', 'OOP', 'DBMS', 'OS', 'CN', 'Web Development', null],
      default: null,
    },
    questions: [
      {
        questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
        text:       String,
        answer:     { type: String, default: '' },
      },
    ],
    score:     { type: Number, min: 0, max: 100, default: 0 },
    feedback:  { type: mongoose.Schema.Types.ObjectId, ref: 'Feedback' },
    status: {
      type:    String,
      enum:    ['in-progress', 'completed', 'abandoned'],
      default: 'in-progress',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Interview', interviewSchema);
