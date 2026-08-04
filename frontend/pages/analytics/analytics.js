

const chartDefaults = {
  plugins:{ legend:{ labels:{ color:'rgba(255,255,255,0.5)', font:{ size:11 }}}},
  scales:{ x:{ ticks:{ color:'rgba(255,255,255,0.35)', font:{ size:10 }}, grid:{ color:'rgba(255,255,255,0.05)'}}, y:{ ticks:{ color:'rgba(255,255,255,0.35)', font:{ size:10 }}, grid:{ color:'rgba(255,255,255,0.05)'}}}
};

async function load() {
  try {
    const r  = await fetch(`${API}/analytics`, { headers:{ Authorization:'Bearer '+token }});
    const d  = await r.json();
    if (!r.ok) throw new Error(d.message);
    const dt = d.data;

    // Stats
    document.getElementById('st-total').textContent  = dt.overview.totalInterviews;
    document.getElementById('st-avg').textContent    = dt.overview.avgScore + '%';
    document.getElementById('st-impr').textContent   = (dt.overview.improvement > 0 ? '+':'') + dt.overview.improvement + '%';
    document.getElementById('st-resume').textContent = dt.overview.resumeScore || 'N/A';
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
      document.getElementById('activity-list').innerHTML = dt.recentActivity.map(a => `
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
    document.getElementById('st-total').textContent  = '0';
    document.getElementById('st-avg').textContent    = 'N/A';
    document.getElementById('st-impr').textContent   = 'N/A';
    document.getElementById('st-resume').textContent = 'N/A';
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
load();
