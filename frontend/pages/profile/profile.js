

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

async function load() {
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
      document.getElementById('rec-list').innerHTML = recs.map(r => `
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
load();
