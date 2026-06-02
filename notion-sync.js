// Course — Notion → Supabase project sync.
//
// The app renders from the `course_projects` Supabase table; it does NOT read
// Notion live. This module pulls the Notion Projects DB and upserts it into
// `course_projects` so new/edited Notion rows surface. Manual, on-demand
// (triggered from Settings) — keeps the fast Supabase read.
//
// Scope: all NON-archived projects (Active / Idea / Paused / Routine /
// Under Review / empty-status). Done + Archived are intentionally not pulled.

(function () {
  // The verified Projects database_id (dashless). Used as a fallback + to
  // self-heal a missing/stale `notion_projects_db_id` in localStorage.
  const DEFAULT_PROJECTS_DB_ID = '2d5706a32fa5809b8cfae74cf4d97156';

  // Notion Status (select) → course_projects.status enum. Empty/unknown → active.
  const STATUS_MAP = {
    'Active': 'active', 'Idea': 'idea', 'Paused': 'paused', 'Routine': 'routine',
    'Under Review': 'under_review', 'Done': 'done', 'Archived': 'archived',
  };
  // Pillar page title (lowercased) → app pillar slug.
  const PILLAR_SLUG = {
    'arrow': 'arrow',
    'sunny': 'sunny', 'slow down sunny': 'sunny',
    'life': 'life',
    'side projects': 'side', 'side gigs': 'side',
  };
  const PRIORITY_MAP = { 'Low': 'low', 'Medium': 'medium', 'High': 'high' };

  // Notion query filter: everything except Done + Archived.
  const NON_ARCHIVED_FILTER = {
    or: [
      { property: 'Status', select: { equals: 'Active' } },
      { property: 'Status', select: { equals: 'Idea' } },
      { property: 'Status', select: { equals: 'Paused' } },
      { property: 'Status', select: { equals: 'Routine' } },
      { property: 'Status', select: { equals: 'Under Review' } },
      { property: 'Status', select: { is_empty: true } },
    ],
  };

  const dashless = (s) => String(s || '').replace(/-/g, '');
  const idFromUrl = (url) => {
    const m = dashless(url).match(/([0-9a-f]{32})/i);
    return m ? m[1] : null;
  };
  const richText = (prop) =>
    (prop && prop.type === 'rich_text' ? (prop.rich_text || []) : [])
      .map((t) => t.plain_text).join('') || null;
  const title = (page) =>
    ((page.properties && page.properties.Name && page.properties.Name.title) || [])
      .map((t) => t.plain_text).join('') || '(untitled)';
  const dateStart = (prop) => (prop && prop.date && prop.date.start) || null;
  const selectName = (prop) => (prop && prop.select && prop.select.name) || null;

  // Pillar is a rollup whose array holds a relation to a pillar page.
  function pillarPageId(page) {
    const arr = ((((page.properties || {}).Pillar || {}).rollup || {}).array) || [];
    for (const item of arr) {
      if (item.relation && item.relation[0]) return item.relation[0].id;
    }
    return null;
  }

  async function edge(body) {
    return window.db.edge('course-notion-fetch', body);
  }

  // Resolve the Projects DB id: prefer the user's stored id, fall back to the
  // known-good default. Whichever responds wins, and is written back so Notion
  // writeback (createProjectPage/Task) targets the same DB.
  async function resolveProjectsDbId(report) {
    const stored = dashless(localStorage.getItem('notion_projects_db_id'));
    const candidates = [];
    if (stored) candidates.push(stored);
    if (!candidates.includes(DEFAULT_PROJECTS_DB_ID)) candidates.push(DEFAULT_PROJECTS_DB_ID);
    for (const id of candidates) {
      try {
        await edge({ action: 'query_db', database_id: id, page_size: 1 });
        if (dashless(localStorage.getItem('notion_projects_db_id')) !== id) {
          if (window.suiteSettings) window.suiteSettings.set('notion_projects_db_id', id);
          else localStorage.setItem('notion_projects_db_id', id);
          report && report(`Using Projects DB ${id.slice(0, 8)}…`);
        }
        return id;
      } catch (e) {
        report && report(`DB ${id.slice(0, 8)}… not reachable, trying next…`);
      }
    }
    throw new Error('No reachable Projects database. Check the Notion integration share + the DB id in Settings.');
  }

  async function fetchAllPages(dbId, report) {
    const pages = [];
    let cursor = null;
    do {
      const body = { action: 'query_db', database_id: dbId, filter: NON_ARCHIVED_FILTER, page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const res = await edge(body);
      pages.push(...(res.results || []));
      cursor = res.has_more ? res.next_cursor : null;
      report && report(`Fetched ${pages.length} projects from Notion…`);
    } while (cursor);
    return pages;
  }

  // Build pillarPageId → slug by fetching each distinct pillar page's title.
  async function resolvePillarSlugs(pages, report) {
    const ids = [...new Set(pages.map(pillarPageId).filter(Boolean))];
    const map = {};
    report && report(`Resolving ${ids.length} pillars…`);
    await Promise.all(ids.map(async (id) => {
      try {
        const pg = await edge({ action: 'fetch_page', page_id: id });
        const name = ((pg.properties && pg.properties.Name && pg.properties.Name.title) || [])
          .map((t) => t.plain_text).join('').trim().toLowerCase();
        map[id] = PILLAR_SLUG[name] || null;
      } catch (e) { map[id] = null; }
    }));
    return map;
  }

  function notionRowToProject(page, pillarMap) {
    const props = page.properties || {};
    const pid = pillarPageId(page);
    return {
      name: title(page),
      status: STATUS_MAP[selectName(props.Status)] || 'active',
      outcome: richText(props.Outcome),
      pillar: pid ? (pillarMap[pid] || null) : null,
      priority: PRIORITY_MAP[selectName(props['Priority Level'])] || null,
      due_date: dateStart(props.Due),
      start_date: dateStart(props.Start),
      completed_date: dateStart(props.Completed),
      notion_url: page.url || `https://www.notion.so/${dashless(page.id)}`,
    };
  }

  // Pull the Notion Projects DB and upsert into course_projects.
  // Returns { total, inserted, updated, dbId }. Optional onProgress(msg).
  async function syncProjects({ onProgress } = {}) {
    const report = typeof onProgress === 'function' ? onProgress : null;
    if (!window.db || !window.db.edge) throw new Error('Supabase client not ready');

    const dbId = await resolveProjectsDbId(report);
    const pages = await fetchAllPages(dbId, report);
    const pillarMap = await resolvePillarSlugs(pages, report);

    // Map existing rows by Notion page id so we update rather than duplicate.
    const existing = await window.db.select('course_projects', 'select=id,notion_url');
    const byPageId = {};
    for (const r of existing) {
      const pid = idFromUrl(r.notion_url);
      if (pid) byPageId[pid] = r.id;
    }

    const inserts = [];
    const updates = [];
    for (const page of pages) {
      const fields = notionRowToProject(page, pillarMap);
      const rowId = byPageId[dashless(page.id)];
      if (rowId) {
        // Update Notion-owned fields only — leave sort_order + last_activity_at
        // (app-managed ordering / stall tracking) untouched.
        updates.push({ id: rowId, patch: fields });
      } else {
        inserts.push({ ...fields, last_activity_at: page.last_edited_time || new Date().toISOString() });
      }
    }

    report && report(`Writing ${inserts.length} new, ${updates.length} updated…`);
    if (inserts.length) await window.db.insert('course_projects', inserts);
    await Promise.all(updates.map((u) => window.db.update('course_projects', u.id, u.patch)));

    return { total: pages.length, inserted: inserts.length, updated: updates.length, dbId };
  }

  window.notionSync = { syncProjects, DEFAULT_PROJECTS_DB_ID };
})();
