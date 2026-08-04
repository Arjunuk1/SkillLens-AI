/* ═══════════════════════════════════════════════════
   SkillLens AI — shared auth guard + API config
   Loaded before every protected page's own script.
   Declares API, token, and user as true globals (classic
   script, top-level `var`), exactly like every page used
   to declare them locally — so each page's own .js file
   can keep referencing API / token / user unqualified
   with zero changes to its logic.
═══════════════════════════════════════════════════ */
var API   = window.location.protocol === 'file:' ? 'http://localhost:5173/api' : `${window.location.origin}/api`;
var token = localStorage.getItem('sl_token');
var user  = JSON.parse(localStorage.getItem('sl_user') || '{}');
if (!token) { location.href = '/pages/landing/landing.html'; }
