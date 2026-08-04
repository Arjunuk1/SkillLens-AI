

// Set user info from cache immediately
if (user.fullName) {
  const initials = user.fullName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('sb-avatar').textContent  = initials;
  document.getElementById('sb-name').textContent    = user.fullName;
  document.getElementById('sb-email').textContent   = user.email || '';
  document.getElementById('welcome-msg').textContent = `Welcome back, ${user.fullName.split(' ')[0]} 👋`;
}

function logout() {
  localStorage.removeItem('sl_token');
  localStorage.removeItem('sl_user');
  location.href = '/pages/landing/landing.html';
}

function removeSkeleton(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('sk');
  el.style.height = '';
  el.style.width  = '';
  el.textContent  = value;
}

function scoreClass(s) { return s >= 75 ? 'score-high' : s >= 55 ? 'score-mid' : 'score-low'; }

async function loadDashboard() {
  try {
    const r = await fetch(`${API}/dashboard`, { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message);
    const dt = d.data;

    removeSkeleton('st-interviews', dt.totalInterviews);
    removeSkeleton('st-avg',        (dt.avgScore || 0) + '%');
    removeSkeleton('st-resume',     dt.resumeScore || 'N/A');
    removeSkeleton('st-impr',       (dt.improvementRate >= 0 ? '+' : '') + (dt.improvementRate || 0) + '%');
    document.getElementById('st-int-change').textContent = dt.totalInterviews > 0 ? `${dt.totalInterviews} total sessions` : 'No sessions yet';

    // Activity
    const acts = dt.recentActivity || [];
    const icons = { hr: '👥', technical: '💻', resume: '📄' };
    const bg    = { hr: 'rgba(111,151,236,.15)', technical: 'rgba(227,163,68,.15)', resume: 'rgba(69,184,146,.15)' };
    if (acts.length) {
      document.getElementById('activity-list').innerHTML = acts.map(a => `
        <div class="activity-item">
          <div class="act-left">
            <div class="act-ico" style="background:${bg[a.type]||bg.hr}">${icons[a.type]||'📝'}</div>
            <div>
              <div class="act-name">${(a.category || a.type || 'Interview').toUpperCase().replace('HR','HR')}</div>
              <div class="act-time">${new Date(a.date).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
            </div>
          </div>
          <span class="score-badge ${scoreClass(a.score)}">${a.score || '--'}/100</span>
        </div>`).join('');
    } else {
      document.getElementById('activity-list').innerHTML = `<div class="empty-state"><div class="e-icon">🎙️</div>No interviews yet.<br>Start your first session!</div>`;
    }

    // Weekly progress heatmap
    const week = dt.weeklyActivity || [];
    const todayStr = new Date().toISOString().slice(0,10);
    const maxCount = Math.max(1, ...week.map(d => d.count));
    document.getElementById('heatmap-row').innerHTML = week.map(d => {
      const lvl = d.count === 0 ? '' : d.count/maxCount <= 0.33 ? 'l1' : d.count/maxCount <= 0.66 ? 'l2' : 'l3';
      const isToday = d.date === todayStr;
      return `<div class="heatmap-day">
        <div class="heatmap-cell ${lvl} ${isToday?'today':''}" title="${d.count} interview(s) on ${d.day}"></div>
        <span class="heatmap-lbl">${d.day}</span>
      </div>`;
    }).join('');

    // Streak card
    document.getElementById('dash-streak-num').textContent = dt.streak || 0;
    document.getElementById('streak-motivation').textContent = dt.streak > 0
      ? `You're on fire — keep it going!`
      : 'Start a session today to begin your streak';

    // Weekly goal
    const goal = dt.weeklyGoal || { target: 10, completed: 0 };
    const pct = Math.min(100, Math.round((goal.completed / goal.target) * 100));
    document.getElementById('goal-bar-fill').style.width = pct + '%';
    document.getElementById('goal-text').textContent = `${goal.completed} / ${goal.target} interviews`;
    document.getElementById('goal-sub').textContent = goal.completed >= goal.target
      ? '🎉 Weekly goal achieved!'
      : `${goal.target - goal.completed} more to hit this week's goal`;

    // Placement readiness
    const pr = dt.placementReadiness || { overall: 0, breakdown: {} };
    const circ = 289, offset = circ - (circ * pr.overall / 100);
    document.getElementById('readiness-num').textContent = pr.overall + '%';
    const ringColor = pr.overall >= 75 ? '#45b892' : pr.overall >= 50 ? '#e3a344' : '#6f97ec';
    document.getElementById('readiness-ring-fill').style.stroke = ringColor;
    setTimeout(() => document.getElementById('readiness-ring-fill').style.strokeDashoffset = offset, 100);
    const titleEl = document.getElementById('readiness-title');
    const descEl  = document.getElementById('readiness-desc-text');
    if (pr.overall >= 75) { titleEl.textContent = 'You look placement-ready'; descEl.textContent = 'Strong performance across resume, interviews, and technical rounds. Keep practicing to stay sharp.'; }
    else if (pr.overall >= 45) { titleEl.textContent = 'Good progress — keep going'; descEl.textContent = 'You are on track. Focus on the weaker categories below to boost your readiness further.'; }
    else if (pr.overall > 0) { titleEl.textContent = 'Early stage — lots of room to grow'; descEl.textContent = 'Complete more resume analyses and interviews across categories to build a reliable readiness score.'; }

    const bd = pr.breakdown || {};
    const rbMeta = [
      { key:'resume', label:'Resume', color:'#45b892' },
      { key:'interview', label:'Interview', color:'#6f97ec' },
      { key:'dsa', label:'DSA', color:'#e3a344' },
      { key:'communication', label:'Communication', color:'#d97a68' },
      { key:'projects', label:'Projects', color:'#8fa8c9' },
    ];
    document.getElementById('readiness-breakdown').innerHTML = rbMeta.map(m => {
      const v = bd[m.key];
      return `<div class="rb-item">
        <div class="rb-val" style="color:${v!=null?m.color:'var(--muted)'}">${v!=null?v+'%':'—'}</div>
        <div class="rb-bar-track"><div class="rb-bar-fill" style="width:${v||0}%;background:${m.color}"></div></div>
        <div class="rb-label">${m.label}</div>
      </div>`;
    }).join('');

    // Recommendations (richer version, driven by real gaps in the data)
    const recs = dt.recommendations || [];
    if (recs.length) {
      document.getElementById('rec-list').innerHTML = recs.map(rec => `
        <div class="rec-item-v2">
          <span class="rec-check">✓</span>
          <span style="flex:1">${rec.text}</span>
          ${rec.estimatedImprovement ? `<span class="rec-improve">+${rec.estimatedImprovement}%</span>` : ''}
        </div>`).join('');
    }
  } catch(e) {
    removeSkeleton('st-interviews', '0');
    removeSkeleton('st-avg', 'N/A');
    removeSkeleton('st-resume', 'N/A');
    removeSkeleton('st-impr', 'N/A');
    document.getElementById('activity-list').innerHTML = `<div class="empty-state"><div class="e-icon">🎙️</div>Complete your first interview to see activity here.</div>`;
    document.getElementById('heatmap-row').innerHTML = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => `<div class="heatmap-day"><div class="heatmap-cell"></div><span class="heatmap-lbl">${d}</span></div>`).join('');
    document.getElementById('dash-streak-num').textContent = '0';
    document.getElementById('goal-text').textContent = '0 / 10 interviews';
    document.getElementById('readiness-breakdown').innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--muted);font-size:13px;padding:10px">Could not load readiness data — check your connection.</div>`;
    document.getElementById('rec-list').innerHTML = `
      <a href="/pages/resume/resume.html"           class="rec-item"><span>📄</span><span>Upload your resume</span></a>
      <a href="/pages/hr-interview/hr-interview.html"     class="rec-item"><span>🎙️</span><span>Start HR interview</span></a>
      <a href="/pages/technical-interview/technical-interview.html" class="rec-item"><span>💻</span><span>Start technical interview</span></a>`;
  }
}

async function loadProfile() {
  try {
    const r = await fetch(`${API}/profile`, { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json();
    if (!r.ok) return;
    const p = d.data;
    const name = p.profile.fullName || user.fullName || 'User';
    const initials = name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    document.getElementById('sb-avatar').textContent    = initials;
    document.getElementById('sb-name').textContent      = name;
    document.getElementById('sb-email').textContent     = p.profile.email || '';
    document.getElementById('welcome-msg').textContent  = `Welcome back, ${name.split(' ')[0]} 👋`;
    document.getElementById('welcome-sub').textContent  = p.stats.streak > 0 ? `You're on a ${p.stats.streak}-day streak — keep it going!` : 'Ready for your next interview session?';
    document.getElementById('streak-val').textContent   = p.stats.streak || 0;
  } catch(e) { /* header name/streak just stays at defaults; non-critical */ }
}

// ═══ Embedded Analytics view (lazy-loaded on first open) ═══
const chartDefaults = {
  plugins:{ legend:{ labels:{ color:'rgba(255,255,255,0.5)', font:{ size:11 }}}},
  scales:{ x:{ ticks:{ color:'rgba(255,255,255,0.35)', font:{ size:10 }}, grid:{ color:'rgba(255,255,255,0.05)'}}, y:{ ticks:{ color:'rgba(255,255,255,0.35)', font:{ size:10 }}, grid:{ color:'rgba(255,255,255,0.05)'}}}
};

async function loadAnalyticsView() {
  try {
    const r  = await fetch(`${API}/analytics`, { headers:{ Authorization:'Bearer '+token }});
    const d  = await r.json();
    if (!r.ok) throw new Error(d.message);
    const dt = d.data;

    // Stats
    document.getElementById('an-total').textContent  = dt.overview.totalInterviews;
    document.getElementById('an-avg').textContent    = dt.overview.avgScore + '%';
    document.getElementById('an-impr').textContent   = (dt.overview.improvement > 0 ? '+':'') + dt.overview.improvement + '%';
    document.getElementById('an-resume').textContent = dt.overview.resumeScore || 'N/A';
    document.getElementById('hl-strong').textContent = dt.overview.strongest;
    document.getElementById('hl-weak').textContent   = dt.overview.weakest;

    // Best score
    const best = dt.scoreTrend.length ? Math.max(...dt.scoreTrend.map(s=>s.score)) : 0;
    document.getElementById('hl-best').textContent   = best ? best + '%' : 'N/A';

    // Sessions this week
    const now  = Date.now(), week = 7*24*3600*1000;
    const wkSessions = dt.recentActivity.filter(a => now - new Date(a.date).getTime() < week).length;
    document.getElementById('hl-week').textContent   = wkSessions;

    // Line chart
    new Chart(document.getElementById('lineChart'), {
      type:'line',
      data:{ labels: dt.scoreTrend.map(s=>s.session), datasets:[{ label:'Score', data: dt.scoreTrend.map(s=>s.score), borderColor:'#e3a344', backgroundColor:'rgba(227,163,68,0.1)', borderWidth:2, pointRadius:4, pointBackgroundColor:'#6f97ec', tension:.35, fill:true }]},
      options:{ responsive:true, maintainAspectRatio:false, ...chartDefaults, scales:{ ...chartDefaults.scales, y:{ ...chartDefaults.scales.y, min:0, max:100 }}}
    });

    // Pie chart
    const cats = dt.categoryScores;
    if (cats.length) {
      new Chart(document.getElementById('pieChart'), {
        type:'doughnut',
        data:{ labels: cats.map(c=>c.category), datasets:[{ data: cats.map(c=>c.avgScore), backgroundColor:['#6f97ec','#e3a344','#45b892','#d97a68','#c9a86a','#8fa8c9'], borderWidth:0 }]},
        options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:'rgba(255,255,255,0.5)', font:{ size:10 }, padding:10 }}}}
      });
    }

    // Radar chart
    const r2 = dt.radar;
    new Chart(document.getElementById('radarChart'), {
      type:'radar',
      data:{ labels:['Communication','Technical','Confidence','Clarity','Problem Solving'], datasets:[{ label:'Skills', data:[r2.communication, r2.technicalScore, r2.confidence, r2.clarity, r2.problemSolving], backgroundColor:'rgba(111,151,236,0.15)', borderColor:'#6f97ec', borderWidth:1.5, pointBackgroundColor:'#6f97ec', pointRadius:3 }]},
      options:{ responsive:true, maintainAspectRatio:false, scales:{ r:{ ticks:{ display:false }, grid:{ color:'rgba(255,255,255,0.08)' }, pointLabels:{ color:'rgba(255,255,255,0.45)', font:{ size:10 }}, min:0, max:100 }}, plugins:{ legend:{ display:false }}}
    });

    // Bar chart
    if (cats.length) {
      new Chart(document.getElementById('barChart'), {
        type:'bar',
        data:{ labels: cats.map(c=>c.category), datasets:[{ label:'Avg Score', data: cats.map(c=>c.avgScore), backgroundColor: cats.map(c => c.avgScore>=80?'rgba(69,184,146,0.7)':c.avgScore>=60?'rgba(227,163,68,0.7)':'rgba(217,122,104,0.7)'), borderRadius:6 }]},
        options:{ responsive:true, maintainAspectRatio:false, ...chartDefaults, scales:{ ...chartDefaults.scales, y:{ ...chartDefaults.scales.y, min:0, max:100 }}, plugins:{ legend:{ display:false }}}
      });
    }

    // Question types pie chart
    const qt = dt.questionTypeBreakdown || { mcq:0, short:0, scenario:0 };
    const qtTotal = qt.mcq + qt.short + qt.scenario;
    if (qtTotal > 0) {
      new Chart(document.getElementById('typeChart'), {
        type:'pie',
        data:{ labels:['Multiple Choice','Short Answer','Scenario'], datasets:[{ data:[qt.mcq, qt.short, qt.scenario], backgroundColor:['#e3a344','#6f97ec','#c9a86a'], borderWidth:0 }]},
        options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:'rgba(255,255,255,0.5)', font:{ size:10 }, padding:10 }}}}
      });
    } else {
      new Chart(document.getElementById('typeChart'), { type:'pie', data:{ labels:['No technical interviews yet'], datasets:[{ data:[1], backgroundColor:['rgba(255,255,255,0.08)'] }]}, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false }}}});
    }

    // Practice frequency heatmap
    const freq = dt.practiceFrequency || [];
    const maxFreq = Math.max(1, ...freq.map(f => f.count));
    document.getElementById('freq-heatmap').innerHTML = freq.map(f => {
      const lvl = f.count === 0 ? '' : f.count/maxFreq <= 0.25 ? 'l1' : f.count/maxFreq <= 0.5 ? 'l2' : f.count/maxFreq <= 0.75 ? 'l3' : 'l4';
      return `<div class="heatmap-cell ${lvl}" title="${f.count} session(s) on ${f.date}"></div>`;
    }).join('');

    // Activity list
    if (dt.recentActivity.length) {
      const icons = { hr:'👥', technical:'💻' };
      document.getElementById('an-activity-list').innerHTML = dt.recentActivity.map(a => `
        <div class="activity-item">
          <div class="act-left">
            <div class="act-icon" style="background:rgba(111,151,236,0.15)">${icons[a.type]||'📝'}</div>
            <div>
              <div class="act-name">${a.category || a.type.toUpperCase()} Interview</div>
              <div class="act-date">${new Date(a.date).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</div>
            </div>
          </div>
          <span class="act-score">${a.score || '--'}/100</span>
        </div>`).join('');
    }
  } catch(e) {
    // Show sample data if no backend
    document.getElementById('an-total').textContent  = '0';
    document.getElementById('an-avg').textContent    = 'N/A';
    document.getElementById('an-impr').textContent   = 'N/A';
    document.getElementById('an-resume').textContent = 'N/A';
    document.getElementById('hl-strong').textContent = 'N/A';
    document.getElementById('hl-weak').textContent   = 'N/A';
    document.getElementById('hl-best').textContent   = 'N/A';
    document.getElementById('hl-week').textContent   = '0';
    // Draw empty charts
    ['lineChart','pieChart','radarChart','barChart','typeChart'].forEach(id => {
      new Chart(document.getElementById(id), { type: id==='radarChart'?'radar':(id==='pieChart'||id==='typeChart')?'doughnut':'bar', data:{ labels:['No Data'], datasets:[{ data:[0] }]}, options:{ responsive:true, maintainAspectRatio:false }});
    });
    document.getElementById('freq-heatmap').innerHTML = Array.from({length:70}).map(()=>'<div class="heatmap-cell"></div>').join('');
  }
}

// ═══ Embedded Profile view (reloaded every time it's opened) ═══
let editing = false;

function toast(msg, type='ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background   = type==='ok' ? 'rgba(69,184,146,.15)' : 'rgba(217,122,104,.13)';
  t.style.borderColor  = type==='ok' ? 'rgba(69,184,146,.4)'  : 'rgba(217,122,104,.4)';
  t.style.color        = type==='ok' ? '#45b892' : '#d97a68';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function toggleEdit() {
  editing = !editing;
  ['inp-name','inp-college','inp-branch','inp-year'].forEach(id => {
    document.getElementById(id).disabled = !editing;
  });
  document.getElementById('save-btn').style.display = editing ? 'inline-block' : 'none';
  document.querySelector('.edit-btn').textContent = editing ? '✕ Cancel' : '✏️ Edit Profile';
}

async function saveProfile() {
  const body = {
    fullName: document.getElementById('inp-name').value,
    college:  document.getElementById('inp-college').value,
    branch:   document.getElementById('inp-branch').value,
    year:     parseInt(document.getElementById('inp-year').value) || undefined,
  };
  try {
    const r = await fetch(`${API}/profile`, { method:'PUT', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify(body) });
    const d = await r.json();
    if (r.ok) { toast('Profile updated!'); toggleEdit(); load(); }
    else toast(d.message || 'Failed to update', 'err');
  } catch { toast('Server error', 'err'); }
}

async function loadProfileView() {
  try {
    const r  = await fetch(`${API}/profile`, { headers:{ Authorization:'Bearer '+token }});
    const d  = await r.json();
    if (!r.ok) throw new Error(d.message);
    const p  = d.data;

    // Banner
    const name   = p.profile.fullName || 'User';
    const initials = name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    document.getElementById('avatar-initials').textContent = initials;
    document.getElementById('prof-name').textContent  = name;
    document.getElementById('prof-sub').textContent   = p.profile.email;
    document.getElementById('prof-branch').textContent = p.profile.branch   || 'N/A';
    document.getElementById('prof-year').textContent   = p.profile.year ? `${p.profile.year}${['st','nd','rd','th'][Math.min(p.profile.year-1,3)]} Year` : 'N/A';
    document.getElementById('prof-college').textContent = p.profile.college || 'N/A';

    // Stats
    document.getElementById('s-interviews').textContent = p.stats.totalInterviews;
    document.getElementById('s-avg').textContent        = p.stats.avgScore + '%';
    document.getElementById('s-streak').textContent     = p.stats.streak;
    document.getElementById('s-resume').textContent     = p.stats.resumeScore || 'N/A';

    // Form inputs
    document.getElementById('inp-name').value    = p.profile.fullName || '';
    document.getElementById('inp-email').value   = p.profile.email    || '';
    document.getElementById('inp-college').value = p.profile.college  || '';
    document.getElementById('inp-branch').value  = p.profile.branch   || '';
    document.getElementById('inp-year').value    = p.profile.year     || '';

    // Achievements
    const achGrid = document.getElementById('ach-grid');
    const allAch  = [
      { id:'first_interview', icon:'🎯', title:'First Step',       desc:'Complete first interview' },
      { id:'ten_interviews',  icon:'🔥', title:'Consistent',       desc:'10 interviews done' },
      { id:'twenty_five',     icon:'⭐', title:'Interview Pro',    desc:'25 interviews done' },
      { id:'fifty',           icon:'🏆', title:'Elite',            desc:'50 interviews done' },
      { id:'resume_uploaded', icon:'📄', title:'Resume Ready',     desc:'Upload resume' },
      { id:'ats_80',          icon:'🎖️', title:'ATS Champion',    desc:'Resume score > 80' },
      { id:'streak_10',       icon:'🔥', title:'10 Day Streak',   desc:'10 consecutive days of practice' },
      { id:'perfect_score',   icon:'💯', title:'First Perfect Score', desc:'Score 100/100 on an interview' },
    ];
    const earned = new Set((p.achievements||[]).map(a=>a.id));
    achGrid.innerHTML = allAch.map(a => `
      <div class="ach ${earned.has(a.id)?'':'locked'}">
        <div class="ach-icon">${a.icon}</div>
        <div><div class="ach-title">${a.title}</div><div class="ach-desc">${a.desc}</div></div>
      </div>`).join('');

    // Gamification
    const g = p.gamification || {};
    document.getElementById('lv-num').textContent = g.level || 1;
    document.getElementById('level-title').textContent = `Level ${g.level || 1} — ${g.levelTitle || 'Beginner'}`;
    const xpPct = g.xpForNextLevel ? Math.min(100, Math.round((g.xpIntoLevel / g.xpForNextLevel) * 100)) : 0;
    document.getElementById('xp-fill').style.width = xpPct + '%';
    document.getElementById('xp-text').textContent = `${g.xpIntoLevel || 0} / ${g.xpForNextLevel || 150} XP to next level`;
    document.getElementById('coins-val').textContent = g.coins || 0;

    // Badges
    const badges = p.badges || [];
    document.getElementById('badge-grid').innerHTML = badges.map(b => `
      <div class="badge-item ${b.earned?'':'locked'}">
        <div class="badge-icon">${b.icon}</div>
        <div><div class="badge-title">${b.title}</div><div class="badge-desc">${b.desc}</div></div>
      </div>`).join('');

    // Recommendations
    const recs = p.recommendations || [];
    if (recs.length) {
      const icons = { resume:'📄', practice:'🎙️', technical:'💻' };
      const bgMap = { high:'rgba(217,122,104,.12)', medium:'rgba(111,151,236,.12)', low:'rgba(69,184,146,.12)' };
      const colMap = { high:'#d97a68', medium:'#6f97ec', low:'#45b892' };
      document.getElementById('pv-rec-list').innerHTML = recs.map(r => `
        <div class="rec">
          <div class="rec-icon" style="background:${bgMap[r.priority]||bgMap.medium};color:${colMap[r.priority]||colMap.medium}">${icons[r.type]||'💡'}</div>
          <div><div class="rec-text">${r.text}</div><div class="rec-pri ${r.priority}">${r.priority} priority</div></div>
        </div>`).join('');
    }
  } catch(e) {
    // Fallback from localStorage
    const user = JSON.parse(localStorage.getItem('sl_user')||'{}');
    if (user.fullName) {
      document.getElementById('avatar-initials').textContent = user.fullName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
      document.getElementById('prof-name').textContent  = user.fullName;
      document.getElementById('prof-sub').textContent   = user.email;
      document.getElementById('inp-name').value  = user.fullName;
      document.getElementById('inp-email').value = user.email;
    }
  }
  loadBookmarks();
}

async function loadBookmarks() {
  try {
    const [techRes, hrRes] = await Promise.all([
      fetch(`${API}/technical/bookmarks`, { headers:{ Authorization:'Bearer '+token }}).then(r=>r.json()).catch(()=>({data:[]})),
      fetch(`${API}/interview/bookmarks`,  { headers:{ Authorization:'Bearer '+token }}).then(r=>r.json()).catch(()=>({data:[]})),
    ]);
    const bms = [...(techRes.data||[]), ...(hrRes.data||[])].sort((a,b) => new Date(b.savedAt) - new Date(a.savedAt));
    if (!bms.length) return; // keep the default empty-state message
    document.getElementById('bookmark-list').innerHTML = bms.slice(0,10).map(b => `
      <div class="bookmark-item">
        <div class="bookmark-q">${b.text}</div>
        <div class="bookmark-meta"><span>${b.category}</span><span>·</span><span>${(b.qType||'short').toUpperCase()}</span><span>·</span><span>${b.difficulty||'medium'}</span></div>
      </div>`).join('');
  } catch(e) { /* leave default empty-state, non-critical */ }
}

// ── View switching (Dashboard / Analytics / Profile share one sidebar) ──────
let analyticsLoaded = false;
function showView(name) {
  let target = document.getElementById('view-' + name);
  if (!target) { name = 'dashboard'; target = document.getElementById('view-dashboard'); }
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  target.classList.add('active');
  document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.toggle('active', n.dataset.view === name));
  window.scrollTo(0, 0);
  history.replaceState(null, '', name === 'dashboard' ? '/pages/dashboard/dashboard.html' : `/pages/dashboard/dashboard.html#${name}`);
  if (name === 'analytics' && !analyticsLoaded) { analyticsLoaded = true; loadAnalyticsView(); }
  if (name === 'profile') loadProfileView();
  return false; // prevent the <a href> from actually navigating
}

loadDashboard();
loadProfile();

// Open the view matching the URL hash on load (e.g. /pages/dashboard/dashboard.html#profile), default to dashboard
showView(location.hash ? location.hash.slice(1) : 'dashboard');
