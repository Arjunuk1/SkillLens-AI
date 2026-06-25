const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  type:     { type: String, enum: ['hr', 'technical'], required: true, index: true },
  category: { type: String, enum: ['HR', 'Behavioral', 'Situational', 'DSA', 'OOP', 'DBMS', 'OS', 'CN', 'Web Development'], required: true },
  text:     { type: String, required: true, trim: true },
  difficulty:{ type: String, enum: ['easy','medium','hard'], default: 'medium' },
  tags:     [{ type: String }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Question', questionSchema);
