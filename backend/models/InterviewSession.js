const mongoose = require('mongoose');

const interviewSessionSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:     { type: String, enum: ['hr', 'technical', 'coding'], required: true },
  category: { type: String, enum: ['DSA','OOP','DBMS','OS','CN','Web Development', null], default: null },

  questions: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
    text:       String,
    answer:     { type: String, default: '' },
    score:      { type: Number, default: 0 },
    feedback:   { type: String, default: '' },
  }],

  score:      { type: Number, min: 0, max: 100, default: 0 },
  totalTime:  { type: Number, default: 0 },   // seconds
  status:     { type: String, enum: ['in-progress','completed','abandoned'], default: 'in-progress' },
  resultId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Result' },
}, { timestamps: true });

module.exports = mongoose.model('InterviewSession', interviewSessionSchema);
