const User      = require('../models/User');
const Interview = require('../models/Interview');
const Result    = require('../models/Result');
const Resume    = require('../models/Resume');

const LEVEL_TITLES = [
  { min: 1,  title: 'Beginner' },
  { min: 3,  title: 'Learner' },
  { min: 5,  title: 'Rising Talent' },
  { min: 7,  title: 'Interview Explorer' },
  { min: 10, title: 'Skilled Candidate' },
  { min: 15, title: 'Interview Master' },
  { min: 20, title: 'Placement Legend' },
];
const titleForLevel = (level) => LEVEL_TITLES.filter(t => level >= t.min).pop().title;

const avg = (arr) => arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : null;

// GET /api/profile
const getFullProfile = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const [user, interviews, results, resumes] = await Promise.all([
      User.findById(userId),
      Interview.find({ user: userId, status: 'completed' }),
      Result.find({ user: userId }),
      Resume.find({ user: userId }).sort({ createdAt: -1 }).limit(3).select('-extractedText'),
    ]);

    const avgScore = interviews.length ? Math.round(interviews.reduce((s, iv) => s + iv.score, 0) / interviews.length) : 0;

    // Streak: count consecutive days with an interview
    let streak = 0;
    const today     = new Date(); today.setHours(0,0,0,0);
    const sortedDates = [...new Set(interviews.map(iv => { const d = new Date(iv.createdAt); d.setHours(0,0,0,0); return d.getTime(); }))].sort((a,b) => b-a);
    for (let i = 0; i < sortedDates.length; i++) {
      const expected = new Date(today); expected.setDate(today.getDate() - i);
      if (sortedDates[i] === expected.getTime()) streak++; else break;
    }

    // Achievements
    const hasPerfectScore = interviews.some(iv => iv.score === 100);
    const achievements = [];
    if (interviews.length >= 1)     achievements.push({ id: 'first_interview',  title: 'First Step',          desc: 'Completed your first interview', icon: '🎯' });
    if (interviews.length >= 10)    achievements.push({ id: 'ten_interviews',   title: 'Consistent Learner',  desc: 'Completed 10 interviews',        icon: '🔥' });
    if (interviews.length >= 25)    achievements.push({ id: 'twenty_five',      title: 'Interview Pro',       desc: 'Completed 25 interviews',        icon: '⭐' });
    if (interviews.length >= 50)    achievements.push({ id: 'fifty',            title: 'Elite Practitioner',  desc: 'Completed 50 interviews',        icon: '🏆' });
    if (resumes.length >= 1)        achievements.push({ id: 'resume_uploaded',  title: 'Resume Ready',        desc: 'Uploaded your first resume',     icon: '📄' });
    if (resumes[0]?.atsScore >= 80) achievements.push({ id: 'ats_80',           title: 'ATS Champion',        desc: 'Resume score above 80',          icon: '🎖️' });
    if (streak >= 10)                achievements.push({ id: 'streak_10',       title: '10 Day Streak',       desc: '10 consecutive days of practice', icon: '🔥' });
    if (hasPerfectScore)             achievements.push({ id: 'perfect_score',   title: 'First Perfect Score', desc: 'Scored 100/100 on an interview',  icon: '💯' });

    // ── Gamification: XP, Level, Coins ────────────────────────────────
    const xp = Math.round(
      interviews.length * 10 +
      interviews.reduce((s, iv) => s + iv.score / 10, 0) +
      resumes.length * 15 +
      streak * 5 +
      achievements.length * 20
    );
    const level = 1 + Math.floor(xp / 150);
    const levelTitle = titleForLevel(level);
    const xpIntoLevel = xp - (level - 1) * 150;
    const xpForNextLevel = 150;
    const coins = interviews.length * 5 + resumes.length * 10 + streak * 3;

    // ── Badges: category mastery, computed from real per-category averages ──
    const catAvg = (cat) => {
      const ivIds = interviews.filter(iv => iv.category === cat).map(iv => iv._id.toString());
      const catResults = results.filter(r => ivIds.includes(r.interview?.toString()));
      return { avg: avg(catResults.map(r => r.score)), count: catResults.length };
    };
    const dbms = catAvg('DBMS');
    const dsa  = catAvg('DSA');
    const hrIvIds = interviews.filter(iv => iv.type === 'hr').map(iv => iv._id.toString());
    const hrResults = results.filter(r => hrIvIds.includes(r.interview?.toString()));
    const hrAvg = { avg: avg(hrResults.map(r => r.score)), count: hrResults.length };

    const badges = [
      { id: 'dbms_master',    title: 'DBMS Master',    icon: '🗄️', desc: 'Avg score 80+ across 3+ DBMS interviews',
        earned: dbms.count >= 3 && dbms.avg >= 80 },
      { id: 'resume_expert',  title: 'Resume Expert',  icon: '📄', desc: 'Resume ATS score of 85 or higher',
        earned: (resumes[0]?.atsScore || 0) >= 85 },
      { id: 'problem_solver', title: 'Problem Solver', icon: '🧩', desc: 'Avg score 80+ across 3+ DSA interviews',
        earned: dsa.count >= 3 && dsa.avg >= 80 },
      { id: 'hr_pro',         title: 'HR Pro',         icon: '🎙️', desc: 'Avg score 80+ across 3+ HR interviews',
        earned: hrAvg.count >= 3 && hrAvg.avg >= 80 },
    ];

    // Recommendations
    const recs = [];
    if (!resumes.length)                              recs.push({ type: 'resume',    text: 'Upload your resume to get an ATS score',    priority: 'high' });
    if (interviews.length < 5)                        recs.push({ type: 'practice',  text: 'Practice HR questions to build confidence', priority: 'high' });
    if (resumes[0]?.atsScore < 70)                   recs.push({ type: 'resume',    text: 'Improve your resume — ATS score is below 70', priority: 'medium' });
    const catCounts = {}; interviews.forEach(iv => { const k = iv.category || iv.type; catCounts[k] = (catCounts[k]||0)+1; });
    const allCats = ['DSA','DBMS','OS','CN','OOP','Web Development'];
    allCats.filter(c => !catCounts[c]).slice(0,2).forEach(c => recs.push({ type: 'technical', text: `Practice ${c} — you haven't tried it yet`, priority: 'medium' }));

    res.json({
      success: true,
      data: {
        profile:      user.toPublicJSON(),
        stats:        { totalInterviews: interviews.length, avgScore, streak, resumeScore: resumes[0]?.atsScore || 0 },
        achievements,
        badges,
        gamification: { xp, level, levelTitle, xpIntoLevel, xpForNextLevel, coins },
        resumes,
        recommendations: recs,
        recentActivity: interviews.slice(-5).reverse(),
      },
    });
  } catch (err) { next(err); }
};

// PUT /api/profile
const updateProfileFull = async (req, res, next) => {
  try {
    const allowed = ['fullName','college','branch','year','profilePhoto'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, message: 'Profile updated', data: user.toPublicJSON() });
  } catch (err) { next(err); }
};

module.exports = { getFullProfile, updateProfileFull };
