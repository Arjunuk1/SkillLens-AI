const Interview = require('../models/Interview');
const Resume    = require('../models/Resume');

const getDashboard = async (req, res, next) => {
  try {
    const userId    = req.user._id;
    const interviews = await Interview.find({ user: userId, status:'completed' }).sort({ createdAt:-1 });
    const latestResume = await Resume.findOne({ user: userId }).sort({ createdAt:-1 });

    const totalInterviews = interviews.length;
    const avgScore = totalInterviews
      ? Math.round(interviews.reduce((s,i)=>s+i.score,0)/totalInterviews) : 0;

    let improvementRate = 0;
    if (interviews.length >= 4) {
      const half    = Math.floor(interviews.length/2);
      const first   = interviews.slice(half).reduce((s,i)=>s+i.score,0)/(interviews.length-half);
      const second  = interviews.slice(0,half).reduce((s,i)=>s+i.score,0)/half;
      improvementRate = Math.round(((second-first)/(first||1))*100);
    }

    const recentActivity = interviews.slice(0,5).map(i=>({
      id:i._id, type:i.type, category:i.category, score:i.score, date:i.createdAt
    }));

    res.json({ success:true, data:{ totalInterviews, avgScore, resumeScore: latestResume?.atsScore||0, improvementRate, recentActivity }});
  } catch(err){ next(err); }
};

module.exports = { getDashboard };
