const Interview = require('../models/Interview');
const Result    = require('../models/Result');
const Resume    = require('../models/Resume');

// GET /api/analytics
const getAnalytics = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const [interviews, results, resumes] = await Promise.all([
      Interview.find({ user: userId, status: 'completed' }).sort({ createdAt: 1 }),
      Result.find({ user: userId }).populate('interview', 'type category createdAt'),
      Resume.find({ user: userId }).sort({ createdAt: -1 }).limit(1),
    ]);

    // Score trend (last 10 completed interviews)
    const scoreTrend = interviews.slice(-10).map((iv, i) => ({
      session:   `S${i + 1}`,
      score:     iv.score,
      type:      iv.type,
      category:  iv.category,
      date:      iv.createdAt,
    }));

    // Category-wise performance
    const catMap = {};
    interviews.forEach(iv => {
      const key = iv.category || iv.type.toUpperCase();
      if (!catMap[key]) catMap[key] = { total: 0, count: 0 };
      catMap[key].total += iv.score;
      catMap[key].count += 1;
    });
    const categoryScores = Object.entries(catMap).map(([cat, d]) => ({
      category: cat,
      avgScore: Math.round(d.total / d.count),
      count:    d.count,
    }));

    // Strongest & weakest
    const sorted     = [...categoryScores].sort((a, b) => b.avgScore - a.avgScore);
    const strongest  = sorted[0]?.category || 'N/A';
    const weakest    = sorted[sorted.length - 1]?.category || 'N/A';

    // Radar chart data
    const allResults = results;
    const radar = allResults.length ? {
      communication:  Math.round(allResults.reduce((s, r) => s + r.communication,  0) / allResults.length),
      technicalScore: Math.round(allResults.reduce((s, r) => s + r.technicalScore, 0) / allResults.length),
      confidence:     Math.round(allResults.reduce((s, r) => s + r.confidence,     0) / allResults.length),
      clarity:        Math.round(allResults.reduce((s, r) => s + r.clarity,        0) / allResults.length),
      problemSolving: Math.round(allResults.reduce((s, r) => s + r.problemSolving, 0) / allResults.length),
    } : { communication: 0, technicalScore: 0, confidence: 0, clarity: 0, problemSolving: 0 };

    // Overall avg
    const avgScore = interviews.length
      ? Math.round(interviews.reduce((s, iv) => s + iv.score, 0) / interviews.length)
      : 0;

    // Improvement (compare first half vs second half)
    let improvement = 0;
    if (interviews.length >= 4) {
      const half   = Math.floor(interviews.length / 2);
      const first  = interviews.slice(0, half).reduce((s, iv) => s + iv.score, 0) / half;
      const second = interviews.slice(half).reduce((s, iv) => s + iv.score, 0) / (interviews.length - half);
      improvement  = Math.round(((second - first) / (first || 1)) * 100);
    }

    // Question type breakdown (mcq / short / scenario) across all technical sessions
    const typeCounts = { mcq: 0, short: 0, scenario: 0 };
    interviews.filter(iv => iv.type === 'technical').forEach(iv => {
      (iv.questions || []).forEach(q => {
        const t = q.qType || 'short';
        if (typeCounts[t] !== undefined) typeCounts[t] += 1;
      });
    });

    // Practice frequency heatmap — last 70 days, one count per day
    const HEATMAP_DAYS = 70;
    const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
    const freqMap = {};
    interviews.forEach(iv => {
      const k = dayKey(iv.createdAt);
      freqMap[k] = (freqMap[k] || 0) + 1;
    });
    const practiceFrequency = [];
    const today = new Date(); today.setHours(0,0,0,0);
    for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const k = dayKey(d);
      practiceFrequency.push({ date: k, count: freqMap[k] || 0 });
    }

    res.json({
      success: true,
      data: {
        overview: {
          totalInterviews: interviews.length,
          avgScore,
          improvement,
          resumeScore: resumes[0]?.atsScore || 0,
          strongest,
          weakest,
        },
        scoreTrend,
        categoryScores,
        radar,
        questionTypeBreakdown: typeCounts,
        practiceFrequency,
        recentActivity: interviews.slice(-5).reverse().map(iv => ({
          id:       iv._id,
          type:     iv.type,
          category: iv.category,
          score:    iv.score,
          date:     iv.createdAt,
        })),
      },
    });
  } catch (err) { next(err); }
};

module.exports = { getAnalytics };
