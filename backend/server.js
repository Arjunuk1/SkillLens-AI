require('dotenv').config({
  path: require('path').join(__dirname, '.env'),
  override: true,
});
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const mongoose     = require('mongoose');
const path         = require('path');
const rateLimit    = require('express-rate-limit');
const connectDB    = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

connectDB();
const app = express();

// Security
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false,
}));
const allowedClientUrl = process.env.CLIENT_URL;
const isLocalOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedClientUrl && origin === allowedClientUrl) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && isLocalOrigin(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' })); // raised for base64 voice-answer audio in HR interview submissions
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Rate limiting on auth
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, message: { success: false, message: 'Too many requests, try again later' } });
app.use('/api/auth', authLimiter);

// Health
app.get('/health', (_, res) => res.json({
  status: 'ok',
  database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  message: 'SkillLens AI running',
  ts: new Date(),
}));

app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.use('/api', (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'Database is not connected. Add your current IP address to MongoDB Atlas Network Access, then restart the backend.',
    });
  }

  next();
});

// Routes
app.use('/api/auth',       require('./routes/authRoutes'));
app.use('/api/config',     require('./routes/configRoutes'));
app.use('/api/dashboard',  require('./routes/dashboardRoutes'));
app.use('/api/resume',     require('./routes/resumeRoutes'));
app.use('/api/interview',  require('./routes/interviewRoutes'));
app.use('/api/technical',  require('./routes/technicalRoutes'));
app.use('/api/feedback',   require('./routes/feedbackRoutes'));
app.use('/api/analytics',  require('./routes/analyticsRoutes'));
app.use('/api/admin',      require('./routes/adminRoutes'));
app.use('/api/profile',    require('./routes/profileRoutes'));

// 404
app.use((req, res) => res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` }));
app.use(errorHandler);

const PORT = process.env.PORT || 5173;
app.listen(PORT, () => {
  console.log(`\n🚀  SkillLens AI  →  http://localhost:${PORT}`);
  console.log(`📡  Health check  →  http://localhost:${PORT}/health\n`);
});

module.exports = app;
