const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// ── Load env vars ──────────────────────────────────────────────────────────────
require('dotenv').config();

// ── Connect to MongoDB ─────────────────────────────────────────────────────────
connectDB();

const app = express();

// ── Security & utility middleware ──────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'SkillLens AI backend is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ── API routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/authRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));

// Stubs — uncomment as you build each phase:
// app.use('/api/resume',    require('./routes/resumeRoutes'));
// app.use('/api/interview', require('./routes/interviewRoutes'));
// app.use('/api/analytics', require('./routes/analyticsRoutes'));
// app.use('/api/admin',     require('./routes/adminRoutes'));

// ── 404 handler ────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

// ── Start server ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀  SkillLens AI server running on port ${PORT}`);
  console.log(`📡  Health: http://localhost:${PORT}/health\n`);
});

module.exports = app; // for testing
