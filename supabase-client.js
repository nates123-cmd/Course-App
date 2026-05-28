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

  const baseHeaders = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };

  async function rest(path, init = {}) {
    const url = `${SB_URL}/rest/v1${path}`;
    const res = await fetch(url, {
      ...init,
      headers: { ...baseHeaders, ...(init.headers || {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Supabase ${res.status} ${path}: ${body.slice(0, 200)}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function edge(fnName, body) {
    const res = await fetch(`${SB_URL}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
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
  window.db = db;
  window.loadCourseData = loadCourseData;
})();
