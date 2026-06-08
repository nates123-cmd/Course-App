// Thin PostgREST client for Course. Matches the pattern the previous Course
// build used — no supabase-js CDN; just bare fetch with apikey + JWT.
//
// Why PostgREST direct: this app is single-user with anon-all RLS, so we don't
// need auth/realtime/storage. Keeping it dependency-free preserves the suite's
// no-build PWA pattern.
//
// Shared suite project: xsmnfcmtbpeaccnyinkr (dashboard name "5 min flashcards"
// is misleading — see suite memory `suite-supabase`).

(function () {
  const SB_URL = 'https://xsmnfcmtbpeaccnyinkr.supabase.co';
  // Public anon key, JWT-style. Safe to ship — RLS is permissive by design.
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbW5mY210YnBlYWNjbnlpbmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzODQ3MjksImV4cCI6MjA5Mzk2MDcyOX0.flUt1SAkkt1ppcKCR2XnPKbAaS4PjCLMzi3Gu08jVWo';

  // ── Suite auth (Supabase email OTP, 8-digit). Shared session under the
  // supabase-js key → one sign-in across the same-origin suite. ──
  const SB_AUTH_KEY = 'sb-xsmnfcmtbpeaccnyinkr-auth-token';
  function _authSession() { try { return JSON.parse(localStorage.getItem(SB_AUTH_KEY) || 'null'); } catch (e) { return null; } }
  function _setAuthSession(x) { if (x && x.access_token) localStorage.setItem(SB_AUTH_KEY, JSON.stringify(x)); else localStorage.removeItem(SB_AUTH_KEY); }
  function hasSession() { const x = _authSession(); return !!(x && x.access_token); }
  function authedEmail() { const x = _authSession(); return (x && x.user && x.user.email) || ''; }
  function _sessionExpired(x) { const exp = x && x.expires_at ? x.expires_at * 1000 : 0; return Date.now() > exp - 60000; }
  // Single-flight refresh. Supabase rotates the refresh token on every use, so
  // concurrent callers (parallel boot reads, sibling suite tabs sharing this
  // session key) must share ONE round-trip — otherwise the losers present a
  // rotated token, get "Refresh Token Not Found", and wipe the session → writes
  // fall back to the anon key and die on RLS. Re-read storage first (a sibling
  // may already have a fresh token) and only clear if the dead token is still ours.
  let _refreshInFlight = null;
  function _refreshSession() {
    if (_refreshInFlight) return _refreshInFlight;
    _refreshInFlight = (async () => {
      let x = _authSession();
      if (x && x.access_token && !_sessionExpired(x)) return x;
      if (!x || !x.refresh_token) return null;
      try {
        const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: x.refresh_token }) });
        if (!r.ok) {
          const cur = _authSession();
          if (cur && cur.access_token && !_sessionExpired(cur)) return cur;
          if (cur && cur.refresh_token === x.refresh_token) _setAuthSession(null);
          return null;
        }
        const ns = await r.json(); _setAuthSession(ns); return ns;
      } catch (e) { return null; }
    })();
    _refreshInFlight.finally(() => { _refreshInFlight = null; });
    return _refreshInFlight;
  }
  async function authToken() { let x = _authSession(); if (!x || !x.access_token) return null; if (_sessionExpired(x)) x = await _refreshSession(); return (x && x.access_token) || null; }
  async function sbBearer() { return (await authToken()) || SB_KEY; }
  async function authHeaders(extra) { return { apikey: SB_KEY, Authorization: `Bearer ${await sbBearer()}`, 'Content-Type': 'application/json', ...(extra || {}) }; }
  async function otpSend(email) {
    const r = await fetch(`${SB_URL}/auth/v1/otp`, { method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, create_user: true }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.msg || e.error_description || e.error || 'Could not send code'); }
  }
  async function otpVerify(email, token) {
    const r = await fetch(`${SB_URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, token, type: 'email' }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.msg || e.error_description || e.error || 'Invalid or expired code'); }
    const x = await r.json(); _setAuthSession(x); return x;
  }
  function signOut() { _setAuthSession(null); location.reload(); }
  function showOtpGate() {
    const gate = document.getElementById('otp-gate');
    const emailEl = document.getElementById('otp-email'), codeEl = document.getElementById('otp-code');
    const sendBtn = document.getElementById('otp-send'), verBtn = document.getElementById('otp-verify');
    const backBtn = document.getElementById('otp-back'), errEl = document.getElementById('otp-err'), msgEl = document.getElementById('otp-msg');
    const showErr = (m) => { errEl.textContent = m || ''; errEl.style.display = m ? 'block' : 'none'; };
    const toEmail = () => { codeEl.style.display = 'none'; verBtn.style.display = 'none'; backBtn.style.display = 'none'; emailEl.style.display = ''; sendBtn.style.display = ''; msgEl.textContent = "Sign in with your email. We'll send you an 8-digit code."; showErr(''); };
    toEmail(); gate.style.display = 'flex';
    sendBtn.onclick = async () => {
      const email = emailEl.value.trim(); if (!email) { showErr('Enter your email.'); return; }
      sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; showErr('');
      try { await otpSend(email); emailEl.style.display = 'none'; sendBtn.style.display = 'none'; codeEl.style.display = ''; verBtn.style.display = ''; backBtn.style.display = ''; msgEl.textContent = 'Enter the 8-digit code sent to ' + email + '.'; codeEl.value = ''; codeEl.focus(); }
      catch (e) { showErr(e.message); }
      sendBtn.disabled = false; sendBtn.textContent = 'Email me a code';
    };
    verBtn.onclick = async () => {
      const email = emailEl.value.trim(), code = codeEl.value.trim();
      if (code.length !== 8) { showErr('The code is 8 digits.'); return; }
      verBtn.disabled = true; verBtn.textContent = 'Verifying…'; showErr('');
      try { await otpVerify(email, code); location.reload(); }
      catch (e) { showErr(e.message); verBtn.disabled = false; verBtn.textContent = 'Sign in'; }
    };
    backBtn.onclick = toEmail;
    codeEl.oninput = () => { codeEl.value = codeEl.value.replace(/\D/g, '').slice(0, 8); };
  }

  async function rest(path, init = {}) {
    const url = `${SB_URL}/rest/v1${path}`;
    const res = await fetch(url, {
      ...init,
      headers: { ...(await authHeaders()), ...(init.headers || {}) },
    });
    if (!res.ok) {
      // 401 = bearer rejected (expired/revoked user token, or anon-key fallback
      // hitting RLS). Session is dead; clear it and reopen the OTP gate so writes
      // don't silently fail forever instead of routing back to login.
      if (res.status === 401) { _setAuthSession(null); showOtpGate(); throw new Error('Session expired — sign in again'); }
      const body = await res.text().catch(() => '');
      throw new Error(`Supabase ${res.status} ${path}: ${body.slice(0, 200)}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function edge(fnName, body) {
    const res = await fetch(`${SB_URL}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
      if (res.status === 401) { _setAuthSession(null); showOtpGate(); throw new Error('Session expired — sign in again'); }
      const txt = await res.text().catch(() => '');
      throw new Error(`Edge ${fnName} ${res.status}: ${txt.slice(0, 200)}`);
    }
    return res.json();
  }

  // Convenience verbs — keep the per-table call sites short.
  const db = {
    select: (table, query = '') => rest(`/${table}?${query}`),
    insert: (table, row) => rest(`/${table}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(Array.isArray(row) ? row : [row]),
    }),
    update: (table, id, patch) => rest(`/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    }),
    delete: (table, id) => rest(`/${table}?id=eq.${id}`, { method: 'DELETE' }),
    rest, edge,
  };

  // Shape a single course_tasks row into the task shape the components read.
  function shapeTask(t) {
    return {
      id: t.id, label: t.title,
      sortOrder: t.sort_order == null ? null : Number(t.sort_order),
      done: t.status === 'done',
      next: t.status === 'next',
      waiting: t.status === 'waiting' ? (t.person_dependency || true) : undefined,
      due: t.do_date || undefined,
      effort: t.effort,
      workType: t.work_type,
      notes: t.notes,
      rawStatus: t.status,
      notionUrl: t.notion_url || null,
      pillar: (t.pillar || '').toLowerCase() || null,
    };
  }

  // Shape a Supabase course_projects row + its related rows into the
  // registry shape the prototype's Triage/Project components expect.
  // Fields without a Supabase equivalent yet (latest synthesis, stamp,
  // notion page count) come back undefined — consumers must handle that.
  function shapeProject(p, tasksById, notesById, milestonesById) {
    const pillarLabelMap = {
      arrow: 'Arrow', sunny: 'Sunny', life: 'Life',
      side: 'Side Projects', // legacy seed key, harmless if unused
    };
    const dueDate = p.due_date ? new Date(p.due_date + 'T00:00:00') : null;
    return {
      id: p.id,
      name: p.name,
      pillar: (p.pillar || '').toLowerCase() || null,
      pillarLabel: [pillarLabelMap[p.pillar] || p.pillar, p.work_area].filter(Boolean).join(' · '),
      tag: p.work_area || null,
      status: p.status,
      sortOrder: p.sort_order == null ? null : Number(p.sort_order),
      lastActivityAt: p.last_activity_at,
      due: dueDate ? { m: dueDate.getMonth(), d: dueDate.getDate(), y: dueDate.getFullYear() } : null,
      dod: p.outcome || '',
      notes: p.notes || '',
      latest: null,
      stamp: null,
      notion: p.notion_url ? { url: p.notion_url } : null,
      statusSeed: (notesById[p.id] || []).map((n) => ({
        id: n.id, body: n.body, summary: n.summary || null,
        createdAt: n.created_at, source: n.source,
      })),
      milestones: (milestonesById[p.id] || []).map((m) => ({
        id: m.id, label: m.label, state: m.marker_state,
        sub: m.target_date || undefined,
      })),
      notionUrl: p.notion_url || null,
      initialTasks: (tasksById[p.id] || []).map(shapeTask),
    };
  }

  async function loadCourseData() {
    const [projects, tasks, notes, milestones, pendingCaptures] = await Promise.all([
      db.select('course_projects', 'select=*&order=last_activity_at.desc'),
      db.select('course_tasks', 'select=*&order=sort_order.asc.nullslast,created_at.asc'),
      db.select('course_status_notes', 'select=*&order=created_at.desc').catch(() => []),
      db.select('course_milestones', 'select=*&order=sort_order.asc').catch(() => []),
      db.select('course_captures', 'select=id&status=eq.pending').catch(() => []),
    ]);

    const tasksById = {}, notesById = {}, milestonesById = {};
    // Project-less tasks that carry a pillar are "pillar tasks" — loose work
    // filed to a life domain but not a project. Grouped by lowercase pillar id
    // so they line up with the project grouping in Triage.
    const pillarTasks = {};
    for (const t of tasks) {
      if (t.project_id) {
        (tasksById[t.project_id] ||= []).push(t);
      } else if ((t.pillar || '').trim()) {
        (pillarTasks[t.pillar.toLowerCase()] ||= []).push(shapeTask(t));
      }
    }
    for (const n of notes)      (notesById[n.project_id]      ||= []).push(n);
    for (const m of milestones) (milestonesById[m.project_id] ||= []).push(m);

    const registry = {};
    for (const p of projects) {
      registry[p.id] = shapeProject(p, tasksById, notesById, milestonesById);
    }
    return {
      registry,
      pillarTasks,
      projectIds: projects.map((p) => p.id),
      pendingInboxCount: pendingCaptures.length,
    };
  }

  window.SB_URL = SB_URL;
  window.SB_KEY = SB_KEY;
  window.hasSession = hasSession;
  window.authedEmail = authedEmail;
  window.showOtpGate = showOtpGate;
  window.signOut = signOut;
  window.sbBearer = sbBearer;
  window.db = db;
  window.loadCourseData = loadCourseData;
})();
