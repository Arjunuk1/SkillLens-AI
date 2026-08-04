

function logout() { localStorage.removeItem('sl_token'); localStorage.removeItem('sl_user'); location.href = '/pages/landing/landing.html'; }

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tabpanel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
}

function toggleMcqFields() {
  document.getElementById('mcq-opts-box').classList.toggle('show', document.getElementById('af-qtype').value === 'mcq');
}

async function init() {
  if (user.role !== 'admin') {
    document.getElementById('access-denied').style.display = 'block';
    return;
  }
  document.getElementById('page-content').style.display = 'block';
  await Promise.all([loadStats(), loadUsers(), loadMostMissed()]);
}

async function adminFetch(path, opts={}) {
  const r = await fetch(`${API}/admin${path}`, {
    ...opts,
    headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+token, ...(opts.headers||{}) },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || 'Request failed');
  return d;
}

async function loadStats() {
  try {
    const d = await adminFetch('/stats');
    const s = d.data;
    document.getElementById('st-users').textContent = s.totalUsers;
    document.getElementById('st-interviews').textContent = s.totalInterviews;
    document.getElementById('st-questions').textContent = s.totalQuestions;
    document.getElementById('st-resumes').textContent = s.totalResumes;
    document.getElementById('st-avg').textContent = s.avgScore + '/100';

    document.getElementById('cat-breakdown-body').innerHTML = s.categoryBreakdown.length
      ? s.categoryBreakdown.map(c => `<tr><td>${c.category}</td><td>${c.count}</td><td>${c.avgScore}/100</td></tr>`).join('')
      : `<tr><td colspan="3" class="empty">No completed interviews yet</td></tr>`;

    const signupEntries = Object.entries(s.signupsLast30Days || {});
    const totalSignups = signupEntries.reduce((sum,[,v]) => sum+v, 0);
    document.getElementById('signup-summary').textContent = totalSignups
      ? `${totalSignups} new user(s) signed up in the last 30 days across ${signupEntries.length} active day(s).`
      : 'No new signups in the last 30 days.';
  } catch(e) {
    document.getElementById('cat-breakdown-body').innerHTML = `<tr><td colspan="3" class="empty">Could not load — is the backend running?</td></tr>`;
  }
}

async function loadUsers() {
  try {
    const d = await adminFetch('/users');
    const users = d.data || [];
    document.getElementById('users-body').innerHTML = users.length ? users.map(u => `
      <tr>
        <td>${u.fullName || '—'}</td>
        <td>${u.email}</td>
        <td><span class="badge ${u.role==='admin'?'b-admin':'b-user'}">${u.role}</span></td>
        <td>${u.interviewCount ?? 0}</td>
        <td>${u.resumeCount ?? 0}</td>
        <td>${new Date(u.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</td>
      </tr>`).join('') : `<tr><td colspan="6" class="empty">No users found</td></tr>`;
  } catch(e) {
    document.getElementById('users-body').innerHTML = `<tr><td colspan="6" class="empty">Could not load users</td></tr>`;
  }
}

async function loadMostMissed() {
  try {
    const d = await adminFetch('/most-missed');
    const rows = d.data || [];
    document.getElementById('missed-body').innerHTML = rows.length ? rows.map(q => `
      <tr>
        <td style="max-width:340px">${q.text}</td>
        <td>${q.category}</td>
        <td><span class="badge ${q.qType==='mcq'?'b-tech':'b-hr'}">${q.qType}</span></td>
        <td>${q.attempts}</td>
        <td>${q.avgScore}/100</td>
        <td><span class="badge ${q.missRate>=60?'b-high':q.missRate>=30?'b-mid':'b-low'}">${q.missRate}%</span></td>
      </tr>`).join('') : `<tr><td colspan="6" class="empty">Not enough attempt data yet — this fills in as users complete technical interviews.</td></tr>`;
  } catch(e) {
    document.getElementById('missed-body').innerHTML = `<tr><td colspan="6" class="empty">Could not load — is the backend running?</td></tr>`;
  }
}

async function submitAddQuestion() {
  const msg = document.getElementById('add-msg');
  msg.className = 'form-msg'; msg.textContent = '';
  const qType = document.getElementById('af-qtype').value;
  const body = {
    type: document.getElementById('af-type').value,
    category: document.getElementById('af-category').value,
    qType,
    text: document.getElementById('af-text').value.trim(),
    difficulty: document.getElementById('af-difficulty').value,
    tags: document.getElementById('af-tags').value.split(',').map(t=>t.trim()).filter(Boolean),
  };
  if (qType === 'mcq') {
    const optionInputs = document.querySelectorAll('.mcq-opt-text');
    body.options = Array.from(optionInputs).map(i => i.value.trim()).filter(Boolean);
    const checked = document.querySelector('input[name="af-correct"]:checked');
    body.correctIndex = checked ? parseInt(checked.value) : 0;
  }
  if (!body.text) { msg.className = 'form-msg err'; msg.textContent = 'Question text is required.'; return; }
  try {
    await adminFetch('/question', { method:'POST', body: JSON.stringify(body) });
    msg.className = 'form-msg ok'; msg.textContent = '✓ Question added successfully.';
    document.getElementById('af-text').value = '';
    document.querySelectorAll('.mcq-opt-text').forEach(i => i.value = '');
    loadStats();
  } catch(e) {
    msg.className = 'form-msg err'; msg.textContent = e.message;
  }
}

function loadTemplate() {
  document.getElementById('bulk-json').value = JSON.stringify([
    { type:'technical', category:'DSA', qType:'mcq', text:'Which data structure uses FIFO order?', options:['Stack','Queue','Tree','Graph'], correctIndex:1, difficulty:'easy', tags:['DSA','Queue'] },
    { type:'technical', category:'DBMS', qType:'short', text:'Explain the difference between a primary key and a foreign key.', difficulty:'medium', tags:['DBMS'] },
    { type:'hr', category:'HR', qType:'short', text:'Tell me about a time you disagreed with a teammate and how you resolved it.', difficulty:'medium' },
  ], null, 2);
}

async function submitBulkUpload() {
  const msg = document.getElementById('bulk-msg');
  const errBox = document.getElementById('bulk-errors');
  msg.className = 'form-msg'; msg.textContent = ''; errBox.innerHTML = '';
  let parsed;
  try { parsed = JSON.parse(document.getElementById('bulk-json').value); }
  catch(e) { msg.className = 'form-msg err'; msg.textContent = 'Invalid JSON — please check the format.'; return; }
  if (!Array.isArray(parsed)) { msg.className = 'form-msg err'; msg.textContent = 'JSON must be an array of question objects.'; return; }
  try {
    const d = await adminFetch('/questions/bulk', { method:'POST', body: JSON.stringify({ questions: parsed }) });
    msg.className = d.success ? 'form-msg ok' : 'form-msg err';
    msg.textContent = d.message;
    if (d.errors && d.errors.length) {
      errBox.innerHTML = `<div class="mono-hint">${d.errors.map(e => `Row ${e.index}: ${e.error} — "${e.text}"`).join('\n')}</div>`;
    }
    loadStats();
  } catch(e) {
    msg.className = 'form-msg err'; msg.textContent = e.message;
  }
}

init();
