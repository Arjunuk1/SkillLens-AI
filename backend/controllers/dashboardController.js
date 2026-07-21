const Interview = require('../models/Interview');
const Resume    = require('../models/Resume');
const Result    = require('../models/Result');

const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const WEEKLY_GOAL_TARGET = 10; // interviews/week — could become a user setting later

const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const daysBetween = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 86400000);

// Monday-start week boundaries for "this week" stats
const startOfWeek = (d) => {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diffToMonday);
  return x;
};

const avg = (arr) => arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : null;

const getDashboard = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const interviews   = await Interview.find({ user: userId, status: 'completed' }).sort({ createdAt: -1 });
    const latestResume = await Resume.findOne({ user: userId }).sort({ createdAt: -1 });
    const results       = await Result.find({ user: userId }).sort({ createdAt: -1 });

    const totalInterviews = interviews.length;
    const avgScore = totalInterviews
      ? Math.round(interviews.reduce((s, i) => s + i.score, 0) / totalInterviews) : 0;

    let improvementRate = 0;
    if (interviews.length >= 4) {
      const half   = Math.floor(interviews.length / 2);
      const first  = interviews.slice(half).reduce((s, i) => s + i.score, 0) / (interviews.length - half);
      const second = interviews.slice(0, half).reduce((s, i) => s + i.score, 0) / half;
      improvementRate = Math.round(((second - first) / (first || 1)) * 100);
    }

    const recentActivity = interviews.slice(0, 5).map(i => ({
      id: i._id, type: i.type, category: i.category, score: i.score, date: i.createdAt,
    }));

    // ── Weekly activity heatmap (Mon → Sun of the current week) ──────────
    const weekStart = startOfWeek(new Date());
    const weeklyActivity = Array.from({ length: 7 }, (_, idx) => {
      const dayDate = new Date(weekStart); dayDate.setDate(weekStart.getDate() + idx);
      const count = interviews.filter(i => daysBetween(i.createdAt, dayDate) === 0).length;
      return { day: DAY_LABELS[dayDate.getDay()], date: dayDate.toISOString().slice(0,10), count };
    });

    // ── Streak: consecutive days up to today with at least one completed interview ──
    const activityDaySet = new Set(interviews.map(i => startOfDay(i.createdAt).getTime()));
    let streak = 0;
    let cursor = startOfDay(new Date());
    // if nothing done today yet, streak still counts from yesterday backward
    if (!activityDaySet.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 1);
    while (activityDaySet.has(cursor.getTime())) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    // ── Weekly goal ──────────────────────────────────────────────────────
    const completedThisWeek = interviews.filter(i => i.createdAt >= weekStart).length;
    const weeklyGoal = { target: WEEKLY_GOAL_TARGET, completed: completedThisWeek };

    // ── Placement readiness (composite of real signals, weighted) ────────
    const dsaResults = results.filter(r => {
      const iv = interviews.find(i => i._id.toString() === r.interview?.toString());
      return iv && iv.category === 'DSA';
    });
    const resumeComponent   = latestResume ? latestResume.atsScore : null;
    const interviewComponent= avg(results.map(r => r.score));
    const dsaComponent      = dsaResults.length ? avg(dsaResults.map(r => r.technicalScore)) : avg(results.map(r => r.technicalScore));
    const commComponent     = avg(results.map(r => r.communication));
    const projectsComponent = (resumeComponent != null && interviewComponent != null)
      ? Math.round((resumeComponent + avg(results.map(r => r.problemSolving))) / 2)
      : resumeComponent;

    const breakdown = {
      resume: resumeComponent != null ? Math.round(resumeComponent) : null,
      interview: interviewComponent != null ? Math.round(interviewComponent) : null,
      dsa: dsaComponent != null ? Math.round(dsaComponent) : null,
      communication: commComponent != null ? Math.round(commComponent) : null,
      projects: projectsComponent != null ? Math.round(projectsComponent) : null,
    };
    const weights = { resume: 0.2, interview: 0.25, dsa: 0.2, communication: 0.15, projects: 0.2 };
    const availableParts = Object.entries(breakdown).filter(([,v]) => v != null);
    const overallReadiness = availableParts.length
      ? Math.round(availableParts.reduce((s, [k, v]) => s + v * weights[k], 0) / availableParts.reduce((s, [k]) => s + weights[k], 0))
      : 0;

    // ── AI-style recommendations driven by real gaps in the data ─────────
    const recommendations = [];
    if (breakdown.resume == null) {
      recommendations.push({ text: 'Upload your resume for an ATS score and feedback', estimatedImprovement: 15 });
    } else if (breakdown.resume < 70) {
      recommendations.push({ text: 'Improve your resume — ATS score is below 70', estimatedImprovement: Math.round((70 - breakdown.resume) * 0.3) });
    }
    const hrDone = interviews.some(i => i.type === 'hr');
    if (!hrDone) recommendations.push({ text: 'Complete your first HR round', estimatedImprovement: 10 });

    const techCategories = ['DSA','OOP','DBMS','OS','CN','Web Development'];
    const attemptedCats = new Set(interviews.filter(i => i.type === 'technical').map(i => i.category));
    const untried = techCategories.filter(c => !attemptedCats.has(c));
    if (untried.length) recommendations.push({ text: `Practice ${untried[0]} — you haven't tried it yet`, estimatedImprovement: 8 });

    if (breakdown.dsa != null && breakdown.dsa < 60) {
      recommendations.push({ text: 'Practice more DSA questions — score below 60', estimatedImprovement: Math.round((60 - breakdown.dsa) * 0.25) });
    }
    if (breakdown.communication != null && breakdown.communication < 65) {
      recommendations.push({ text: 'Focus on communication clarity in HR rounds', estimatedImprovement: Math.round((65 - breakdown.communication) * 0.2) });
    }
    if (!recommendations.length) {
      recommendations.push({ text: 'Great progress — keep up regular practice to stay sharp', estimatedImprovement: 3 });
    }
    recommendations.sort((a,b) => b.estimatedImprovement - a.estimatedImprovement);

    res.json({ success: true, data: {
      totalInterviews, avgScore, resumeScore: latestResume?.atsScore || 0, improvementRate, recentActivity,
      weeklyActivity, streak, weeklyGoal,
      placementReadiness: { overall: overallReadiness, breakdown },
      recommendations: recommendations.slice(0, 4),
    }});
  } catch (err) { next(err); }
};

module.exports = { getDashboard };
