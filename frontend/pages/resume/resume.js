

function drag(e){ e.preventDefault(); document.getElementById('upload-zone').classList.add('dragover'); }
function dragEnd(){ document.getElementById('upload-zone').classList.remove('dragover'); }
function drop(e){ e.preventDefault(); dragEnd(); const f=e.dataTransfer.files[0]; if(f) uploadFile(f); }
function fileSelected(e){ const f=e.target.files[0]; if(f) uploadFile(f); }

function setStep(n) {
  for(let i=1;i<=4;i++) {
    const el=document.getElementById('step'+i);
    el.className='up-step'+(i<n?' done':i===n?' active':'');
  }
}

async function uploadFile(file) {
  if (file.type !== 'application/pdf') { alert('Please upload a PDF file only.'); return; }
  if (file.size > 5*1024*1024)         { alert('File size must be under 5MB.'); return; }

  document.getElementById('upload-zone').style.display = 'none';
  document.getElementById('uploading').style.display   = 'block';

  setStep(1); await delay(600);
  setStep(2); await delay(800);
  setStep(3);

  const form = new FormData();
  form.append('resume', file);

  try {
    setStep(3); await delay(400);
    const r = await fetch(`${API}/resume/upload`, {
      method:'POST', headers:{ Authorization:'Bearer '+token }, body: form
    });
    setStep(4); await delay(500);
    const d = await r.json();
    document.getElementById('uploading').style.display = 'none';
    if (r.ok && d.success) showResult(d.data);
    else { alert(d.message || 'Analysis failed.'); resetUpload(); }
  } catch(e) {
    document.getElementById('uploading').style.display = 'none';
    alert('Could not reach the server to analyze your resume. Please check that the backend is running and try again.');
    resetUpload();
  }
}

function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }

function showResult(data) {
  document.getElementById('result-section').style.display = 'block';
  const score = data.atsScore || 0;
  // Animate counter
  let n=0; const iv=setInterval(()=>{ n=Math.min(n+2,score); document.getElementById('ats-num').textContent=n; if(n>=score)clearInterval(iv); },20);
  // Ring animation
  const circ=364.4, offset=circ-(circ*score/100);
  const ring=document.getElementById('ring-fill');
  ring.style.stroke = score>=75?'#45b892':score>=55?'#e3a344':'#d97a68';
  setTimeout(()=>ring.style.strokeDashoffset=offset, 100);
  // Grade
  const gradeEl=document.getElementById('ats-grade');
  if(score>=80){gradeEl.textContent='Excellent';gradeEl.className='ats-grade grade-ex';}
  else if(score>=65){gradeEl.textContent='Good';gradeEl.className='ats-grade grade-gd';}
  else if(score>=50){gradeEl.textContent='Average';gradeEl.className='ats-grade grade-av';}
  else{gradeEl.textContent='Needs Work';gradeEl.className='ats-grade grade-po';}
  // Recruiter impression
  const riEl = document.getElementById('ri-val');
  if (data.recruiterImpression != null) {
    riEl.textContent = data.recruiterImpression + ' / 10';
    riEl.style.color = data.recruiterImpression>=7.5?'#45b892':data.recruiterImpression>=5?'#e3a344':'#d97a68';
  } else { riEl.textContent = 'N/A'; riEl.style.color = 'var(--muted)'; }
  // Projects analysis
  document.getElementById('projects-analysis-text').textContent = data.projectsAnalysis || 'No project analysis available.';
  // Lists
  const rl=(id,arr)=>{ document.getElementById(id).innerHTML=(arr||[]).map(i=>`<li>${i}</li>`).join('') || '<li style="list-style:none;padding-left:0;color:var(--muted)">None found</li>'; };
  rl('fb-found',      data.skillsFound);
  rl('fb-strengths', data.strengths);
  rl('fb-weak',      data.weakAreas);
  rl('fb-skills',    data.missingSkills);
  rl('fb-sug',       data.suggestions);
}

function resetUpload() {
  document.getElementById('upload-zone').style.display    = 'block';
  document.getElementById('result-section').style.display = 'none';
  document.getElementById('file-input').value = '';
}

async function loadHistory() {
  try {
    const r  = await fetch(`${API}/resume/history`, { headers:{ Authorization:'Bearer '+token }});
    const d  = await r.json();
    if (!r.ok || !d.data.length) return;
    document.getElementById('history-list').innerHTML = d.data.map(rv => `
      <div class="history-item" onclick="showResumeById('${rv._id}')">
        <div class="hi-left">
          <div class="hi-icon">📄</div>
          <div>
            <div class="hi-name">${rv.fileName || 'resume.pdf'}</div>
            <div class="hi-date">${new Date(rv.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</div>
          </div>
        </div>
        <span style="padding:4px 14px;border-radius:6px;font-size:13px;font-weight:700;color:${rv.atsScore>=75?'#45b892':rv.atsScore>=55?'#e3a344':'#d97a68'};background:rgba(255,255,255,.06);border:.5px solid var(--border)">ATS: ${rv.atsScore}</span>
      </div>`).join('');
  } catch(e){}
}

async function showResumeById(id) {
  try {
    const r = await fetch(`${API}/resume/${id}`, { headers:{ Authorization:'Bearer '+token }});
    const d = await r.json();
    if (r.ok) { window.scrollTo(0,0); showResult(d.data); }
  } catch(e){}
}

loadHistory();
