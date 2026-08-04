

let radarChart = null;

function renderFeedback(fb, iv) {
  const typeLabel = iv ? ((iv.category || iv.type || 'Interview').toUpperCase()) : 'Interview';
  const score     = fb.score || 0;
  const scoreColor= score>=75?'#45b892':score>=55?'#e3a344':'#d97a68';

  document.getElementById('latest-feedback').innerHTML = `
    <div class="score-banner">
      <div class="score-circle">
        <div class="score-num" style="color:${scoreColor}">${score}</div>
        <div class="score-lbl">/ 100 — ${typeLabel}</div>
      </div>
      <div class="score-info">
        <h2>Your Feedback Report</h2>
        <p>${fb.aiSummary || 'Your interview has been evaluated by AI. Review the detailed breakdown below.'}</p>
        ${(fb.improvementPlan||[]).length?`<div class="improvement-plan"><h4>📋 Improvement Plan</h4><ul class="plan-steps">${fb.improvementPlan.slice(0,3).map(s=>`<li>${s}</li>`).join('')}</ul></div>`:''}
      </div>
    </div>
    <div class="metrics-grid">
      <div class="metric"><div class="metric-val" style="color:#6f97ec">${fb.communication||score}</div><div class="metric-lbl">Communication</div></div>
      <div class="metric"><div class="metric-val" style="color:#e3a344">${fb.technicalScore||score}</div><div class="metric-lbl">Technical</div></div>
      <div class="metric"><div class="metric-val" style="color:#45b892">${fb.confidence||score}</div><div class="metric-lbl">Confidence</div></div>
      <div class="metric"><div class="metric-val" style="color:#d97a68">${fb.clarity||score}</div><div class="metric-lbl">Clarity</div></div>
      <div class="metric"><div class="metric-val" style="color:#c9a86a">${fb.problemSolving||score}</div><div class="metric-lbl">Problem Solving</div></div>
    </div>
    <div class="two-col">
      <div>
        <div class="card" style="margin-bottom:14px">
          <div class="card-title">✅ Strengths</div>
          <ul class="fb-list str" id="str-list">${(fb.strengths||['Good effort']).map(s=>`<li>${s}</li>`).join('')}</ul>
        </div>
        <div class="card" style="margin-bottom:14px">
          <div class="card-title">⚠️ Areas to Improve</div>
          <ul class="fb-list wk">${(fb.weaknesses||['Keep practicing']).map(s=>`<li>${s}</li>`).join('')}</ul>
        </div>
        <div class="card">
          <div class="card-title">💡 Suggestions</div>
          <ul class="fb-list sg">${(fb.suggestions||['Review fundamentals']).map(s=>`<li>${s}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="card">
        <div class="card-title">🕸️ Skill Radar</div>
        <div class="radar-wrap"><canvas id="radar-chart"></canvas></div>
      </div>
    </div>
    <div class="btn-row">
      <a href="/pages/hr-interview/hr-interview.html"          class="btn-pri">Practice Again</a>
      <a href="/pages/analytics/analytics.html"             class="btn-sec">View Analytics</a>
      <a href="/pages/dashboard/dashboard.html"             class="btn-sec">Dashboard</a>
    </div>`;

  // Draw radar
  requestAnimationFrame(() => {
    const ctx = document.getElementById('radar-chart');
    if (!ctx) return;
    if (radarChart) radarChart.destroy();
    radarChart = new Chart(ctx, {
      type:'radar',
      data:{
        labels:['Communication','Technical','Confidence','Clarity','Problem Solving'],
        datasets:[{
          label:'Your Score',
          data:[fb.communication||score, fb.technicalScore||score, fb.confidence||score, fb.clarity||score, fb.problemSolving||score],
          backgroundColor:'rgba(111,151,236,.15)', borderColor:'#6f97ec',
          borderWidth:2, pointBackgroundColor:'#6f97ec', pointRadius:4,
        }]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        scales:{r:{ticks:{display:false,stepSize:20},grid:{color:'rgba(255,255,255,.08)'},pointLabels:{color:'rgba(255,255,255,.5)',font:{size:11}},min:0,max:100}},
        plugins:{legend:{display:false}}
      }
    });
  });
}

async function load() {
  try {
    const r = await fetch(`${API}/feedback/history`, { headers:{ Authorization:'Bearer '+token }});
    const d = await r.json();
    if (!r.ok) throw new Error(d.message);
    const items = d.data || [];

    if (items.length) {
      renderFeedback(items[0], items[0].interview);
      // History grid
      const icons = { hr:'👥', technical:'💻' };
      const c     = (s)=>s>=75?'#45b892':s>=55?'#e3a344':'#d97a68';
      document.getElementById('history-grid').innerHTML = items.map(f=>`
        <div class="hist-card" onclick="loadOne('${f._id}')">
          <div class="hc-left">
            <div class="hc-icon">${icons[(f.interview&&f.interview.type)||'hr']||'📝'}</div>
            <div>
              <div class="hc-type">${((f.interview&&f.interview.category)||(f.interview&&f.interview.type)||'Interview').toUpperCase()}</div>
              <div class="hc-date">${new Date(f.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div>
            </div>
          </div>
          <div class="hc-score" style="color:${c(f.score)}">${f.score}/100</div>
        </div>`).join('');
    }
  } catch(e) {
    // keep empty state
  }
}

async function loadOne(id) {
  try {
    const r = await fetch(`${API}/feedback/history`, { headers:{ Authorization:'Bearer '+token }});
    const d = await r.json();
    const fb = (d.data||[]).find(f=>f._id===id);
    if (fb) { window.scrollTo(0,0); renderFeedback(fb, fb.interview); }
  } catch(e){}
}

load();
