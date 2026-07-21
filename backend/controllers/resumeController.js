const path   = require('path');
const fs     = require('fs');
const Resume = require('../models/Resume');
const { analyzeResumeWithGemini } = require('../config/gemini');

// POST /api/resume/upload
const uploadResume = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded. Please upload a PDF.' });

    const filePath = req.file.path;

    // Extract text from PDF
    let extractedText = '';
    try {
      const pdfParse = require('pdf-parse');
      const buffer   = fs.readFileSync(filePath);
      const data     = await pdfParse(buffer);
      extractedText  = data.text;
    } catch (e) {
      console.error('PDF extraction failed:', e.message);
      return res.status(400).json({ success: false, message: 'Could not read this PDF. Please make sure it is a valid, non-corrupted, text-based PDF and try again.' });
    }
    if (!extractedText || extractedText.trim().length < 50) {
      return res.status(400).json({ success: false, message: 'This PDF appears to have little or no extractable text (it may be a scanned image). Please upload a text-based resume PDF.' });
    }

    // Send to Gemini for analysis
    let analysis;
    try {
      analysis = await analyzeResumeWithGemini(extractedText);
    } catch (e) {
      console.error('Gemini analysis failed:', e.message);
      return res.status(502).json({
        success: false,
        message: `Resume analysis failed: ${e.message}. Please try again in a moment.`,
      });
    }

    const resume = await Resume.create({
      user:          req.user._id,
      fileName:      req.file.originalname,
      fileUrl:       `/uploads/${req.file.filename}`,
      extractedText,
      atsScore:      analysis.atsScore,
      skillsFound:   analysis.skillsFound,
      strengths:     analysis.strengths,
      weakAreas:     analysis.weakAreas,
      missingSkills: analysis.missingSkills,
      suggestions:   analysis.suggestions,
      projectsAnalysis:    analysis.projectsAnalysis,
      recruiterImpression: analysis.recruiterImpression,
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
