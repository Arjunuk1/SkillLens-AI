

const ACTIVE_SESSION_KEY = 'sl_active_interview_session';
let selCat = null, selDiff = 'mixed', selCount = 10, selDuration = 25, selRole = '';
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
    const savedAnswers = answers.map(({ audioBase64, audioMimeType, ...answer }) => answer);
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
      type: 'hr', sessionId, questions, answers: savedAnswers, current, sessionSecondsLeft,
      sessionStartTime, sessionExpiresAt, selCat, selDiff, selCount, selDuration, selRole,
    }));
  } catch (e) { console.warn('Could not save interview recovery state:', e.message); }
}

function restoreActiveSession() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY)); } catch (e) { clearActiveSession(); return; }
  if (!saved || saved.type !== 'hr' || !saved.sessionId || !Array.isArray(saved.questions) || !saved.questions.length) return;

  sessionId = saved.sessionId; questions = saved.questions; answers = saved.answers || questions.map(q => ({ questionId: q.id, question: q.text, answer: '' }));
  current = Math.min(Math.max(0, saved.current || 0), questions.length - 1);
  sessionSecondsLeft = saved.sessionSecondsLeft || 0; sessionStartTime = saved.sessionStartTime || Date.now();
  sessionExpiresAt = saved.sessionExpiresAt || (Date.now() + sessionSecondsLeft * 1000);
  selCat = saved.selCat || 'mixed'; selDiff = saved.selDiff || 'mixed'; selCount = saved.selCount || questions.length; selDuration = saved.selDuration || 25; selRole = saved.selRole || '';
  goToStep('screen-q'); document.getElementById('session-timer').classList.add('show'); showQuestion(current); startSessionTimer();
}

async function quitActiveSession() {
  clearInterval(sessionTimer);
  try {
    await fetch(`${API}/interview/quit`, {
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

// ── Voice input (Web Speech API transcription + MediaRecorder audio capture for Gemini vocal analysis) ──
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null, isListening = false, baseTextBeforeListening = '';
let mediaRecorder = null, audioChunks = [], micStream = null;
let recordedMimeTypeFull = '', recordedMimeTypeBase = '';
const AUDIO_MIME_CANDIDATES = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

function pickSupportedAudioMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  for (const m of AUDIO_MIME_CANDIDATES) { if (MediaRecorder.isTypeSupported(m)) return m; }
  return '';
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result || '').split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

if (SpeechRec) {
  recognition = new SpeechRec();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-IN';
  recognition.onresult = (e) => {
    let finalTranscript = '', interimTranscript = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalTranscript += t + ' '; else interimTranscript += t;
    }
    if (finalTranscript) baseTextBeforeListening = (baseTextBeforeListening + ' ' + finalTranscript).trim() + ' ';
    document.getElementById('answer-box').value = (baseTextBeforeListening + interimTranscript).trim();
    updateChar();
  };
  recognition.onerror = (e) => {
    console.error('Speech recognition error:', e.error);
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      alert('Microphone access was denied. Please allow microphone permissions to use voice input.');
    }
    stopListening();
  };
  recognition.onend = () => { if (isListening) { try { recognition.start(); } catch(e){} } }; // auto-restart if still "on"
} else {
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('mic-btn');
    btn.classList.add('unsupported');
    btn.title = 'Voice input is not supported in this browser. Try Chrome or Edge.';
  });
}

async function toggleMic() {
  if (!SpeechRec) return;
  if (isListening) await stopListening(); else await startListening();
}

async function startListening() {
  baseTextBeforeListening = document.getElementById('answer-box').value;
  isListening = true;
  try { recognition.start(); } catch(e) { /* already started */ }
  document.getElementById('mic-btn').classList.add('listening');
  document.getElementById('mic-btn-label').textContent = 'Listening... (tap to stop)';
  document.getElementById('answer-box').classList.add('listening');

  // Record real audio alongside the live transcript, so Gemini can analyze actual vocal delivery
  // (pace, tone, filler words) rather than just the transcribed text.
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chosenMime = pickSupportedAudioMime();
    recordedMimeTypeFull = chosenMime;
    mediaRecorder = chosenMime ? new MediaRecorder(micStream, { mimeType: chosenMime }) : new MediaRecorder(micStream);
    recordedMimeTypeBase = (mediaRecorder.mimeType || chosenMime || 'audio/webm').split(';')[0];
    // Gemini's supported audio MIME list includes audio/webm, audio/mp4, and
    // audio/opus — but NOT bare "audio/ogg". Browsers (mainly Firefox) that
    // record into an Ogg container report it as 'audio/ogg', which Gemini
    // would silently reject. Same bytes, correct label.
    if (recordedMimeTypeBase === 'audio/ogg') recordedMimeTypeBase = 'audio/opus';
    audioChunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.start();
  } catch (e) {
    console.error('Could not start audio recording for vocal analysis (voice-to-text will still work):', e.message);
    mediaRecorder = null;
  }
}

function stopListening() {
  isListening = false;
  try { recognition.stop(); } catch(e) {}
  document.getElementById('mic-btn').classList.remove('listening');
  document.getElementById('mic-btn-label').textContent = '🎤 Speak Answer';
  document.getElementById('answer-box').classList.remove('listening');
  answers[current].answer = document.getElementById('answer-box').value;

  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
      resolve(); return;
    }
    mediaRecorder.onstop = async () => {
      try {
        if (audioChunks.length > 0) {
          const blob = new Blob(audioChunks, { type: recordedMimeTypeFull || 'audio/webm' });
          answers[current].audioBase64 = await blobToBase64(blob);
          answers[current].audioMimeType = recordedMimeTypeBase;
        }
      } catch (e) { console.error('Audio processing failed (transcript-only answer will still be graded):', e.message); }
      if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
      resolve();
    };
    try { mediaRecorder.stop(); } catch(e) { resolve(); }
  });
}

// ── Step navigation ──────────────────────────────────────────────
function goToStep(id) {
  if (id === 'screen-instr') fillInstructions();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
}

function selectCat(cat, el) {
  selCat = cat;
  document.querySelectorAll('#screen-cat .cat-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('btn-cat-continue').classList.add('enabled');
}
function selectDiff(diff, el) {
  selDiff = diff;
  document.querySelectorAll('#diff-row .pick-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}
function selectCount(count, el) {
  document.querySelectorAll('#count-row .pick-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const input = document.getElementById('custom-count-input');
  if (count === 'custom') { input.classList.add('show'); input.focus(); selCount = parseInt(input.value) || 10; }
  else { input.classList.remove('show'); selCount = count; }
}
function onCustomCount(val) { selCount = Math.min(20, Math.max(1, parseInt(val) || 1)); }
function selectDuration(dur, el) {
  selDuration = dur;
  document.querySelectorAll('#duration-row .pick-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

function fillInstructions() {
  selRole = document.getElementById('target-role-input').value.trim();
  const catLabel = selCat === 'mixed' ? 'Mixed' : selCat;
  document.getElementById('instr-cat').textContent = catLabel;
  document.getElementById('instr-diff').textContent = selDiff.charAt(0).toUpperCase() + selDiff.slice(1);
  document.getElementById('instr-count').textContent = selCount;
  document.getElementById('instr-dur').textContent = selDuration + ' min';
  document.getElementById('instr-sub').textContent = `${catLabel} · ${selDiff} · ${selCount} questions · ${selDuration} minutes`;
}

async function startInterview() {
  const btn = document.getElementById('btn-start-hr');
  btn.textContent = 'Starting...'; btn.classList.remove('enabled');
  try {
    const r = await fetch(`${API}/interview/start`, {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body: JSON.stringify({ category: selCat, difficulty: selDiff, count: selCount, duration: selDuration, targetRole: selRole })
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
    showQuestion(0);
  } catch(e) {
    alert('Cannot connect to server. Please make sure the backend is running.');
    btn.textContent = 'Start Interview →'; btn.classList.add('enabled');
  }
}

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

function showQuestion(i) {
  current = i;
  const q = questions[i];
  hintUsedForCurrent = Boolean(q.hint);
  if (isListening) stopListening();
  document.getElementById('q-counter').textContent = `Question ${i+1} of ${questions.length}`;
  document.getElementById('q-text').textContent    = q.text;
  document.getElementById('q-diff').textContent    = q.difficulty || 'medium';
  document.getElementById('q-diff').className      = `diff-badge ${q.difficulty || 'medium'}`;
  document.getElementById('q-cat').textContent     = q.category || selCat;
  document.getElementById('answer-box').value      = answers[i].answer || '';
  document.getElementById('char-count').textContent = (answers[i].answer || '').length + ' characters';
  document.getElementById('btn-next').textContent  = i === questions.length - 1 ? 'Submit ✓' : 'Next →';
  document.getElementById('btn-prev').disabled = i === 0;
  document.getElementById('progress-bar').style.width = `${((i+1)/questions.length)*100}%`;
  clearTimeout(hintTimer);
  document.getElementById('hint-box').classList.remove('show');
  document.getElementById('btn-hint').disabled = false;
  document.getElementById('btn-bookmark').textContent = '☆';
  document.getElementById('btn-bookmark').classList.remove('bookmarked');
  persistSessionState();
}

function updateChar() {
  const val = document.getElementById('answer-box').value;
  document.getElementById('char-count').textContent = val.length + ' characters';
  answers[current].answer = val;
  persistSessionState();
}

async function requestHint() {
  const q = questions[current];
  const btn = document.getElementById('btn-hint');
  if (hintUsedForCurrent && q.hint) { showHint(q.hint); return; }
  btn.disabled = true; btn.textContent = '⏳';
  try {
    const r = await fetch(`${API}/interview/hint`, {
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
  } catch(e) { btn.textContent = '💡'; btn.disabled = false; alert('Could not reach the server for a hint.'); }
}

function showHint(hint) {
  document.getElementById('hint-text').textContent = hint;
  document.getElementById('hint-box').classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => document.getElementById('hint-box').classList.remove('show'), 6000);
}

async function toggleBookmark() {
  const q = questions[current];
  const btn = document.getElementById('btn-bookmark');
  const nowBookmarked = !btn.classList.contains('bookmarked');
  try {
    const r = await fetch(`${API}/interview/bookmark`, {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body: JSON.stringify({ sessionId, questionId: q.id, bookmarked: nowBookmarked })
    });
    if (!r.ok) return;
    btn.classList.toggle('bookmarked', nowBookmarked);
    btn.textContent = nowBookmarked ? '★' : '☆';
  } catch(e) { /* silent - non-critical */ }
}

async function skipQuestion() {
  if (isListening) await stopListening();
  document.getElementById('answer-box').value = '';
  answers[current].answer = '';
  answers[current].audioBase64 = undefined;
  answers[current].audioMimeType = undefined;
  persistSessionState();
  if (current === questions.length - 1) {
    showSessionToast('This is the last question. Use Submit when you are ready to finish.');
    return;
  }
  await advanceQuestion();
}

async function nextQuestion() {
  if (isListening) await stopListening();
  else answers[current].answer = document.getElementById('answer-box').value;
  if (current === questions.length - 1) {
    openSubmitModal();
    return;
  }
  if (!String(answers[current].answer || '').trim()) {
    showSessionToast('Enter an answer before continuing, or use Skip.');
    return;
  }
  await advanceQuestion();
}

async function prevQuestion() {
  if (isListening) await stopListening();
  else answers[current].answer = document.getElementById('answer-box').value;
  persistSessionState();
  if (current > 0) showQuestion(current - 1);
}

async function advanceQuestion() {
  if (current < questions.length - 1) showQuestion(current + 1);
}

async function submitAnswers() {
  if (isListening) await stopListening();
  clearInterval(sessionTimer);
  goToStep('screen-submitting');
  const timeTakenSeconds = Math.round((Date.now() - sessionStartTime) / 1000);
  try {
    const r = await fetch(`${API}/interview/submit`, {
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

function fmtTime(sec) {
  if (!sec && sec !== 0) return '--';
  const m = Math.floor(sec/60), s = sec%60;
  return `${m}m ${s}s`;
}

function showResult(data) {
  goToStep('screen-result');
  document.getElementById('progress-bar').style.width = '100%';
  document.getElementById('session-timer').classList.remove('show');
  const catLabel = selCat === 'mixed' ? 'Mixed' : selCat;
  document.getElementById('result-cat-label').textContent = `${catLabel} · ${selDiff} · Overall Score`;
  const fb = data.feedback || {};
  document.getElementById('final-score').textContent = (data.score ?? '--') + (data.score != null ? '/100' : '');
  document.getElementById('stat-time').textContent = fmtTime(data.timeTakenSeconds);
  document.getElementById('stat-answered').textContent = (data.evaluations || []).filter(e => e.answer && e.answer.trim() !== '').length + '/' + (data.evaluations || []).length;
  const confVals = (data.evaluations || []).filter(e => e.confidence != null).map(e => e.confidence);
  document.getElementById('stat-confidence').textContent = confVals.length ? Math.round(confVals.reduce((a,b)=>a+b,0)/confVals.length) + '/100' : 'N/A';
  document.getElementById('ai-summary-text').textContent = fb.summary || 'Interview completed.';

  // STAR breakdown
  const star = data.starBreakdown || {};
  ['situation','task','action','result'].forEach(k => {
    const v = star[k];
    document.getElementById(`star-${k}-val`).textContent = v != null ? v : '—';
    document.getElementById(`star-${k}-bar`).style.width = (v || 0) + '%';
  });

  // Vocal delivery (only shown if at least one answer was actually spoken and analyzed)
  const vocal = data.vocalDelivery || {};
  if (vocal.answersAnalyzed > 0) {
    document.getElementById('vocal-card').style.display = 'block';
    document.getElementById('vocal-pace-val').textContent = vocal.paceScore ?? '—';
    document.getElementById('vocal-pace-bar').style.width = (vocal.paceScore || 0) + '%';
    document.getElementById('vocal-pace-label').textContent = vocal.paceScore >= 70 ? 'Steady pace' : 'Room to improve';
    document.getElementById('vocal-confidence-val').textContent = vocal.confidenceScore ?? '—';
    document.getElementById('vocal-confidence-bar').style.width = (vocal.confidenceScore || 0) + '%';
    document.getElementById('vocal-filler-val').textContent = vocal.fillerWordScore ?? '—';
    document.getElementById('vocal-filler-bar').style.width = (vocal.fillerWordScore || 0) + '%';
    document.getElementById('vocal-filler-count').textContent = `${vocal.fillerWordCount ?? 0} detected`;
    document.getElementById('vocal-clarity-val').textContent = vocal.clarityScore ?? '—';
    document.getElementById('vocal-clarity-bar').style.width = (vocal.clarityScore || 0) + '%';
    document.getElementById('vocal-summary-text').textContent = vocal.summary || `Based on ${vocal.answersAnalyzed} spoken answer(s) in this session.`;
  } else {
    document.getElementById('vocal-card').style.display = 'none';
  }

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
    if (e.evalFailed) return `<div class="eval-item"><div class="eval-q">Q${i+1}. ${e.question}</div><span class="eval-badge" style="background:rgba(217,122,104,.14);color:#d97a68">AI evaluation failed</span></div>`;
    return `<div class="eval-item">
      <div class="eval-q">Q${i+1}. ${e.question}</div>
      <span class="eval-badge">Score: ${e.score ?? '--'}/100</span>
      ${e.vocalDelivery ? `<span class="eval-badge" style="background:rgba(217,122,104,.14);color:#d97a68;margin-left:6px">🎙️ Voice analyzed</span>` : ''}
      ${e.star ? `<div style="font-size:11.5px;color:var(--muted);margin-top:6px">STAR — Situation ${e.star.situation} · Task ${e.star.task} · Action ${e.star.action} · Result ${e.star.result}</div>` : ''}
      ${e.vocalDelivery ? `<div style="font-size:11.5px;color:var(--muted);margin-top:4px">Vocal — Pace ${e.vocalDelivery.paceScore} (${e.vocalDelivery.paceLabel}) · Confidence ${e.vocalDelivery.confidenceScore} · Clarity ${e.vocalDelivery.clarityScore} · ${e.vocalDelivery.fillerWordCount} filler word(s)</div>` : ''}
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
