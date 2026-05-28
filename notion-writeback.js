// Course → Notion writeback. One-way, best-effort.
// Each Supabase write of an editable field also fires a matching Notion page
// update via the course-notion-fetch Edge Function (the same one we use for
// imports — it handles both read and update actions).
//
// Records that originated outside Notion (Course-native creations) have no
// notion_url, so the writeback is a no-op. That's by design — Notion creation
// from Course is a separate flow not yet implemented.

(function () {
  if (!window.SB_URL || !window.SB_KEY) {
    console.error('notion-writeback: SB_URL/SB_KEY missing (load supabase-client.js first)');
    return;
  }
  const EF_URL = `${window.SB_URL}/functions/v1/course-notion-fetch`;

  async function efFetch(action, params = {}) {
    const res = await fetch(EF_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${window.SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...params }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Edge function ${res.status}`);
    return data;
  }

  // Broadcast writeback outcomes so an indicator can surface sync state.
  function emit(field, ok, err) {
    try {
      window.dispatchEvent(new CustomEvent('notion-writeback', {
        detail: { field, ok, error: err ? (err.message || String(err)) : null, at: Date.now() },
      }));
    } catch (_) {}
  }

  function pageIdFrom(notionUrl) {
    if (!notionUrl) return null;
    const m = String(notionUrl).match(/([0-9a-f]{32})/i);
    return m ? m[1] : null;
  }

  const PROJECT_STATUS_TO_NOTION = {
    active: 'Active', idea: 'Idea', paused: 'Paused', done: 'Done',
    archived: 'Archived', routine: 'Routine', under_review: 'Under Review',
  };
  const TASK_STATUS_TO_NOTION = {
    triage: 'Triage', next: 'Next', in_progress: 'In Progress',
    waiting: 'Waiting', done: 'Done', dropped: 'Dropped', pushed: 'Pushed',
  };

  async function projectStatus(notionUrl, status) {
    const pageId = pageIdFrom(notionUrl);
    const notionStatus = PROJECT_STATUS_TO_NOTION[status];
    if (!pageId || !notionStatus) return;
    try {
      await efFetch('update_page', {
        page_id: pageId,
        body: { properties: { Status: { select: { name: notionStatus } } } },
      });
      emit('project-status', true);
    } catch (err) { console.warn('Notion project status writeback failed:', err); emit('project-status', false, err); }
  }

  async function taskStatus(notionUrl, status) {
    const pageId = pageIdFrom(notionUrl);
    if (!pageId) return;
    // A blank/null status clears Notion's Task Status select. Keep the Complete
    // checkbox in sync — the user tracks open-ness via Complete (not Task
    // Status) in most of their workflow.
    const notionStatus = TASK_STATUS_TO_NOTION[status];
    const properties = {
      'Task Status': notionStatus ? { select: { name: notionStatus } } : { select: null },
      Complete: { checkbox: status === 'done' },
    };
    try {
      await efFetch('update_page', { page_id: pageId, body: { properties } });
      emit('task-status', true);
    } catch (err) { console.warn('Notion task status writeback failed:', err); emit('task-status', false, err); }
  }

  async function projectOutcome(notionUrl, outcome) {
    const pageId = pageIdFrom(notionUrl);
    if (!pageId) return;
    try {
      await efFetch('update_page', {
        page_id: pageId,
        body: { properties: { Outcome: {
          rich_text: outcome ? [{ type: 'text', text: { content: outcome } }] : [],
        } } },
      });
      emit('project-outcome', true);
    } catch (err) { console.warn('Notion outcome writeback failed:', err); emit('project-outcome', false, err); }
  }

  async function projectName(notionUrl, name) {
    const pageId = pageIdFrom(notionUrl);
    if (!pageId || !name) return;
    try {
      await efFetch('update_page', {
        page_id: pageId,
        body: { properties: { Name: { title: [{ type: 'text', text: { content: name } }] } } },
      });
      emit('project-name', true);
    } catch (err) { console.warn('Notion project name writeback failed:', err); emit('project-name', false, err); }
  }

  async function projectDue(notionUrl, isoDate) {
    const pageId = pageIdFrom(notionUrl);
    if (!pageId) return;
    try {
      await efFetch('update_page', {
        page_id: pageId,
        body: { properties: { Due: isoDate ? { date: { start: isoDate } } : { date: null } } },
      });
      emit('project-due', true);
    } catch (err) { console.warn('Notion due writeback failed:', err); emit('project-due', false, err); }
  }

  async function taskDoDate(notionUrl, isoDate) {
    const pageId = pageIdFrom(notionUrl);
    if (!pageId) return;
    try {
      await efFetch('update_page', {
        page_id: pageId,
        body: { properties: { 'Do date': isoDate ? { date: { start: isoDate } } : { date: null } } },
      });
      emit('task-do-date', true);
    } catch (err) { console.warn('Notion task do_date writeback failed:', err); emit('task-do-date', false, err); }
  }

  // Create a fresh Notion page in the Projects DB. Returns { id, url } from
  // Notion. The Projects DB id comes from localStorage('notion_projects_db_id') —
  // set it once by pasting the 32-char id from your Notion DB URL.
  // Update a task page's Project relation. projectNotionUrl is the target
  // project's Notion URL; null clears the relation.
  async function taskProject(notionUrl, projectNotionUrl) {
    const pageId = pageIdFrom(notionUrl);
    if (!pageId) return;
    const projectPageId = projectNotionUrl
      ? (String(projectNotionUrl).match(/([0-9a-f]{32})/i) || [])[1]
      : null;
    try {
      await efFetch('update_page', {
        page_id: pageId,
        body: {
          properties: {
            Project: { relation: projectPageId ? [{ id: projectPageId }] : [] },
          },
        },
      });
      emit('task-project', true);
    } catch (err) { console.warn('Notion task project writeback failed:', err); emit('task-project', false, err); }
  }

  async function createProjectPage({ name, pillar, outcome, due_date, status }) {
    let dbId = (typeof localStorage !== 'undefined')
      ? localStorage.getItem('notion_projects_db_id')
      : null;
    // Fall back to the verified default so project creation/push works even
    // before a sync has seeded the localStorage id.
    if (!dbId && typeof window !== 'undefined' && window.notionSync) {
      dbId = window.notionSync.DEFAULT_PROJECTS_DB_ID;
    }
    if (!dbId) {
      console.info('notion-writeback: skipping createProjectPage (set localStorage.notion_projects_db_id)');
      emit('project-create', true);
      return null;
    }
    const STATUS_MAP = {
      active: 'Active', idea: 'Idea', paused: 'Paused', done: 'Done',
      archived: 'Archived', routine: 'Routine', under_review: 'Under Review',
    };
    const properties = {
      Name: { title: [{ type: 'text', text: { content: name } }] },
    };
    if (status && STATUS_MAP[status]) {
      properties.Status = { select: { name: STATUS_MAP[status] } };
    }
    if (outcome) {
      properties.Outcome = { rich_text: [{ type: 'text', text: { content: outcome } }] };
    }
    if (due_date) {
      properties.Due = { date: { start: due_date } };
    }
    try {
      const page = await efFetch('create_page', { database_id: dbId, properties });
      emit('project-create', true);
      return page;
    } catch (err) {
      console.warn('Notion project create failed:', err);
      emit('project-create', false, err);
      return null;
    }
  }

  // Create a fresh Notion page in the Tasks DB. The Tasks DB id comes from
  // localStorage('notion_tasks_db_id'). projectNotionUrl is optional — when
  // present, links the task page to the project page via the "Project" relation.
  async function createTaskPage({ title, status, do_date, projectNotionUrl }) {
    const dbId = (typeof localStorage !== 'undefined')
      ? localStorage.getItem('notion_tasks_db_id')
      : null;
    if (!dbId) {
      console.info('notion-writeback: skipping createTaskPage (set localStorage.notion_tasks_db_id)');
      emit('task-create', true);
      return null;
    }
    const STATUS_MAP = {
      triage: 'Triage', next: 'Next', in_progress: 'In Progress',
      waiting: 'Waiting', done: 'Done', dropped: 'Dropped', pushed: 'Pushed',
    };
    // Notion Tasks DB uses "Task" as the title property (not "Name").
    const properties = {
      Task: { title: [{ type: 'text', text: { content: title } }] },
    };
    if (status && STATUS_MAP[status]) {
      properties['Task Status'] = { select: { name: STATUS_MAP[status] } };
    }
    if (do_date) {
      properties['Do date'] = { date: { start: do_date } };
    }
    const projectPageId = projectNotionUrl
      ? (String(projectNotionUrl).match(/([0-9a-f]{32})/i) || [])[1]
      : null;
    if (projectPageId) {
      properties.Project = { relation: [{ id: projectPageId }] };
    }
    try {
      const page = await efFetch('create_page', { database_id: dbId, properties });
      emit('task-create', true);
      return page;
    } catch (err) {
      console.warn('Notion task create failed:', err);
      emit('task-create', false, err);
      return null;
    }
  }

  async function taskTitle(notionUrl, title) {
    const pageId = pageIdFrom(notionUrl);
    if (!pageId || !title) return;
    try {
      await efFetch('update_page', {
        page_id: pageId,
        body: { properties: { Task: { title: [{ type: 'text', text: { content: title } }] } } },
      });
      emit('task-title', true);
    } catch (err) { console.warn('Notion task title writeback failed:', err); emit('task-title', false, err); }
  }

  window.notionWriteback = {
    projectStatus, taskStatus, projectOutcome, projectName, projectDue, taskDoDate, taskTitle,
    taskProject,
    createProjectPage, createTaskPage,
  };
})();
