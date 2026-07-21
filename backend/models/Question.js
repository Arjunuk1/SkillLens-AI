const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  type:     { type: String, enum: ['hr', 'technical'], required: true, index: true },
  category: { type: String, enum: ['HR', 'Behavioral', 'Situational', 'DSA', 'OOP', 'DBMS', 'OS', 'CN', 'Web Development'], required: true },
  qType:    { type: String, enum: ['mcq', 'short', 'scenario'], default: 'short' },
  text:     { type: String, required: true, trim: true },
  options:      [{ type: String }],   // only for qType: 'mcq'
  correctIndex: { type: Number, default: null }, // index into options, only for qType: 'mcq'
  difficulty:{ type: String, enum: ['easy','medium','hard'], default: 'medium' },
  tags:     [{ type: String }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Question', questionSchema);
