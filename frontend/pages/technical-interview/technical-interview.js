

const ACTIVE_SESSION_KEY = 'sl_active_interview_session';
let selCat = null, selDiff = 'mixed', selCount = 10, selDuration = 25;
let questions = [], answers = [], current = 0, sessionId = null;
let sessionTimer = null, sessionSecondsLeft = 0, sessionStartTime = null, sessionExpiresAt = null;
let hintUsedForCurrent = false;
let lastEvaluations = [];
let hintTimer = null, toastTimer = null;

function setActiveSession() {
  persistSessionState();
}

function clearActiveSession() {
  localStorage.removeItem(ACTIVE_SESSION_KEY);
}

function persistSessionState() {
  if (!sessionId || !questions.length) return;
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
      type: 'technical', sessionId, questions, answers, current, sessionSecondsLeft,
      sessionStartTime, sessionExpiresAt, selCat, selDiff, selCount, selDuration,
    }));
  } catch (e) { console.warn('Could not save interview recovery state:', e.message); }
}

function restoreActiveSession() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY)); } catch (e) { clearActiveSession(); return; }
  if (!saved || saved.type !== 'technical' || !saved.sessionId || !Array.isArray(saved.questions) || !saved.questions.length) return;

  sessionId = saved.sessionId; questions = saved.questions; answers = saved.answers || questions.map(q => ({ questionId: q.id, question: q.text, answer: '' }));
  current = Math.min(Math.max(0, saved.current || 0), questions.length - 1);
  sessionSecondsLeft = saved.sessionSecondsLeft || 0; sessionStartTime = saved.sessionStartTime || Date.now();
  sessionExpiresAt = saved.sessionExpiresAt || (Date.now() + sessionSecondsLeft * 1000);
  selCat = saved.selCat || null; selDiff = saved.selDiff || 'mixed'; selCount = saved.selCount || questions.length; selDuration = saved.selDuration || 25;
  goToStep('screen-q'); document.getElementById('session-timer').classList.add('show'); showQ(current); startSessionTimer();
}

async function quitActiveSession() {
  clearInterval(sessionTimer);
  try {
    await fetch(`${API}/technical/quit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ sessionId }),
    });
  } catch (e) { /* still navigate away */ }
  clearActiveSession();
  location.href = '/pages/dashboard/dashboard.html';
}

function confirmQuitAndGoDashboard(event) {
  if (event) event.preventDefault();
  if (!sessionId || document.getElementById('screen-result').classList.contains('active')) {
    location.href = '/pages/dashboard/dashboard.html';
    return false;
  }
  openQuitModal();
  return false;
}

function openQuitModal() { document.getElementById('quit-modal').classList.add('show'); }
function closeQuitModal() { document.getElementById('quit-modal').classList.remove('show'); }
function openSubmitModal() {
  const attempted = answers.filter(a => String(a.answer || '').trim()).length;
  document.getElementById('submit-modal-count').textContent = `You have attempted ${attempted} of ${questions.length} questions. Are you sure you want to submit?`;
  document.getElementById('submit-modal').classList.add('show');
}
function closeSubmitModal() { document.getElementById('submit-modal').classList.remove('show'); }
function confirmSubmit() { closeSubmitModal(); submitAnswers(); }
function showSessionToast(message) {
  const toast = document.getElementById('session-toast');
  toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── Step navigation ──────────────────────────────────────────────
function goToStep(id) {
  if (id === 'screen-instr') fillInstructions();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
}

// ── Step 1: category ──────────────────────────────────────────────
function selectCat(cat, el) {
  selCat = cat;
  document.querySelectorAll('#screen-cat .cat-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('btn-cat-continue').classList.add('enabled');
}

// ── Step 2: difficulty / count / duration ──────────────────────────
function selectDiff(diff, el) {
  selDiff = diff;
  document.querySelectorAll('#diff-row .pick-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}
function selectCount(count, el) {
  document.querySelectorAll('#count-row .pick-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const input = document.getElementById('custom-count-input');
  if (count === 'custom') {
    input.classList.add('show'); input.focus();
    selCount = parseInt(input.value) || 10;
  } else {
    input.classList.remove('show');
    selCount = count;
  }
}
function onCustomCount(val) {
  const n = Math.min(30, Math.max(1, parseInt(val) || 1));
  selCount = n;
}
function selectDuration(dur, el) {
  selDuration = dur;
  document.querySelectorAll('#duration-row .pick-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

// ── Step 3: instructions summary ──────────────────────────────────
function fillInstructions() {
  document.getElementById('instr-cat').textContent = selCat;
  document.getElementById('instr-diff').textContent = selDiff.charAt(0).toUpperCase() + selDiff.slice(1);
  document.getElementById('instr-count').textContent = selCount;
  document.getElementById('instr-dur').textContent = selDuration + ' min';
  document.getElementById('instr-sub').textContent = `${selCat} · ${selDiff} · ${selCount} questions · ${selDuration} minutes`;
}

// ── Step 4: start interview ──────────────────────────────────────
async function startTechnical() {
  const btn = document.getElementById('btn-start-tech');
  btn.textContent = 'Starting...'; btn.classList.remove('enabled');
  try {
    const r = await fetch(`${API}/technical/start`, {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body: JSON.stringify({ category: selCat, difficulty: selDiff, count: selCount, duration: selDuration })
    });
    const d = await r.json();
    if (!r.ok) { alert(d.message || 'Failed to start. Make sure the backend is running.'); btn.textContent = 'Start Interview →'; btn.classList.add('enabled'); return; }
    questions  = d.data.questions;
    sessionId  = d.data.sessionId;
    sessionSecondsLeft = d.data.durationSeconds;
    sessionStartTime = Date.now();
    sessionExpiresAt = sessionStartTime + sessionSecondsLeft * 1000;
    answers = questions.map(q => ({ questionId: q.id, question: q.text, answer: '' }));
    setActiveSession();
    goToStep('screen-q');
    document.getElementById('session-timer').classList.add('show');
    startSessionTimer();
    showQ(0);
  } catch(e) {
    alert('Cannot connect to server. Please make sure the backend is running.');
    btn.textContent = 'Start Interview →'; btn.classList.add('enabled');
  }
}

// ── Session-wide countdown timer ──────────────────────────────────
function startSessionTimer() {
  clearInterval(sessionTimer);
  if (sessionExpiresAt) sessionSecondsLeft = Math.max(0, Math.ceil((sessionExpiresAt - Date.now()) / 1000));
  updateSessionTimerDisplay();
  persistSessionState();
  sessionTimer = setInterval(() => {
    sessionSecondsLeft = sessionExpiresAt ? Math.max(0, Math.ceil((sessionExpiresAt - Date.now()) / 1000)) : Math.max(0, sessionSecondsLeft - 1);
    updateSessionTimerDisplay();
    persistSessionState();
    if (sessionSecondsLeft <= 0) { clearInterval(sessionTimer); submitAnswers(); }
  }, 1000);
}
function updateSessionTimerDisplay() {
  const el = document.getElementById('session-timer-text');
  const m = String(Math.floor(Math.max(0,sessionSecondsLeft)/60)).padStart(2,'0');
  const s = String(Math.max(0,sessionSecondsLeft)%60).padStart(2,'0');
  el.textContent = `${m}:${s}`;
  document.getElementById('session-timer').classList.toggle('low', sessionSecondsLeft <= 60);
}

// ── Question rendering ──────────────────────────────────────────
function showQ(i) {
  current = i;
  const q = questions[i];
  hintUsedForCurrent = Boolean(q.hint);
  document.getElementById('q-counter').textContent = `Question ${i+1} of ${questions.length}`;
  document.getElementById('q-text').textContent = q.text;
  document.getElementById('q-diff').textContent = q.difficulty || 'medium';
  document.getElementById('q-diff').className = `diff-badge ${q.difficulty || 'medium'}`;
  document.getElementById('q-cat').textContent = selCat;
  document.getElementById('q-type').textContent = q.qType === 'mcq' ? 'Multiple Choice' : (q.qType === 'scenario' ? 'Scenario' : 'Theory');
  document.getElementById('btn-next').textContent = i === questions.length-1 ? 'Submit ✓' : 'Next →';
  document.getElementById('btn-prev').disabled = i === 0;
  document.getElementById('progress-bar').style.width = `${((i+1)/questions.length)*100}%`;

  clearTimeout(hintTimer);
  document.getElementById('hint-box').classList.remove('show');
  document.getElementById('btn-hint').disabled = false;
  document.getElementById('btn-bookmark').textContent = '☆';
  document.getElementById('btn-bookmark').classList.remove('bookmarked');

  const mcqArea = document.getElementById('answer-area-mcq');
  const shortArea = document.getElementById('answer-area-short');
  if (q.qType === 'mcq') {
    mcqArea.style.display = 'block'; shortArea.style.display = 'none';
    const box = document.getElementById('mcq-options');
    box.innerHTML = (q.options || []).map((opt, idx) => `
      <div class="mcq-opt" data-idx="${idx}" onclick="selectMcq(${idx})">
        <div class="mcq-radio"></div>
        <div class="mcq-opt-text">${opt}</div>
      </div>`).join('');
    const savedAns = answers[i].answer;
    if (savedAns !== '') highlightMcq(parseInt(savedAns));
  } else {
    mcqArea.style.display = 'none'; shortArea.style.display = 'block';
    document.getElementById('answer-box').value = answers[i].answer || '';
  }
  persistSessionState();
}

function selectMcq(idx) {
  answers[current].answer = String(idx);
  highlightMcq(idx);
  persistSessionState();
}

function saveCurrentAnswer() {
  answers[current].answer = document.getElementById('answer-box').value;
  persistSessionState();
}
function highlightMcq(idx) {
  document.querySelectorAll('#mcq-options .mcq-opt').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.idx) === idx);
  });
}

// ── Hint ──────────────────────────────────────────────────────────
async function requestHint() {
  const q = questions[current];
  const btn = document.getElementById('btn-hint');
  if (hintUsedForCurrent && q.hint) { showHint(q.hint); return; }
  btn.disabled = true; btn.textContent = '⏳';
  try {
    const r = await fetch(`${API}/technical/hint`, {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body: JSON.stringify({ sessionId, questionId: q.id })
    });
    const d = await r.json();
    btn.textContent = '💡';
    if (!r.ok) { alert(d.message || 'Could not get a hint right now.'); btn.disabled = false; return; }
    q.hint = d.data.hint;
    showHint(q.hint);
    hintUsedForCurrent = true;
    btn.disabled = false;
  } catch(e) {
    btn.textContent = '💡'; btn.disabled = false;
    alert('Could not reach the server for a hint.');
  }
}

function showHint(hint) {
  document.getElementById('hint-text').textContent = hint;
  document.getElementById('hint-box').classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => document.getElementById('hint-box').classList.remove('show'), 6000);
}

// ── Bookmark ──────────────────────────────────────────────────────
async function toggleBookmark() {
  const q = questions[current];
  const btn = document.getElementById('btn-bookmark');
  const nowBookmarked = !btn.classList.contains('bookmarked');
  try {
    const r = await fetch(`${API}/technical/bookmark`, {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body: JSON.stringify({ sessionId, questionId: q.id, bookmarked: nowBookmarked })
    });
    if (!r.ok) return;
    btn.classList.toggle('bookmarked', nowBookmarked);
    btn.textContent = nowBookmarked ? '★' : '☆';
  } catch(e) { /* silent - non-critical */ }
}

// ── Navigation between questions ──────────────────────────────────
function skipQ() {
  answers[current].answer = '';
  persistSessionState();
  if (current === questions.length - 1) {
    showSessionToast('This is the last question. Use Submit when you are ready to finish.');
    return;
  }
  advanceQuestion();
}

function prevQ() {
  if (questions[current].qType !== 'mcq') answers[current].answer = document.getElementById('answer-box').value;
  persistSessionState();
  if (current > 0) showQ(current - 1);
}

function nextQ() {
  if (questions[current].qType !== 'mcq') {
    answers[current].answer = document.getElementById('answer-box').value;
  }
  if (current === questions.length - 1) {
    openSubmitModal();
    return;
  }
  if (!String(answers[current].answer || '').trim()) {
    showSessionToast(questions[current].qType === 'mcq' ? 'Select an option before continuing, or use Skip.' : 'Enter an answer before continuing, or use Skip.');
    return;
  }
  persistSessionState();
  advanceQuestion();
}

function advanceQuestion() {
  if (current < questions.length-1) showQ(current+1);
}

// ── Submit & grade ──────────────────────────────────────────────
async function submitAnswers() {
  clearInterval(sessionTimer);
  goToStep('screen-submitting');
  const timeTakenSeconds = Math.round((Date.now() - sessionStartTime) / 1000);
  try {
    const r = await fetch(`${API}/technical/submit`, {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body: JSON.stringify({ sessionId, answers, timeTakenSeconds })
    });
    const d = await r.json();
    if (!r.ok) { alert(d.message || 'Submission failed. Please try again.'); goToStep('screen-q'); return; }
    clearActiveSession();
    showResult(d.data);
  } catch(e) {
    alert('Could not reach the server to grade your interview. Please check your connection and try again — your answers were not lost, just resubmit.');
    goToStep('screen-q');
  }
}

// ── Results ──────────────────────────────────────────────────────
function fmtTime(sec) {
  if (!sec && sec !== 0) return '--';
  const m = Math.floor(sec/60), s = sec%60;
  return `${m}m ${s}s`;
}

function showResult(data) {
  goToStep('screen-result');
  document.getElementById('progress-bar').style.width = '100%';
  document.getElementById('session-timer').classList.remove('show');
  document.getElementById('result-cat-label').textContent = `${selCat} · ${selDiff} · Overall Score`;
  const fb = data.feedback || {};
  document.getElementById('final-score').textContent = (data.score ?? '--') + (data.score != null ? '/100' : '');
  document.getElementById('stat-accuracy').textContent = data.accuracy != null ? data.accuracy + '%' : 'N/A';
  document.getElementById('stat-time').textContent = fmtTime(data.timeTakenSeconds);
  document.getElementById('stat-answered').textContent = (data.evaluations || []).filter(e => e.answer && e.answer.trim() !== '').length + '/' + (data.evaluations || []).length;
  document.getElementById('ai-summary-text').textContent = fb.summary || 'Interview completed.';

  const chipify = (list, cls) => (list && list.length) ? list.map(t => `<span class="topic-chip ${cls}">${t}</span>`).join('') : '<span style="color:var(--muted);font-size:13px">Not enough data yet</span>';
  document.getElementById('strong-topics').innerHTML = chipify(data.strongTopics, 'topic-strong');
  document.getElementById('weak-topics').innerHTML = chipify(data.weakTopics, 'topic-weak');

  const rl = (id,items) => { document.getElementById(id).innerHTML = (items||[]).map(i=>`<li>${i}</li>`).join('') || '<li style="list-style:none;padding-left:0;color:var(--muted)">None recorded</li>'; };
  rl('strengths-list', fb.strengths);
  rl('weak-list', fb.weaknesses);
  rl('rec-list', data.recommendedPractice);

  lastEvaluations = data.evaluations || [];
  renderEvalDetail();
}

function renderEvalDetail() {
  const box = document.getElementById('eval-detail');
  box.innerHTML = lastEvaluations.map((e, i) => {
    if (e.evalFailed) {
      return `<div class="eval-item"><div class="eval-q">Q${i+1}. ${e.question}</div><span class="eval-badge eval-wrong">AI evaluation failed</span></div>`;
    }
    if (e.qType === 'mcq') {
      const badge = e.correct ? `<span class="eval-badge eval-correct">Correct</span>` : `<span class="eval-badge eval-wrong">Incorrect${e.options ? ' — correct answer: ' + e.options[e.correctIndex] : ''}</span>`;
      return `<div class="eval-item"><div class="eval-q">Q${i+1}. ${e.question}</div>${badge}</div>`;
    }
    return `<div class="eval-item">
      <div class="eval-q">Q${i+1}. ${e.question}</div>
      <span class="eval-badge eval-score">Score: ${e.score ?? '--'}/100</span>
      ${e.idealAnswer ? `<div style="font-size:12.5px;color:var(--muted);margin-top:8px"><strong style="color:rgba(255,255,255,.6)">Ideal answer:</strong> ${e.idealAnswer}</div>` : ''}
    </div>`;
  }).join('');
}

function toggleEvalDetail() {
  const box = document.getElementById('eval-detail');
  const btn = document.getElementById('eval-toggle-btn');
  const show = box.style.display === 'none';
  box.style.display = show ? 'block' : 'none';
  btn.textContent = show ? 'Hide details' : 'Show details';
}

window.addEventListener('beforeunload', (event) => {
  if (sessionId && document.getElementById('screen-q').classList.contains('active')) {
    persistSessionState();
    event.preventDefault();
    event.returnValue = '';
  }
});

restoreActiveSession();
