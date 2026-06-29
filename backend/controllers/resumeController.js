const path   = require('path');
const fs     = require('fs');
const Resume = require('../models/Resume');
const { analyzeResumeWithGemini } = require('../config/gemini');

// POST /api/resume/upload
const uploadResume = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded. Please upload a PDF.' });

    const filePath = req.file.path;
    let extractedText = '';

    // Extract text from PDF
    try {
      const pdfParse = require('pdf-parse');
      const buffer   = fs.readFileSync(filePath);
      const data     = await pdfParse(buffer);
      extractedText  = data.text;
    } catch (e) {
      extractedText = 'Could not extract text from PDF.';
    }

    // Send to Gemini for analysis
    let analysis = { atsScore: 60, strengths: [], weakAreas: [], missingSkills: [], suggestions: [] };
    try {
      analysis = await analyzeResumeWithGemini(extractedText);
    } catch (e) {
      console.error('Gemini analysis failed:', e.message);
    }

    const resume = await Resume.create({
      user:          req.user._id,
      fileName:      req.file.originalname,
      fileUrl:       `/uploads/${req.file.filename}`,
      extractedText,
      atsScore:      analysis.atsScore,
      strengths:     analysis.strengths,
      weakAreas:     analysis.weakAreas,
      missingSkills: analysis.missingSkills,
      suggestions:   analysis.suggestions,
    });

    res.status(201).json({ success: true, message: 'Resume analyzed successfully', data: resume });
  } catch (err) { next(err); }
};

// GET /api/resume/history
const getResumeHistory = async (req, res, next) => {
  try {
    const resumes = await Resume.find({ user: req.user._id }).sort({ createdAt: -1 }).select('-extractedText');
    res.json({ success: true, data: resumes });
  } catch (err) { next(err); }
};

// GET /api/resume/:id
const getResumeById = async (req, res, next) => {
  try {
    const resume = await Resume.findOne({ _id: req.params.id, user: req.user._id });
    if (!resume) return res.status(404).json({ success: false, message: 'Resume not found' });
    res.json({ success: true, data: resume });
  } catch (err) { next(err); }
};

module.exports = { uploadResume, getResumeHistory, getResumeById };
