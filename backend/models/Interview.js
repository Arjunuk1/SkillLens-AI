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
      // HR | Behavioral | Situational for HR interviews; DSA | OOP | DBMS | OS | CN | Web Development for technical
      type: String,
      enum: ['HR', 'Behavioral', 'Situational', 'DSA', 'OOP', 'DBMS', 'OS', 'CN', 'Web Development', null],
      default: null,
    },
    targetRole: { type: String, default: '' }, // optional context, e.g. "Backend Developer at a startup"
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard', 'mixed', null],
      default: null,
    },
    durationSeconds: { type: Number, default: null }, // planned session length, e.g. 900/1500/2700
    startedAt:  { type: Date, default: Date.now },
    completedAt:{ type: Date, default: null },
    questions: [
      {
        questionId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
        text:         String,
        qType:        { type: String, enum: ['mcq', 'short', 'scenario'], default: 'short' },
        options:      [{ type: String }],
        correctIndex: { type: Number, default: null }, // snapshot; never sent to client pre-submit
        tags:         [{ type: String }],
        difficulty:   { type: String, enum: ['easy','medium','hard'], default: 'medium' },
        answer:       { type: String, default: '' },   // free text OR stringified option index for mcq
        score:        { type: Number, default: null },  // 0-100, set on submit
        correct:      { type: Boolean, default: null }, // set only for mcq
        vocalDelivery: {
          paceScore:       { type: Number, default: null },
          paceLabel:       { type: String, default: null },
          confidenceScore: { type: Number, default: null },
          fillerWordCount: { type: Number, default: null },
          fillerWordScore: { type: Number, default: null },
          clarityScore:    { type: Number, default: null },
          summary:         { type: String, default: '' },
        },
        bookmarked:   { type: Boolean, default: false },
        hintUsed:     { type: Boolean, default: false },
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
