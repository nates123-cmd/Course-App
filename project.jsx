// Project view — full record, where you work and think
// Data-driven: takes a project id and looks up content from window.PROJECTS.

function Project({ projectId, onBack, reloadData }) {
  const data = (window.PROJECTS && window.PROJECTS[projectId])
    || (window.PROJECTS && Object.values(window.PROJECTS)[0])
    || { name: 'Untitled', pillar: null, pillarLabel: '', status: 'active', initialTasks: [], milestones: [] };

  const [route, setRoute] = useState('auto');
  const [showProposal, setShowProposal] = useState(false);
  const [riffExpanded, setRiffExpanded] = useState(false);
  const [riffText, setRiffText] = usePersistedState(`project.${projectId}.riff`, data.riffSeed || '');
  const [dodText, setDodText] = usePersistedState(`project.${projectId}.dod`, data.dod || '');
  const commitDod = (next) => {
    const v = (next || '').trim();
    if (v === (dodText || '').trim()) return;
    setDodText(v);
    data.dod = v; // optimistic registry mutation
    window.db.update('course_projects', projectId, { outcome: v || null }).catch((err) => {
      console.error('DoD update failed', err);
    });
    if (window.notionWriteback) window.notionWriteback.projectOutcome(data.notionUrl, v);
  };

  // Tasks (persisted per project)
  const [tasks, setTasks] = usePersistedState(`project.${projectId}.tasks`, () =>
    (data.initialTasks || []).map((t, i) => ({ id: t.id || `t${i}`, ...t }))
  );
  // Custom milestones (persisted; appended to data.milestones)
  const [customMilestones, setCustomMilestones] = usePersistedState(`project.${projectId}.milestones`, []);
  // Per-milestone dates (keyed by stable id)
  const [milestoneDates, setMilestoneDates] = usePersistedState(`project.${projectId}.milestoneDates`, {});
  const [msCalFor, setMsCalFor] = useState(null); // milestone id with calendar open
  const [addingMs, setAddingMs] = useState(false);
  const [newMsText, setNewMsText] = useState('');
  const [newMsDate, setNewMsDate] = useState(null);
  const [newMsCalOpen, setNewMsCalOpen] = useState(false);
  const commitNewMilestone = () => {
    const v = newMsText.trim();
    if (v) {
      const id = `ms${Date.now()}`;
      setCustomMilestones(arr => [...arr, { id, label: v, state: 'upcoming' }]);
      if (newMsDate) {
        setMilestoneDates(d => ({ ...d, [id]: newMsDate }));
      }
    }
    setNewMsText('');
    setNewMsDate(null);
    setNewMsCalOpen(false);
    setAddingMs(false);
  };
  const setMsDate = (id, pick) => {
    setMilestoneDates(d => ({ ...d, [id]: pick }));
    setMsCalFor(null);
  };
  const clearMsDate = (id) => {
    setMilestoneDates(d => { const next = { ...d }; delete next[id]; return next; });
  };
  const allMilestones = [
    ...(data.milestones || []).map((m, i) => ({ ...m, id: m.id || `seed-${i}` })),
    ...customMilestones,
  ];
  const MS_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtMsDate = (d) => d ? `${MS_MONTHS[d.m]} ${d.d}${d.y && d.y !== new Date().getFullYear() ? `, ${d.y}` : ''}` : '';
  const [highlightIds, setHighlightIds] = useState([]);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  // Re-seed transient UI when projectId changes; persisted tasks/state stay.
  React.useEffect(() => {
    setShowProposal(false);
    setRiffExpanded(false);
    setHoldPrompt(null);
    setStatusOpen(false);
    setCalOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Riff -> proposal pipeline
  const [processing, setProcessing] = useState(false);
  const [proposalTasks, setProposalTasks] = useState([]);
  const [proposalMilestones, setProposalMilestones] = useState(0);

  const processRiff = async () => {
    const text = (riffText || '').trim();
    if (!text) return;
    setProcessing(true);
    setShowProposal(false);
    try {
      // Two parallel Claude calls: one for task extraction, one for a
      // shorthand summary used as the collapsed view in Where it stands.
      const [raw, summaryRaw] = await Promise.all([
        window.claude.complete({
          messages: [{
            role: 'user',
            content:
              "Extract action items from the following project note. Decompose into tasks (concrete actions) and milestones (phases/states). Return ONLY a JSON object: { tasks: [{label: string, due?: string, next?: boolean}], milestones: [{label: string}] }. Keep at most 4 of each. Each label under 60 chars. If a date is mentioned (like 'June 2nd' or 'tomorrow'), put it in `due` formatted like 'Jun 2'. Mark the most urgent task as `next: true`.\n\nNote:\n" + text
          }]
        }),
        window.claude.complete({
          messages: [{
            role: 'user',
            content:
              "In ONE short fragment (under 9 words, no period, no quotes), summarize this project update as a telegraphic headline. Use imperative or past-tense verb. Example: 'Lease terms sent, awaiting Cedric'. No preamble.\n\nUpdate:\n" + text,
          }],
        }),
      ]);
      let parsed = null;
      try {
        const m = raw.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(m ? m[0] : raw);
      } catch (e) { parsed = null; }
      const summary = (summaryRaw || '').trim().replace(/^["']|["']$/g, '').slice(0, 80) || null;

      const tagged = parsed && Array.isArray(parsed.tasks)
        ? parsed.tasks.slice(0, 5).map((t, i) => ({
            id: `gen-${Date.now()}-${i}`,
            label: String(t.label || '').slice(0, 80),
            due: t.due ? String(t.due).slice(0, 12) : undefined,
            next: !!t.next,
          })).filter((t) => t.label)
        : [];

      // Auto-commit: tasks straight into the project, the riff text into the
      // status log as the latest "where it stands" entry. Persist both to
      // Supabase so they survive reload.
      if (tagged.length > 0) {
        const newIds = tagged.map((t) => t.id);
        setTasks((ts) => [...ts, ...tagged.map((p) => ({ ...p, done: false }))]);
        setHighlightIds(newIds);
        setTimeout(() => setHighlightIds([]), 1400);
        // Push each task to Supabase in parallel; failures log but don't block UI.
        await Promise.all(tagged.map((t) =>
          window.db.insert('course_tasks', {
            project_id: projectId,
            title: t.label,
            // Only the AI-flagged-urgent task gets 'next'; the rest stay blank.
            ...(t.next ? { status: 'next' } : {}),
          }).catch((err) => console.error('Riff task insert failed', err))
        ));
      }

      // Local + Supabase: keep the full body + the AI summary alongside.
      if (window.addStatusNoteForProject) {
        window.addStatusNoteForProject(projectId, text, 'manual', summary);
      }
      try {
        await window.db.insert('course_status_notes', {
          project_id: projectId,
          body: text,
          summary,
          source: 'manual',
        });
      } catch (err) {
        console.error('Riff status note insert failed', err);
      }

      setRiffText('');
      setRiffExpanded(false);
      if (reloadData) reloadData(); // refresh Triage's view of tasks too
    } catch (e) {
      console.error('Riff process failed', e);
    } finally {
      setProcessing(false);
    }
  };

  // Due-date
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const [dueDate, setDueDate] = usePersistedState(`project.${projectId}.due`, data.due || null);
  const [calOpen, setCalOpen] = useState(false);
  const initialCalMonth = dueDate || { m: new Date().getMonth(), y: new Date().getFullYear() };
  const [calMonth, setCalMonth] = useState({ m: initialCalMonth.m, y: initialCalMonth.y });
  const firstDow = new Date(calMonth.y, calMonth.m, 1).getDay();
  const daysInMonth = new Date(calMonth.y, calMonth.m + 1, 0).getDate();
  const stepMonth = (delta) => {
    let m = calMonth.m + delta, y = calMonth.y;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setCalMonth({ m, y });
  };
  const pickDay = (d) => {
    const pick = { m: calMonth.m, d, y: calMonth.y };
    setDueDate(pick);
    setCalOpen(false);
    const iso = `${pick.y}-${String(pick.m + 1).padStart(2, '0')}-${String(pick.d).padStart(2, '0')}`;
    window.db.update('course_projects', projectId, { due_date: iso }).catch((err) => {
      console.error('Due date update failed', err);
    });
    if (window.notionWriteback) window.notionWriteback.projectDue(data.notionUrl, iso);
  };
  const clearDueDate = () => {
    setDueDate(null);
    window.db.update('course_projects', projectId, { due_date: null }).catch((err) => {
      console.error('Due date clear failed', err);
    });
    if (window.notionWriteback) window.notionWriteback.projectDue(data.notionUrl, null);
  };

  // Status — covers every schema enum value so opening any project doesn't crash.
  const STATUS_OPTIONS = [
    { id: 'active',   label: 'Active',   hint: 'Working on it' },
    { id: 'paused',   label: 'On hold',  hint: 'Paused or waiting for input' },
    { id: 'idea',     label: 'Idea',     hint: 'Not started, not blocked' },
    { id: 'routine',  label: 'Routine',  hint: 'Recurring practice' },
    { id: 'done',     label: 'Complete', hint: 'Finished' },
    { id: 'archived', label: 'Archived', hint: 'Out of view' },
  ];
  const [status, setStatus] = usePersistedState(`project.${projectId}.status`, data.status || 'active');
  const [statusOpen, setStatusOpen] = useState(false);
  const currentStatus = STATUS_OPTIONS.find(s => s.id === status)
    || { id: status, label: status || 'Active', hint: '' };

  // On-hold prompt
  const [holdPrompt, setHoldPrompt] = useState(null);
  const [holdData, setHoldData] = useState({
    flavor: null, waitingOn: '', checkInOn: '', resurfaceOn: '', why: ''
  });
  const persistStatus = (newStatus) => {
    window.db.update('course_projects', projectId, { status: newStatus }).then(() => {
      if (reloadData) reloadData(); // status affects which Triage section the project shows in
    }).catch((err) => {
      console.error('Status update failed', err);
      if (reloadData) reloadData();
    });
    if (window.notionWriteback) window.notionWriteback.projectStatus(data.notionUrl, newStatus);
  };

  // Push a local-only project (no notion_url) into Notion, then link it so all
  // future edits write back. Notion's Pillar is a rollup off Work Area, which
  // we can't set via the API, so the pushed page has no Work Area/Pillar yet.
  const [pushing, setPushing] = useState(false);
  const pushToNotion = async () => {
    if (pushing || data.notionUrl || !window.notionWriteback) return;
    setPushing(true);
    try {
      const due_date = data.due
        ? `${data.due.y}-${String(data.due.m + 1).padStart(2, '0')}-${String(data.due.d).padStart(2, '0')}`
        : null;
      const page = await window.notionWriteback.createProjectPage({
        name: data.name, pillar: data.pillar, outcome: data.dod || '', due_date, status,
      });
      if (page && page.url) {
        data.notionUrl = page.url; // optimistic registry mutation
        await window.db.update('course_projects', projectId, { notion_url: page.url });
        if (reloadData) await reloadData();
      } else {
        console.warn('Push to Notion returned no page (check notion_projects_db_id / integration share)');
      }
    } catch (err) {
      console.error('Push to Notion failed', err);
    } finally {
      setPushing(false);
    }
  };
  const pickStatus = (id) => {
    if (id === 'paused') { setStatusOpen(false); setHoldPrompt('choose'); }
    else {
      setStatus(id); setStatusOpen(false); setHoldPrompt(null);
      persistStatus(id);
    }
  };
  const commitHold = async () => {
    setStatus('paused');
    setHoldPrompt(null);
    persistStatus('paused');
    // Log the hold context as a status note so "where it stands" surfaces it.
    let body = '';
    if (holdData.flavor === 'blocked') {
      body = `On hold — blocked. Waiting on: ${holdData.waitingOn}`
        + (holdData.checkInOn ? `. Check in ${holdData.checkInOn}.` : '.');
    } else if (holdData.flavor === 'deprioritized') {
      body = `Setting down`
        + (holdData.resurfaceOn ? ` — resurface ${holdData.resurfaceOn}.` : '.')
        + (holdData.why ? ` ${holdData.why}` : '');
    }
    if (body && window.addStatusNoteForProject) {
      window.addStatusNoteForProject(projectId, body, 'manual', body);
    }
    if (body) {
      try {
        await window.db.insert('course_status_notes', {
          project_id: projectId, body, summary: body, source: 'manual',
        });
      } catch (err) { console.error('Hold note insert failed', err); }
    }
    setHoldData({ flavor: null, waitingOn: '', checkInOn: '', resurfaceOn: '', why: '' });
  };

  const toggleTaskDone = (id) => {
    const target = tasks.find((t) => t.id === id);
    const next = target ? !target.done : true;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: next, rawStatus: next ? 'done' : null } : t)));
    const today = new Date().toISOString().slice(0, 10);
    window.db.update('course_tasks', id, {
      status: next ? 'done' : null, // un-checking returns the task to blank
      completed_date: next ? today : null,
    }).catch((err) => {
      console.error('Task toggle failed', err);
      // Revert optimistic
      setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: !next } : t)));
    });
    if (target && target.notionUrl && window.notionWriteback) {
      window.notionWriteback.taskStatus(target.notionUrl, next ? 'done' : null);
    }
  };
  const commitNewTask = async () => {
    const v = newTaskText.trim();
    setNewTaskText('');
    setAddingTask(false);
    if (!v) return;
    // Temporary id for optimistic insert; replaced with real UUID after save.
    const tempId = `tmp-${Date.now()}`;
    setTasks((ts) => [...ts, { id: tempId, label: v, done: false }]);
    setHighlightIds([tempId]);
    setTimeout(() => setHighlightIds([]), 1400);
    try {
      const inserted = await window.db.insert('course_tasks', {
        project_id: projectId,
        title: v,
        // No status → blank by default (DB default; null post-migration).
      });
      const realId = inserted && inserted[0] && inserted[0].id;
      if (realId) {
        setTasks((ts) => ts.map((t) => (t.id === tempId ? { ...t, id: realId } : t)));
      }
      if (realId && window.notionWriteback) {
        const page = await window.notionWriteback.createTaskPage({
          title: v,
          projectNotionUrl: data.notionUrl,
        });
        if (page && page.url) {
          window.db.update('course_tasks', realId, { notion_url: page.url }).catch(() => {});
          setTasks((ts) => ts.map((t) => (t.id === realId ? { ...t, notionUrl: page.url } : t)));
        }
      }
      if (reloadData) reloadData(); // so Triage's card under this project picks it up
    } catch (err) {
      console.error('New task insert failed', err);
      setTasks((ts) => ts.filter((t) => t.id !== tempId));
    }
  };

  const addProposalTasks = () => {
    const newIds = proposalTasks.map(p => p.id);
    setTasks(ts => [
      ...ts,
      ...proposalTasks.map(p => ({ id: p.id, label: p.label, due: p.due, next: p.next, done: false })),
    ]);
    setHighlightIds(newIds);
    setShowProposal(false);
    setTimeout(() => setHighlightIds([]), 1400);
  };

  // Add a task from NextMoves (either a Think-It-Through resolution or a tap on a suggested move)
  const addNextMoveTask = (label, opts = {}) => {
    if (opts.existing) {
      // Tap on a suggested move that's already in tasks → just highlight it
      setHighlightIds([opts.id]);
      setTimeout(() => setHighlightIds([]), 1400);
      return;
    }
    const id = `nm${Date.now()}`;
    setTasks(ts => [...ts, { id, label, done: false, next: opts.tiny }]);
    setHighlightIds([id]);
    setTimeout(() => setHighlightIds([]), 1400);
  };

  // Long-press a task row → open the TaskSheet for editing.
  const [sheetTaskId, setSheetTaskId] = useState(null);
  const dateFromPick = (pick) => pick
    ? `${pick.y}-${String(pick.m + 1).padStart(2, '0')}-${String(pick.d).padStart(2, '0')}`
    : null;
  const parseDateStr = (s) => {
    if (!s) return null;
    const d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    return { m: d.getMonth(), d: d.getDate(), y: d.getFullYear() };
  };
  const SHEET_STATUS_FROM_SCHEMA = { next: 'todo', in_progress: 'doing', waiting: 'waiting', done: 'done' };
  const SHEET_STATUS_TO_SCHEMA   = { none: null, todo: 'next', doing: 'in_progress', waiting: 'waiting', done: 'done' };
  // 'none' and anything unknown map to a blank (null) status.
  const sheetStatusToSchema = (s) => (s in SHEET_STATUS_TO_SCHEMA ? SHEET_STATUS_TO_SCHEMA[s] : null);
  const sheetTask = sheetTaskId ? tasks.find((t) => t.id === sheetTaskId) : null;

  const saveTaskSheet = async (draft) => {
    if (!sheetTaskId) return;
    const id = sheetTaskId;
    setSheetTaskId(null);
    // Optimistic local update so the row reflects the edit immediately.
    setTasks((ts) => ts.map((t) => t.id === id ? {
      ...t,
      label: draft.label,
      done: draft.status === 'done',
      due: draft.date ? `${draft.date.y}-${String(draft.date.m + 1).padStart(2,'0')}-${String(draft.date.d).padStart(2,'0')}` : undefined,
      effort: draft.estimate ? `${draft.estimate}m`.replace('60m', '1h') : null,
      workType: draft.kind || null,
      notes: draft.note || null,
      rawStatus: sheetStatusToSchema(draft.status),
    } : t));
    const newSchemaStatus = sheetStatusToSchema(draft.status);
    const newIsoDate = dateFromPick(draft.date);
    const newProjectId = draft.projectId || null;
    const projectChanged = newProjectId !== projectId;
    try {
      await window.db.update('course_tasks', id, {
        title: draft.label,
        status: newSchemaStatus,
        do_date: newIsoDate,
        effort: draft.estimate ? `${draft.estimate}m`.replace('60m', '1h') : null,
        work_type: draft.kind || null,
        notes: draft.note || null,
        completed_date: draft.status === 'done' ? new Date().toISOString().slice(0, 10) : null,
        project_id: newProjectId,
      });
      if (window.notionWriteback && sheetTask && sheetTask.notionUrl) {
        if (sheetTask.label !== draft.label) window.notionWriteback.taskTitle(sheetTask.notionUrl, draft.label);
        if (sheetTask.rawStatus !== newSchemaStatus) window.notionWriteback.taskStatus(sheetTask.notionUrl, newSchemaStatus);
        if (sheetTask.due !== newIsoDate) window.notionWriteback.taskDoDate(sheetTask.notionUrl, newIsoDate);
        if (projectChanged) {
          const targetProject = newProjectId && window.PROJECTS[newProjectId];
          window.notionWriteback.taskProject(sheetTask.notionUrl, targetProject ? targetProject.notionUrl : null);
        }
      }
      if (projectChanged) {
        // The task no longer belongs to this project; remove it from local list.
        setTasks((ts) => ts.filter((t) => t.id !== id));
      }
      if (reloadData) reloadData();
    } catch (err) {
      console.error('Task sheet update failed', err);
      if (reloadData) reloadData(); // revert via re-fetch
    }
  };

  // Delete the currently-open task: remove locally, DELETE from Supabase,
  // and best-effort archive the Notion page if one exists.
  const deleteTaskFromSheet = async () => {
    if (!sheetTaskId) return;
    const id = sheetTaskId;
    const target = tasks.find((t) => t.id === id);
    setSheetTaskId(null);
    setTasks((ts) => ts.filter((t) => t.id !== id));
    try {
      await window.db.delete('course_tasks', id);
      if (target && target.notionUrl) {
        const pageId = String(target.notionUrl).match(/([0-9a-f]{32})/i);
        if (pageId) {
          window.db.edge('course-notion-fetch', {
            action: 'update_page', page_id: pageId[1], body: { archived: true },
          }).catch((err) => console.warn('Notion archive failed:', err));
        }
      }
      if (reloadData) reloadData();
    } catch (err) {
      console.error('Task delete failed', err);
      if (reloadData) reloadData(); // revert via re-fetch
    }
  };

  // Push the currently-open task to Apple Reminders via the user's existing
  // "CourseAddReminder" Shortcut. Input is a pipe-delimited string:
  //   title | do_date (YYYY-MM-DD) | project name | notes
  // Shortcut splits and creates a Reminder. No-op on non-iOS.
  const pushTaskToReminders = (draft) => {
    if (!sheetTaskId) return;
    const id = sheetTaskId;
    const target = tasks.find((t) => t.id === id);
    if (!target) return;
    const title = (draft && draft.label || target.label || '').trim();
    const dateStr = draft && draft.date
      ? `${draft.date.y}-${String(draft.date.m + 1).padStart(2, '0')}-${String(draft.date.d).padStart(2, '0')}`
      : '';
    const projectName = (data && data.name) || '';
    const notes = (draft && draft.note || target.notes || '').trim();
    const input = [title, dateStr, projectName, notes].join('|');
    const url = `shortcuts://run-shortcut?name=CourseAddReminder&input=text&text=${encodeURIComponent(input)}`;
    window.location.href = url;
    // Mark task as pushed in Supabase + Notion.
    window.db.update('course_tasks', id, { status: 'pushed' }).catch((err) => console.error('Push status update failed', err));
    if (target.notionUrl && window.notionWriteback) {
      window.notionWriteback.taskStatus(target.notionUrl, 'pushed');
    }
    setSheetTaskId(null);
  };

  // Task reorder (drag handle) — Sortable on the open-task list. On drop we
  // renumber sort_order (1000-spaced) for every open task and persist.
  const tasksRef = React.useRef(tasks);
  React.useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  const taskSortableRef = React.useRef(null);

  const persistTaskReorder = React.useCallback((oldIndex, newIndex) => {
    if (oldIndex === newIndex) return;
    const all = tasksRef.current || [];
    const open = all.filter((t) => !t.done);
    const done = all.filter((t) => t.done);
    if (oldIndex < 0 || oldIndex >= open.length) return;
    const [moved] = open.splice(oldIndex, 1);
    open.splice(Math.max(0, Math.min(newIndex, open.length)), 0, moved);
    const renumbered = open.map((t, i) => ({ ...t, sortOrder: (i + 1) * 1000 }));
    setTasks([...renumbered, ...done]);
    renumbered.forEach((t) => {
      window.db.update('course_tasks', t.id, { sort_order: t.sortOrder })
        .catch((err) => console.error('Task reorder persist failed', err));
    });
  }, [setTasks]);

  const setTaskSortRef = React.useCallback((el) => {
    if (taskSortableRef.current) {
      try { taskSortableRef.current.destroy(); } catch (e) {}
      taskSortableRef.current = null;
    }
    if (!el || typeof window.Sortable === 'undefined') return;
    taskSortableRef.current = window.Sortable.create(el, {
      handle: '.task-grip',
      animation: 180,
      ghostClass: 'task-drag-ghost',
      chosenClass: 'task-drag-chosen',
      dragClass: 'task-drag-active',
      fallbackOnBody: true,
      forceFallback: true,
      onEnd: (evt) => {
        if (evt.oldIndex !== evt.newIndex && evt.item && evt.item.parentNode) {
          const parent = evt.item.parentNode;
          const refChild = parent.children[evt.oldIndex] || null;
          if (refChild && refChild !== evt.item) parent.insertBefore(evt.item, refChild);
          else if (!refChild) parent.appendChild(evt.item);
        }
        persistTaskReorder(evt.oldIndex, evt.newIndex);
      },
    });
  }, [persistTaskReorder]);
  React.useEffect(() => () => {
    if (taskSortableRef.current) { try { taskSortableRef.current.destroy(); } catch (e) {} }
  }, []);

  // Per-row component so each task gets its own useLongPress without
  // violating Rules of Hooks (no hook calls inside .map callbacks).
  const ProjectTaskRow = ({ task, grip }) => {
    const lp = useLongPress(() => setSheetTaskId(task.id));
    return (
      <div
        key={task.id}
        className={`task-row ${task.done ? 'done' : ''} ${highlightIds.includes(task.id) ? 'flash' : ''}`}
        onClick={() => { if (!lp.didFire()) toggleTaskDone(task.id); }}
        {...lp.bind}
      >
        {grip && (
          <span
            className="task-grip"
            aria-hidden="true"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >⠿</span>
        )}
        <span className="box"></span>
        <span className="label">{task.label}</span>
        {task.waiting && (
          <span className="waiting-badge">
            <span className="waiting-dot"></span>
            <span className="waiting-label">Waiting</span>
            {typeof task.waiting === 'string' && <span className="waiting-who">{task.waiting}</span>}
          </span>
        )}
        {task.due && <span className="tdue tnum">{task.due}</span>}
        {task.next && <span className="next">next</span>}
      </div>
    );
  };

  // Pillar pill editor — tap to pick from { arrow, sunny, side, life, null }.
  const [pillarOpen, setPillarOpen] = useState(false);
  const PILLAR_CHOICES = [
    { id: 'arrow', label: 'Arrow' },
    { id: 'sunny', label: 'Slow Down Sunny' },
    { id: 'side',  label: 'Side Projects' },
    { id: 'life',  label: 'Life' },
    { id: null,    label: 'Unfiled' },
  ];
  const PILLAR_LABEL_MAP = { arrow: 'Arrow', sunny: 'Slow Down Sunny', side: 'Side Projects', life: 'Life' };
  const pickPillar = (newPillar) => {
    setPillarOpen(false);
    if (newPillar === data.pillar) return;
    // Optimistic mutation of the in-memory registry so the pill updates now.
    data.pillar = newPillar;
    data.pillarLabel = [PILLAR_LABEL_MAP[newPillar] || newPillar, data.tag].filter(Boolean).join(' · ');
    window.db.update('course_projects', projectId, { pillar: newPillar }).then(() => {
      if (reloadData) reloadData(); // pillar move shuffles Triage sections
    }).catch((err) => {
      console.error('Pillar update failed', err);
      if (reloadData) reloadData();
    });
    // Notion pillar lives at the Area level (Project → Work Area → Pillar
    // relation), not as a direct project property. No writeback — user updates
    // the Area in Notion if needed.
  };

  // Inline tag (work_area) editor — tap pill to edit, blur or Enter commits.
  const [tagEdit, setTagEdit] = useState(null);
  const commitTag = async () => {
    const v = (tagEdit || '').trim();
    setTagEdit(null);
    if (v === (data.tag || '').trim()) return;
    data.tag = v || null;
    // Re-derive pillarLabel since tag is part of it.
    data.pillarLabel = [PILLAR_LABEL_MAP[data.pillar] || data.pillar, v].filter(Boolean).join(' · ');
    try {
      await window.db.update('course_projects', projectId, { work_area: v || null });
      if (reloadData) reloadData();
    } catch (err) {
      console.error('Tag update failed', err);
      if (reloadData) reloadData();
    }
  };

  // Inline title editor — tap title to edit, blur or Enter commits.
  const [titleEdit, setTitleEdit] = useState(null);
  const commitTitle = async () => {
    const v = (titleEdit || '').trim();
    setTitleEdit(null);
    if (!v || v === data.name) return;
    data.name = v; // optimistic mutation of the registry
    try {
      await window.db.update('course_projects', projectId, { name: v });
      if (window.notionWriteback) window.notionWriteback.projectName(data.notionUrl, v);
      if (reloadData) reloadData();
    } catch (err) {
      console.error('Title update failed', err);
      if (reloadData) reloadData(); // revert by re-fetching
    }
  };

  // Latest status note text — passed into NextMoves so Claude quote-priorities it.
  const [latestStatusNote, setLatestStatusNote] = useState(null);
  const [contextOpen, setContextOpen] = useState(false);
  const addStatusNote = (body, source) => {
    if (window.addStatusNoteForProject) {
      window.addStatusNoteForProject(projectId, body, source);
    }
  };

  return (
    <div className="screen" data-screen-label="02 Project">

      <div className="proj-head-screen">
        <div className="back" onClick={onBack}>
          <Icon.ChevLeft /><span>Triage</span>
        </div>
        {titleEdit !== null ? (
          <input
            className="proj-title-input"
            autoFocus
            value={titleEdit}
            onChange={(e) => setTitleEdit(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
              if (e.key === 'Escape') setTitleEdit(null);
            }}
          />
        ) : (
          <div
            className="proj-title"
            title="Tap to rename"
            onClick={() => setTitleEdit(data.name)}
          >
            {data.name}
          </div>
        )}
        <div className="proj-meta">
          <span className="pill-wrap">
            <span
              className={`pill status-${status} ${statusOpen ? 'open' : ''}`}
              onClick={(e) => { e.stopPropagation(); setStatusOpen(o => !o); setCalOpen(false); setPillarOpen(false); }}
            >
              <span className={`status-dot status-${status}`}></span>
              {currentStatus.label}
              <Icon.Chevron />
            </span>
            {statusOpen && (
              <div className="popover">
                {STATUS_OPTIONS.map(s => (
                  <div
                    key={s.id}
                    className={`popover-row ${s.id === status ? 'on' : ''}`}
                    onClick={() => pickStatus(s.id)}
                  >
                    <span className={`status-dot status-${s.id}`}></span>
                    <span className="pop-label">{s.label}</span>
                    <span className="pop-hint">{s.hint}</span>
                  </div>
                ))}
              </div>
            )}
          </span>
          <span className="pill-wrap">
            <span
              className={`pill pillar-pill ${pillarOpen ? 'open' : ''}`}
              onClick={(e) => { e.stopPropagation(); setPillarOpen((o) => !o); setStatusOpen(false); setCalOpen(false); }}
            >
              <PillarDot pillar={data.pillar} size={6} />
              {PILLAR_LABEL_MAP[data.pillar] || data.pillar || 'Unfiled'}
              <Icon.Chevron />
            </span>
            {pillarOpen && (
              <div className="popover">
                {PILLAR_CHOICES.map((p) => (
                  <div
                    key={p.id || 'none'}
                    className={`popover-row ${(p.id || null) === (data.pillar || null) ? 'on' : ''}`}
                    onClick={() => pickPillar(p.id)}
                  >
                    <PillarDot pillar={p.id} size={6} />
                    <span className="pop-label">{p.label}</span>
                  </div>
                ))}
              </div>
            )}
          </span>
          {data.notionUrl ? (
            <a
              href={data.notionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pill"
              style={{ textDecoration: 'none', color: 'var(--text-muted)' }}
              onClick={(e) => e.stopPropagation()}
            >
              ↗ Notion
            </a>
          ) : (
            <span
              className="pill"
              style={{ cursor: 'pointer', color: 'var(--text-muted)', opacity: pushing ? 0.6 : 1 }}
              onClick={(e) => { e.stopPropagation(); pushToNotion(); }}
            >
              {pushing ? 'Pushing…' : '↗ Push to Notion'}
            </span>
          )}
          {tagEdit !== null ? (
            <input
              className="pill tag-pill-input"
              autoFocus
              value={tagEdit}
              onChange={(e) => setTagEdit(e.target.value)}
              onBlur={commitTag}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitTag(); }
                if (e.key === 'Escape') setTagEdit(null);
              }}
              placeholder="Tag"
            />
          ) : (
            <span
              className={`pill tag-pill ${data.tag ? '' : 'empty'}`}
              onClick={() => setTagEdit(data.tag || '')}
            >
              {data.tag || '+ Tag'}
            </span>
          )}
          {dueDate && (
            <span className="pill-wrap">
              <span
                className={`pill due ${calOpen ? 'open' : ''}`}
                onClick={(e) => { e.stopPropagation(); setCalOpen(o => !o); setStatusOpen(false); }}
              >
                <Icon.Flag />
                Due {MONTHS[dueDate.m]} {dueDate.d}
              </span>
              {calOpen && (
                <div className="popover cal">
                  <div className="cal-head">
                    <button className="cal-nav" onClick={() => stepMonth(-1)} aria-label="Previous"><Icon.ChevLeft /></button>
                    <span className="cal-title">{MONTHS_FULL[calMonth.m]} {calMonth.y}</span>
                    <button className="cal-nav" onClick={() => stepMonth(1)} aria-label="Next" style={{ transform: 'rotate(180deg)' }}><Icon.ChevLeft /></button>
                  </div>
                  <div className="cal-grid">
                    {['S','M','T','W','T','F','S'].map((d, i) => (
                      <span key={`dow-${i}`} className="cal-dow">{d}</span>
                    ))}
                    {Array.from({ length: firstDow }).map((_, i) => (
                      <span key={`pad-${i}`} className="cal-pad"></span>
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const isSelected = dueDate && day === dueDate.d && calMonth.m === dueDate.m && calMonth.y === dueDate.y;
                      return (
                        <span
                          key={`d-${day}`}
                          className={`cal-day tnum ${isSelected ? 'sel' : ''}`}
                          onClick={() => pickDay(day)}
                        >
                          {day}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </span>
          )}
        </div>

        {holdPrompt && (
          <div className="hold-prompt">
            {holdPrompt === 'choose' && (
              <>
                <div className="hold-title">Why are you putting this on hold?</div>
                <div className="hold-options">
                  <div className="hold-opt" onClick={() => { setHoldData(d => ({ ...d, flavor: 'blocked' })); setHoldPrompt('blocked'); }}>
                    <div className="hold-opt-label">Blocked on something</div>
                    <div className="hold-opt-hint">Waiting on someone or something external. Stays in triage.</div>
                  </div>
                  <div className="hold-opt" onClick={() => { setHoldData(d => ({ ...d, flavor: 'deprioritized' })); setHoldPrompt('deprio'); }}>
                    <div className="hold-opt-label">Setting it down</div>
                    <div className="hold-opt-hint">Nothing blocking — choosing to pause. Hidden until a date.</div>
                  </div>
                </div>
                <div className="hold-actions">
                  <span className="chip ghost" onClick={() => setHoldPrompt(null)}>Cancel</span>
                </div>
              </>
            )}
            {holdPrompt === 'blocked' && (
              <>
                <div className="hold-title">Blocked on <span className="hold-step">step 1 of 2</span></div>
                <label className="hold-field">
                  <span className="hold-field-label">Waiting on</span>
                  <input
                    autoFocus
                    placeholder="e.g. AWS pricing — Marcus owns it"
                    value={holdData.waitingOn}
                    onChange={(e) => setHoldData(d => ({ ...d, waitingOn: e.target.value }))}
                  />
                </label>
                <label className="hold-field">
                  <span className="hold-field-label">Check in on</span>
                  <input
                    type="date"
                    value={holdData.checkInOn}
                    onChange={(e) => setHoldData(d => ({ ...d, checkInOn: e.target.value }))}
                  />
                </label>
                <div className="hold-actions">
                  <span className="chip" onClick={() => setHoldPrompt('choose')}>Back</span>
                  <span
                    className={`chip primary ${holdData.waitingOn && holdData.checkInOn ? '' : 'disabled'}`}
                    onClick={() => holdData.waitingOn && holdData.checkInOn && commitHold()}
                  >
                    Put on hold
                  </span>
                </div>
              </>
            )}
            {holdPrompt === 'deprio' && (
              <>
                <div className="hold-title">Setting it down</div>
                <label className="hold-field">
                  <span className="hold-field-label">Resurface on</span>
                  <input
                    type="date"
                    autoFocus
                    value={holdData.resurfaceOn}
                    onChange={(e) => setHoldData(d => ({ ...d, resurfaceOn: e.target.value }))}
                  />
                </label>
                <label className="hold-field">
                  <span className="hold-field-label">Why (optional)</span>
                  <input
                    placeholder="e.g. waiting for capacity next quarter"
                    value={holdData.why}
                    onChange={(e) => setHoldData(d => ({ ...d, why: e.target.value }))}
                  />
                </label>
                <div className="hold-actions">
                  <span className="chip" onClick={() => setHoldPrompt('choose')}>Back</span>
                  <span
                    className={`chip primary ${holdData.resurfaceOn ? '' : 'disabled'}`}
                    onClick={() => holdData.resurfaceOn && commitHold()}
                  >
                    Set down
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Where it stands — user's own status notes */}
      <StatusLog
        projectId={projectId}
        projectName={data.name}
        seedEntries={data.statusSeed}
        onLatestChange={setLatestStatusNote}
      />

      {/* Rolled-up context: Notion + Latest + Milestones collapse under
          the user's status note until the user wants the inferred view. */}
      <div className={`rolled-context ${contextOpen ? 'open' : ''}`}>
        <div className="rolled-toggle-inline" onClick={() => setContextOpen(o => !o)}>
          <span className="rolled-toggle-label-inline">
            {contextOpen ? 'Hide details' : 'More details'}
            {!contextOpen && data.notion && (
              <span className="rolled-meta-inline tnum">
                · Notion · {data.notion.pages} · {allMilestones.length} milestones · synthesis
              </span>
            )}
          </span>
          <span className={`rolled-chev ${contextOpen ? 'open' : ''}`}>›</span>
        </div>

        {contextOpen && (
          <div className="rolled-body">
            {/* Notion summary — manual, on-demand */}
            {data.notion && (
              <NotionSummary
                projectId={projectId}
                projectName={data.name}
                pageCount={data.notion.pages}
                lastEditedAgo={data.notion.editedAgo}
              />
            )}

            {/* Latest */}
            <div className="section">
              <div className="lbl-row">
                <span className="lbl">Latest synthesis</span>
                <span className="action">
                  <Icon.Refresh />
                  <span>Refresh</span>
                </span>
              </div>
              <div className="latest-box">
                {data.latest && <div className="body-text">{data.latest}</div>}
                <div className="dod">
                  <div className="dod-label">Definition of done</div>
                  <div
                    className="dod-text"
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck={false}
                    data-placeholder="What does done look like?"
                    onBlur={(e) => commitDod(e.currentTarget.textContent)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                  >
                    {dodText}
                  </div>
                </div>
                {data.stamp && <div className="stamp tnum">{data.stamp}</div>}
              </div>
            </div>

            {/* Milestones */}
            {allMilestones.length > 0 && (
              <div className="section">
                <div className="lbl-row">
                  <span className="lbl">Milestones</span>
                </div>
                <div className="milestones">
                  {allMilestones.map((m, i) => {
                    const dateOverride = milestoneDates[m.id];
                    const subText = dateOverride ? fmtMsDate(dateOverride) : m.sub;
                    return (
                      <div key={m.id} className={`ms ${m.state || 'upcoming'}`}>
                        <span className="marker"></span>
                        <div className="ms-body">
                          <div className="ms-label">{m.label}</div>
                          <div className="ms-meta">
                            {subText && (
                              <span
                                className={`ms-date ${dateOverride ? 'has-date' : ''}`}
                                onClick={() => setMsCalFor(c => c === m.id ? null : m.id)}
                              >
                                {subText}
                                {dateOverride && (
                                  <span
                                    className="ms-date-clear"
                                    onClick={(e) => { e.stopPropagation(); clearMsDate(m.id); }}
                                  >×</span>
                                )}
                              </span>
                            )}
                            {!subText && (
                              <span
                                className="ms-date ghost"
                                onClick={() => setMsCalFor(c => c === m.id ? null : m.id)}
                              >+ date</span>
                            )}
                          </div>
                          {msCalFor === m.id && (
                            <div className="ms-cal">
                              <MiniCalendar
                                initial={dateOverride ? new Date(dateOverride.y, dateOverride.m, dateOverride.d) : undefined}
                                onPick={(pick) => setMsDate(m.id, pick)}
                                onDismiss={() => setMsCalFor(null)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {addingMs ? (
                    <div className="ms upcoming ms-adding">
                      <span className="marker"></span>
                      <div className="ms-body">
                        <input
                          autoFocus
                          className="ms-input"
                          value={newMsText}
                          onChange={(e) => setNewMsText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitNewMilestone();
                            if (e.key === 'Escape') {
                              setNewMsText(''); setNewMsDate(null); setNewMsCalOpen(false); setAddingMs(false);
                            }
                          }}
                          placeholder="New milestone…"
                        />
                        <div className="ms-meta">
                          {newMsDate ? (
                            <span
                              className="ms-date has-date"
                              onClick={() => setNewMsCalOpen(o => !o)}
                            >
                              {fmtMsDate(newMsDate)}
                              <span
                                className="ms-date-clear"
                                onClick={(e) => { e.stopPropagation(); setNewMsDate(null); }}
                              >×</span>
                            </span>
                          ) : (
                            <span
                              className="ms-date ghost"
                              onClick={() => setNewMsCalOpen(o => !o)}
                            >+ date</span>
                          )}
                          <span className="ms-add-actions">
                            <span className="ms-add-action save" onClick={commitNewMilestone}>Add</span>
                            <span className="ms-add-action cancel" onClick={() => {
                              setNewMsText(''); setNewMsDate(null); setNewMsCalOpen(false); setAddingMs(false);
                            }}>Cancel</span>
                          </span>
                        </div>
                        {newMsCalOpen && (
                          <div className="ms-cal">
                            <MiniCalendar
                              initial={newMsDate ? new Date(newMsDate.y, newMsDate.m, newMsDate.d) : undefined}
                              onPick={(pick) => { setNewMsDate(pick); setNewMsCalOpen(false); }}
                              onDismiss={() => setNewMsCalOpen(false)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="ms ms-add" onClick={() => setAddingMs(true)}>
                      <span className="marker"></span>
                      <div className="ms-label">+ Add milestone</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tasks */}
      <div className="section">
        <div className="lbl-row">
          <span className="lbl">Tasks</span>
        </div>
        <div className="ptasks">
          <div className="task-sort" ref={setTaskSortRef}>
            {tasks.filter(t => !t.done).map(t => <ProjectTaskRow key={t.id} task={t} grip />)}
          </div>
          {addingTask ? (
            <div className="add-task adding">
              <span className="plus-mini">+</span>
              <input
                autoFocus
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                onBlur={commitNewTask}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitNewTask();
                  if (e.key === 'Escape') { setNewTaskText(''); setAddingTask(false); }
                }}
                placeholder="New task…"
              />
            </div>
          ) : (
            <div className="add-task" onClick={() => setAddingTask(true)}>
              <span className="plus-mini">+</span>
              <span>New task</span>
            </div>
          )}
          {tasks.some(t => t.done) && (
            <>
              <div
                className={`completed-toggle ${showCompleted ? 'open' : ''}`}
                onClick={() => setShowCompleted(v => !v)}
              >
                <span className="caret">{showCompleted ? '▾' : '▸'}</span>
                <span>Completed ({tasks.filter(t => t.done).length})</span>
              </div>
              {showCompleted && tasks.filter(t => t.done).map(t => (
                <ProjectTaskRow key={t.id} task={t} />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Next Moves — suggested actions + Think it through (under tasks) */}
      <NextMoves
        projectId={projectId}
        projectData={{ ...data, status, latestStatusNote }}
        tasks={tasks}
        onAddTask={addNextMoveTask}
        onChangeStatus={(newStatus) => setStatus(newStatus)}
        onStatusNote={addStatusNote}
      />

      {/* Riff */}
      <div className="section">
        <div className="lbl-row">
          <span className="lbl">Riff</span>
        </div>
        <div className="riff">
          {riffExpanded ? (
            <textarea
              autoFocus
              className="expanded"
              value={riffText}
              onChange={(e) => setRiffText(e.target.value)}
              ref={(el) => {
                if (el) {
                  el.style.height = 'auto';
                  el.style.height = el.scrollHeight + 'px';
                }
              }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
            ></textarea>
          ) : (
            <div className="riff-collapsed" onClick={() => setRiffExpanded(true)}>
              <div className="riff-clamp">{riffText}</div>
              <div className="riff-expand">Click to expand</div>
            </div>
          )}
          <div className="riff-bar">
            <span className={`route ${route === 'auto' ? 'on' : ''}`} onClick={() => setRoute('auto')}>Auto</span>
            <span className={`route ${route === 'note' ? 'on' : ''}`} onClick={() => setRoute('note')}>Note</span>
            <span className={`route ${route === 'task' ? 'on' : ''}`} onClick={() => setRoute('task')}>Task</span>
            <span className={`route ${route === 'milestone' ? 'on' : ''}`} onClick={() => setRoute('milestone')}>Milestone</span>
            <button className="mic-inline" aria-label="Voice"><Icon.Mic /></button>
            <button className="riff-go" onClick={processRiff} disabled={processing}>
              {processing ? 'Processing…' : 'Process'}
            </button>
          </div>
        </div>

        {showProposal && proposalTasks.length > 0 && (
          <div className="proposal">
            <div className="ptitle">
              Pulled out {proposalTasks.length} task{proposalTasks.length === 1 ? '' : 's'} · {proposalMilestones} milestone{proposalMilestones === 1 ? '' : 's'} · saved as note
            </div>
            {proposalTasks.map(p => (
              <div className="pitem" key={p.id}>
                <span className="ptype">task</span>
                <span style={{ flex: 1, minWidth: 0 }}>{p.label}</span>
                {p.due && <span className="pmeta tnum">{p.due}</span>}
              </div>
            ))}
            <div className="pactions">
              <span className="chip primary" onClick={addProposalTasks}>
                Add {proposalTasks.length === 1 ? 'task' : 'all'}
              </span>
              <span className="chip">Review each</span>
              <span className="chip ghost" onClick={() => setShowProposal(false)}>Discard</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ height: 120 }}></div>

      {sheetTaskId && sheetTask && (
        <TaskSheet
          task={{
            label:     sheetTask.label,
            done:      sheetTask.done,
            status:    sheetTask.done ? 'done' : (SHEET_STATUS_FROM_SCHEMA[sheetTask.rawStatus] || 'none'),
            date:      parseDateStr(sheetTask.due),
            estimate:  sheetTask.effort
              ? Number(String(sheetTask.effort).replace('h', '').replace('m', '')) * (String(sheetTask.effort).includes('h') ? 60 : 1) || null
              : null,
            kind:      sheetTask.workType || null,
            note:      sheetTask.notes || '',
            projectId: projectId,
          }}
          onClose={() => setSheetTaskId(null)}
          onSave={saveTaskSheet}
          onDelete={deleteTaskFromSheet}
          onPushReminders={pushTaskToReminders}
        />
      )}
    </div>
  );
}

window.Project = Project;
