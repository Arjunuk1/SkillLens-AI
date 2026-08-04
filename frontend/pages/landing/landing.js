
    /* ═══════════════════════════════════════════════════
       CONFIGURATION
    ═══════════════════════════════════════════════════ */
    const API_BASES = [
      `${window.location.protocol}//${window.location.hostname}:5173/api`,
      `${window.location.protocol}//${window.location.hostname}:5000/api`,
      `${window.location.origin}/api`,
    ];

    async function apiFetch(path, options) {
      let lastError = null;

      for (const base of API_BASES) {
        try {
          const response = await fetch(`${base}${path}`, options);
          return response;
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError || new Error('Unable to reach the SkillLens API');
    }

    /* ═══════════════════════════════════════════════════
       LOADER
    ═══════════════════════════════════════════════════ */
    window.addEventListener('load', () => {
      setTimeout(() => {
        document.getElementById('loader').classList.add('hide');
        initCounters();
      }, 2000);
    });

    /* ═══════════════════════════════════════════════════
       CURSOR GLOW
    ═══════════════════════════════════════════════════ */
    const cursorGlow = document.getElementById('cursor-glow');
    let cursorVisible = false;
    document.addEventListener('mousemove', (e) => {
      cursorGlow.style.left = e.clientX + 'px';
      cursorGlow.style.top = e.clientY + 'px';
      if (!cursorVisible) { cursorGlow.style.opacity = '1'; cursorVisible = true; }
    });
    document.addEventListener('mouseleave', () => { cursorGlow.style.opacity = '0'; cursorVisible = false; });

    /* ═══════════════════════════════════════════════════
       PARTICLE SYSTEM
    ═══════════════════════════════════════════════════ */
    const canvas = document.getElementById('particles');
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = Math.max(document.body.scrollHeight, window.innerHeight);
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const PARTICLE_COUNT = 46;
    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.1,
      vy: (Math.random() - 0.5) * 0.1,
      drift: Math.random() * Math.PI * 2,
      r: Math.random() * 1 + 0.4,
    }));

    function drawParticles() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.drift += 0.003;
        p.vx += Math.cos(p.drift) * 0.001;
        p.vy += Math.sin(p.drift) * 0.001;

        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > 0.18) { p.vx *= 0.18 / speed; p.vy *= 0.18 / speed; }
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(227,163,68,0.32)';
        ctx.fill();
      });
      // no connecting lines — a quiet field of fine dust, not a busy constellation
      requestAnimationFrame(drawParticles);
    }
    drawParticles();
    setTimeout(resizeCanvas, 700);

    /* ═══════════════════════════════════════════════════
       SCROLL REVEAL
    ═══════════════════════════════════════════════════ */
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, { threshold: 0.07 });
    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

    /* ═══════════════════════════════════════════════════
       ANIMATED COUNTERS
    ═══════════════════════════════════════════════════ */
    function initCounters() {
      document.querySelectorAll('.stat-num[data-target]').forEach(el => {
        const target = parseFloat(el.dataset.target);
        const suffix = el.dataset.sfx || '';
        const dur = 1900;
        let startTime = null;
        function step(ts) {
          if (!startTime) startTime = ts;
          const progress = Math.min((ts - startTime) / dur, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const value = Math.floor(eased * target);
          el.textContent = value + suffix;
          if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }

    /* ═══════════════════════════════════════════════════
       TOAST
    ═══════════════════════════════════════════════════ */
    let toastTimer = null;
    function showToast(message, type = 'success') {
      const toast = document.getElementById('toast');
      const icons = { success: '✅', error: '❌', info: 'ℹ️' };
      toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
      toast.className = `show ${type}`;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.className = ''; }, 3800);
    }

    /* ═══════════════════════════════════════════════════
       AUTH UI STATE
    ═══════════════════════════════════════════════════ */
    function getStoredUser() {
      try {
        return JSON.parse(localStorage.getItem('sl_user') || 'null');
      } catch (err) {
        localStorage.removeItem('sl_user');
        return null;
      }
    }

    function syncAuthUI() {
      const token = localStorage.getItem('sl_token');
      const user = getStoredUser();
      const isLoggedIn = Boolean(token && user);
      document.body.classList.toggle('logged-in', isLoggedIn);

      if (!isLoggedIn) return;

      const fullName = user.fullName || 'Student';
      const firstName = fullName.trim().split(/\s+/)[0] || 'Student';
      const initials = fullName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part.charAt(0))
        .join('')
        .toUpperCase() || 'SL';

      document.getElementById('nav-user-name').textContent = firstName;
      document.getElementById('nav-avatar').textContent = initials;
    }

    function goToDashboard() {
      if (typeof activeModal !== 'undefined' && activeModal) {
        closeModal(activeModal);
      }
      window.location.href = '/pages/dashboard/dashboard.html';
    }

    /* ═══════════════════════════════════════════════════
       DASHBOARD PREVIEW — real data for logged-in users,
       clearly-labeled example data for logged-out visitors
    ═══════════════════════════════════════════════════ */
    async function loadDashboardPreview() {
      const token = localStorage.getItem('sl_token');
      const user = getStoredUser();
      const tag = document.getElementById('dp-example-tag');
      if (!token || !user) { if (tag) tag.style.display = ''; return; } // keep example content + tag

      try {
        const r = await apiFetch('/dashboard', { headers: { Authorization: 'Bearer ' + token } });
        const d = await r.json();
        if (!r.ok || !d.success) return; // leave example content as a harmless fallback

        const firstName = (user.fullName || 'there').trim().split(/\s+/)[0];
        const s = d.data;
        document.getElementById('dp-welcome').textContent = `Welcome back, ${firstName} 👋`;
        document.getElementById('dp-tagline').textContent = s.streak > 0
          ? `You're on a ${s.streak}-day streak — keep it going!`
          : `Ready for your next practice session?`;
        document.getElementById('dp-stat-interviews').textContent = s.totalInterviews ?? 0;
        document.getElementById('dp-stat-avg').textContent = (s.avgScore ?? 0) + '%';
        document.getElementById('dp-stat-resume').textContent = s.resumeScore ?? 0;
        document.getElementById('dp-stat-improvement').textContent = (s.improvementRate >= 0 ? '+' : '') + (s.improvementRate ?? 0) + '%';
        if (tag) tag.style.display = 'none'; // this is now real data, not an example
      } catch (e) { /* backend unreachable — leave example content, non-critical */ }
    }

    function handleLogout() {
      localStorage.removeItem('sl_token');
      localStorage.removeItem('sl_user');
      syncAuthUI();
      showToast('Logged out successfully.', 'info');
    }

    /* ═══════════════════════════════════════════════════
       MODAL ENGINE — COMPLETELY REBUILT & FIXED
    ═══════════════════════════════════════════════════ */

    // Track which modal is open
    let activeModal = null;

    function openModal(id) {
      if (localStorage.getItem('sl_token')) {
        return goToDashboard();
      }
      // Close any open modal first
      if (activeModal) closeModal(activeModal, false);
      const overlay = document.getElementById(id);
      if (!overlay) return;
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      activeModal = id;
      // Focus first input
      setTimeout(() => {
        const firstInput = overlay.querySelector('input');
        if (firstInput) firstInput.focus();
      }, 320);
    }

    function closeModal(id, resetScroll = true) {
      const overlay = document.getElementById(id);
      if (!overlay) return;
      overlay.classList.remove('open');
      if (resetScroll) document.body.style.overflow = '';
      if (activeModal === id) activeModal = null;
      clearAllErrors(id);
    }

    function switchModal(fromId, toId) {
      closeModal(fromId, false);
      setTimeout(() => openModal(toId), 240);
    }

    // Close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay.id);
      });
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && activeModal) closeModal(activeModal);
    });

    // Wire navbar buttons
    document.getElementById('btn-open-login').addEventListener('click', () => openModal('modal-login'));
    document.getElementById('btn-open-signup').addEventListener('click', () => openModal('modal-signup'));
    document.getElementById('btn-open-dashboard').addEventListener('click', goToDashboard);
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
    document.getElementById('hero-cta-signup').addEventListener('click', () => {
      if (localStorage.getItem('sl_token')) return goToDashboard();
      openModal('modal-signup');
    });
    document.getElementById('cta-signup-btn').addEventListener('click', () => {
      if (localStorage.getItem('sl_token')) return goToDashboard();
      openModal('modal-signup');
    });
    document.getElementById('cta-login-btn').addEventListener('click', () => {
      if (localStorage.getItem('sl_token')) return goToDashboard();
      openModal('modal-login');
    });

    // Wire close buttons
    document.getElementById('close-login').addEventListener('click', () => closeModal('modal-login'));
    document.getElementById('close-signup').addEventListener('click', () => closeModal('modal-signup'));

    // Wire switch links
    document.getElementById('switch-to-signup').addEventListener('click', () => switchModal('modal-login', 'modal-signup'));
    document.getElementById('switch-to-login').addEventListener('click', () => switchModal('modal-signup', 'modal-login'));

    // Forgot password
    document.getElementById('forgot-link').addEventListener('click', () => {
      showToast('Password reset link coming soon!', 'info');
    });

    /* ═══════════════════════════════════════════════════
       PASSWORD TOGGLE
    ═══════════════════════════════════════════════════ */
    document.querySelectorAll('.pass-eye').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        if (!input) return;
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        btn.textContent = isHidden ? '🙈' : '👁';
      });
    });

    /* ═══════════════════════════════════════════════════
       PASSWORD STRENGTH METER
    ═══════════════════════════════════════════════════ */
    document.getElementById('su-pass').addEventListener('input', function () {
      const val = this.value;
      const bar = document.getElementById('strength-fill');
      const label = document.getElementById('strength-label');
      if (!val) { bar.style.width = '0'; label.textContent = ''; return; }
      let score = 0;
      if (val.length >= 6) score++;
      if (val.length >= 10) score++;
      if (/[A-Z]/.test(val)) score++;
      if (/[0-9]/.test(val)) score++;
      if (/[^A-Za-z0-9]/.test(val)) score++;
      const levels = [
        { w: '0%', bg: '', txt: '' },
        { w: '20%', bg: '#ef4444', txt: 'Very weak' },
        { w: '40%', bg: '#f97316', txt: 'Weak' },
        { w: '65%', bg: '#eab308', txt: 'Fair' },
        { w: '85%', bg: '#22c55e', txt: 'Strong' },
        { w: '100%', bg: '#10b981', txt: 'Very strong' },
      ];
      const lvl = levels[score];
      bar.style.width = lvl.w;
      bar.style.background = lvl.bg;
      label.textContent = lvl.txt;
      label.style.color = lvl.bg || 'var(--muted)';
    });

    /* ═══════════════════════════════════════════════════
       VALIDATION HELPERS
    ═══════════════════════════════════════════════════ */
    function setFieldError(inputId, errorId, show) {
      const input = document.getElementById(inputId);
      const error = document.getElementById(errorId);
      if (input) input.classList.toggle('invalid', show);
      if (error) error.classList.toggle('visible', show);
    }

    // Trigger direct Google OAuth redirect or handle popup message
    function openGooglePopup() {
      window.location.href = '/api/auth/google/start';
    }

    // 1. Listen for cross-window storage updates
    window.addEventListener('storage', (e) => {
      if (e.key === 'sl_token' && e.newValue) {
        if (activeModal) closeModal(activeModal);
        syncAuthUI();
        goToDashboard();
      }
    });

    // 2. Listen for window focus (when returning from popup/redirect)
    window.addEventListener('focus', () => {
      if (localStorage.getItem('sl_token')) {
        if (activeModal) closeModal(activeModal);
        syncAuthUI();
        goToDashboard();
      }
    });

    // 3. Listen for postMessage from popup (server callback)
    window.addEventListener('message', (e) => {
      try {
        let data = e.data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch (err) { }
        }
        if (!data || !data.success || !data.token) return;

        localStorage.setItem('sl_token', data.token);
        localStorage.setItem('sl_user', JSON.stringify(data.user || {}));
        if (activeModal) closeModal(activeModal);
        syncAuthUI();
        showToast('Signed in successfully!', 'success');
        goToDashboard();
      } catch (err) {
        console.error('Error handling OAuth popup message', err);
      }
    }, false);

    function clearAllErrors(modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) return;
      modal.querySelectorAll('input.invalid').forEach(el => el.classList.remove('invalid'));
      modal.querySelectorAll('.field-error.visible').forEach(el => el.classList.remove('visible'));
      const alert = modal.querySelector('.modal-alert');
      if (alert) { alert.className = 'modal-alert'; alert.textContent = ''; }
    }

    function showModalAlert(alertId, message, type) {
      const el = document.getElementById(alertId);
      if (!el) return;
      el.className = `modal-alert show ${type}`;
      el.innerHTML = (type === 'success' ? '✅' : '❌') + ' ' + message;
    }

    function setButtonLoading(btnId, loading) {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.disabled = loading;
      btn.classList.toggle('loading', loading);
    }

    function isValidEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    /* ═══════════════════════════════════════════════════
       LOGIN HANDLER
    ═══════════════════════════════════════════════════ */
    // ── Google Sign-In ──────────────────────────────────────────────────────────
    let GOOGLE_CLIENT_ID = null;

    async function fetchGoogleClientId() {
      try {
        const r = await apiFetch('/config/google-client');
        if (!r.ok) return null;
        const d = await r.json();
        return d.googleClientId || null;
      } catch (e) {
        return null;
      }
    }

    async function initGoogleSignIn(retriesLeft = 20) {
      if (!GOOGLE_CLIENT_ID) {
        GOOGLE_CLIENT_ID = await fetchGoogleClientId();
        if (!GOOGLE_CLIENT_ID) console.warn('Google client ID unavailable from backend');
      }

      if (window.google && window.google.accounts && window.google.accounts.id) {
        if (!GOOGLE_CLIENT_ID) {
          ['google-btn-login', 'google-btn-signup'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<span style="font-size:12px;color:var(--muted)">Google Sign-In unavailable</span>';
          });
          return;
        }

        try {
          console.info('Initializing Google Identity Services with client id:', GOOGLE_CLIENT_ID);
          google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredentialResponse });
          const btnOpts = { theme: 'filled_black', size: 'large', width: 320, shape: 'pill' };
          google.accounts.id.renderButton(document.getElementById('google-btn-login'), { ...btnOpts, text: 'signin_with' });
          google.accounts.id.renderButton(document.getElementById('google-btn-signup'), { ...btnOpts, text: 'signup_with' });

          // If Google GIS hangs, offer a popup fallback after 4 seconds
          const transformWatch = setTimeout(() => {
            console.warn('Google Identity Services appears to be stalled. Offering popup fallback.');
            ['google-btn-login', 'google-btn-signup'].forEach(id => {
              const el = document.getElementById(id);
              if (el && !el.dataset.hasFallback) {
                el.dataset.hasFallback = 'true';
                el.innerHTML = ''; // Clear existing button
                const btn = document.createElement('button');
                btn.textContent = 'Sign in with Google';
                btn.className = 'btn-submit';
                btn.style.width = '320px';
                btn.addEventListener('click', openGooglePopup);
                el.appendChild(btn);
              }
            });
          }, 4000);

          // Clear watch when user interacts (likely means GIS loaded)
          ['google-btn-login', 'google-btn-signup'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', () => clearTimeout(transformWatch), { once: true });
          });
        } catch (err) {
          console.error('Google initialization failed:', err);
          ['google-btn-login', 'google-btn-signup'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<span style="font-size:12px;color:var(--muted)">Google Sign-In initialization error</span>';
          });
        }
      } else if (retriesLeft > 0) {
        setTimeout(() => initGoogleSignIn(retriesLeft - 1), 250);
      } else {
        console.error('Google Identity Services failed to load.');
        ['google-btn-login', 'google-btn-signup'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.innerHTML = '<span style="font-size:12px;color:var(--muted)">Google Sign-In unavailable right now</span>';
        });
      }
    }

    async function handleGoogleCredentialResponse(response) {
      const alertId = activeModal === 'modal-signup' ? 'signup-alert' : 'login-alert';
      try {
        const r = await apiFetch('/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: response.credential }),
        });
        const d = await r.json();
        if (!r.ok || !d.success) {
          showModalAlert(alertId, d.message || 'Google sign-in failed. Please try again.', 'error');
          return;
        }
        localStorage.setItem('sl_token', d.token);
        localStorage.setItem('sl_user', JSON.stringify(d.user));
        if (activeModal) closeModal(activeModal);
        syncAuthUI();
        showToast(`Welcome, ${d.user.fullName}! Redirecting to dashboard...`, 'success');
        goToDashboard();
      } catch (e) {
        showModalAlert(alertId, 'Could not reach the server. Please make sure the backend is running.', 'error');
      }
    }

    initGoogleSignIn();

    // Fallback: open a popup to server-side OAuth start URL and listen for message
    function openGooglePopup() {
      const w = window.open('/api/auth/google/start', 'google_oauth', 'width=600,height=700');
      if (!w) {
        showToast('Unable to open popup. Please allow popups and try again.', 'error');
        return;
      }

      const pollTimer = setInterval(() => {
        if (localStorage.getItem('sl_token')) {
          clearInterval(pollTimer);
          if (w && !w.closed) {
            try { w.close(); } catch (e) { }
          }
          if (activeModal) closeModal(activeModal);
          syncAuthUI();
          goToDashboard();
        } else if (w && w.closed) {
          clearInterval(pollTimer);
        }
      }, 200);
    }

    // Listen for postMessage from popup (server callback)
    window.addEventListener('message', (e) => {
      try {
        let data = e.data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch (err) { }
        }
        if (!data || !data.success || !data.token) return;

        localStorage.setItem('sl_token', data.token);
        localStorage.setItem('sl_user', JSON.stringify(data.user || {}));
        if (activeModal) closeModal(activeModal);
        syncAuthUI();
        showToast('Signed in successfully!', 'success');
        goToDashboard();
      } catch (err) {
        console.error('Error handling OAuth popup message', err);
      }
    }, false);

    async function handleLogin() {
      clearAllErrors('modal-login');

      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-pass').value;
      let valid = true;

      if (!email || !isValidEmail(email)) {
        setFieldError('login-email', 'login-email-err', true);
        valid = false;
      }
      if (!password) {
        setFieldError('login-pass', 'login-pass-err', true);
        valid = false;
      }
      if (!valid) return;

      setButtonLoading('btn-login-submit', true);
      try {
        const response = await apiFetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await response.json();

        if (response.ok && data.success) {
          localStorage.setItem('sl_token', data.token);
          localStorage.setItem('sl_user', JSON.stringify(data.user));
          if (activeModal) closeModal(activeModal);
          syncAuthUI();
          showToast(`Welcome back, ${data.user.fullName}! 👋`, 'success');
          goToDashboard();
        } else {
          showModalAlert('login-alert', data.message || 'Invalid email or password', 'error');
        }
      } catch (err) {
        showModalAlert('login-alert', 'Cannot connect to server. Make sure the backend is running.', 'error');
      } finally {
        setButtonLoading('btn-login-submit', false);
      }
    }

    /* ═══════════════════════════════════════════════════
       SIGNUP HANDLER
    ═══════════════════════════════════════════════════ */
    async function handleSignup() {
      clearAllErrors('modal-signup');

      const fullName = document.getElementById('su-name').value.trim();
      const email = document.getElementById('su-email').value.trim();
      const password = document.getElementById('su-pass').value;
      const college = document.getElementById('su-college').value.trim();
      const branch = document.getElementById('su-branch').value.trim();
      const year = document.getElementById('su-year').value;
      let valid = true;

      if (!fullName || fullName.length < 2) {
        setFieldError('su-name', 'su-name-err', true);
        valid = false;
      }
      if (!email || !isValidEmail(email)) {
        setFieldError('su-email', 'su-email-err', true);
        valid = false;
      }
      if (!password || password.length < 6) {
        setFieldError('su-pass', 'su-pass-err', true);
        valid = false;
      }
      if (!valid) return;

      setButtonLoading('btn-signup-submit', true);
      try {
        const body = { fullName, email, password };
        if (college) body.college = college;
        if (branch) body.branch = branch;
        if (year) body.year = parseInt(year, 10);

        const response = await apiFetch('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json();

        if (response.ok && data.success) {
          localStorage.setItem('sl_token', data.token);
          localStorage.setItem('sl_user', JSON.stringify(data.user));
          if (activeModal) closeModal(activeModal);
          syncAuthUI();
          showToast(`Welcome, ${data.user.fullName}! Your journey starts now 🚀`, 'success');
          goToDashboard();
        } else {
          showModalAlert('signup-alert', data.message || 'Registration failed. Please try again.', 'error');
        }
      } catch (err) {
        showModalAlert('signup-alert', 'Cannot connect to server. Make sure the backend is running on port 5000.', 'error');
      } finally {
        setButtonLoading('btn-signup-submit', false);
      }
    }

    /* ═══════════════════════════════════════════════════
       WIRE FORM SUBMIT BUTTONS & ENTER KEY
    ═══════════════════════════════════════════════════ */
    document.getElementById('btn-login-submit').addEventListener('click', handleLogin);
    document.getElementById('btn-signup-submit').addEventListener('click', handleSignup);

    // Enter key in login fields
    ['login-email', 'login-pass'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') handleLogin();
      });
    });

    // Enter key on last signup field
    document.getElementById('su-pass').addEventListener('keydown', e => {
      if (e.key === 'Enter') handleSignup();
    });

    // Clear error on input
    document.querySelectorAll('.form-field input').forEach(input => {
      input.addEventListener('input', () => {
        input.classList.remove('invalid');
        const errId = input.id + '-err';
        const err = document.getElementById(errId);
        if (err) err.classList.remove('visible');
      });
    });

    syncAuthUI();
    loadDashboardPreview();
  