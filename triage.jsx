// Triage screen — pillar-by-pillar status-forward board

const { useState } = React;

// Display name for each pillar id. Titlecase whatever Notion gave us;
// known ids get explicit labels in case the raw value is messy.
const PILLAR_DISPLAY = {
  arrow: 'Arrow',
  sunny: 'Slow Down Sunny',
  life:  'Life',
  side:  'Side Gigs',
};
const pillarDisplayName = (id) =>
  PILLAR_DISPLAY[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Unfiled');

// Maps schema's project status enum to the three Triage buckets.
function bucketFor(status) {
  if (status === 'idea') return 'idea';
  if (status === 'paused') return 'onhold';
  if (status === 'done' || status === 'archived' || status === 'dropped') return 'hidden';
  return 'active'; // active, routine, under_review
}

function Triage({ onOpenProject, density, showQueue, reloadData, pendingInboxCount, onChangeScreen }) {
  const [collapsed, setCollapsed] = usePersistedState('triage.collapsed', { arrow: false, sunny: true, side: true });
  const [ideasOpen, setIdeasOpen] = usePersistedState('triage.ideasOpen', {});
  const [dismissed, setDismissed] = usePersistedState('triage.dismissed', {});
  const [projStatus, setProjStatus] = usePersistedState('triage.projStatus', {});
  const [queueResolved, setQueueResolved] = usePersistedState('triage.queueResolved', {});
  // Derive taskDone fresh from window.PROJECTS on each mount/reload so the
  // checkbox state mirrors Supabase. Optimistic toggles overlay this until
  // the next reload re-derives.
  const deriveTaskDone = () => {
    const map = {};
    for (const p of Object.values(window.PROJECTS || {})) {
      for (const t of (p.initialTasks || [])) {
        if (t.done) map[t.id] = true;
      }
    }
    for (const arr of Object.values(window.PILLAR_TASKS || {})) {
      for (const t of arr) {
        if (t.done) map[t.id] = true;
      }
    }
    return map;
  };
  const [taskDone, setTaskDone] = useState(deriveTaskDone);
  // Re-derive when the project registry identity changes (after reload).
  React.useEffect(() => { setTaskDone(deriveTaskDone()); }, [window.PROJECTS]);
  const [taskMeta, setTaskMeta] = usePersistedState('triage.taskMeta', {});
  const [calendarFor, setCalendarFor] = useState(null);
  const [overlay, setOverlay] = useState(null);
  const [sheetTaskId, setSheetTaskId] = useState(null);
  const [captureText, setCaptureText] = useState('');
  const [captureMenuOpen, setCaptureMenuOpen] = useState(false);
  const [captureToast, setCaptureToast] = useState(null); // {label, hint}
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureSheet, setCaptureSheet] = useState(null); // {kind, text, aiClassified}
  const [addingIdeaFor, setAddingIdeaFor] = useState(null); // pillar id
  const [ideaText, setIdeaText] = useState('');
  const commitNewIdea = async (pillarId) => {
    const v = ideaText.trim();
    setAddingIdeaFor(null);
    setIdeaText('');
    if (!v) return;
    try {
      await window.db.insert('course_projects', { name: v, pillar: pillarId, status: 'idea' });
      if (reloadData) await reloadData();
    } catch (err) {
      console.error('New idea insert failed', err);
    }
  };
  const [addingTaskFor, setAddingTaskFor] = useState(null); // pillar id
  const [newTaskText, setNewTaskText] = useState('');
  const commitNewTask = async (pillarId) => {
    const v = newTaskText.trim();
    setAddingTaskFor(null);
    setNewTaskText('');
    if (!v) return;
    try {
      await window.db.insert('course_tasks', { title: v, pillar: pillarId, status: 'next' });
      if (reloadData) await reloadData();
    } catch (err) {
      console.error('New pillar task insert failed', err);
    }
  };
  const toastTimerRef = React.useRef(null);
  const showCaptureToast = (label, hint) => {
    setCaptureToast({ label, hint });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setCaptureToast(null), 2400);
  };
  React.useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  // Project reorder (long-press drag) — Sortable.js attaches to each pillar's
  // active-list container. On drop, we renumber sort_order for every active
  // project in that pillar (sequential, 1000-spaced) and persist to Supabase.
  const activeListRefs = React.useRef({});       // pid -> DOM element
  const sortableInstancesRef = React.useRef({}); // pid -> Sortable instance
  const reloadDataRef = React.useRef(reloadData);
  React.useEffect(() => { reloadDataRef.current = reloadData; }, [reloadData]);
  // Bumping this forces Triage to re-render after we mutate window.PROJECTS
  // in place, so the new order paints before the Supabase round-trip resolves.
  const [, setReorderTick] = useState(0);

  const persistReorder = React.useCallback(async (pillarId, oldIndex, newIndex) => {
    if (oldIndex === newIndex) return;
    const current = Object.values(window.PROJECTS || {})
      .filter(p => (p.pillar || 'unfiled') === pillarId
        && bucketFor((projStatus[p.id] || p.status)) === 'active')
      .sort((a, b) => {
        const ao = a.sortOrder == null ? Infinity : a.sortOrder;
        const bo = b.sortOrder == null ? Infinity : b.sortOrder;
        if (ao !== bo) return ao - bo;
        const at = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
        const bt = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
        return bt - at;
      });
    if (oldIndex < 0 || oldIndex >= current.length) return;
    const [moved] = current.splice(oldIndex, 1);
    current.splice(Math.max(0, Math.min(newIndex, current.length)), 0, moved);
    // Optimistic local update so React's next render matches the drop.
    current.forEach((p, i) => {
      const order = (i + 1) * 1000;
      p.sortOrder = order;
      if (window.PROJECTS[p.id]) window.PROJECTS[p.id].sortOrder = order;
    });
    setReorderTick((t) => t + 1);
    try {
      await Promise.all(current.map((p) =>
        window.db.update('course_projects', p.id, { sort_order: p.sortOrder })
      ));
    } catch (err) {
      console.error('Project reorder persist failed', err);
      if (reloadDataRef.current) reloadDataRef.current();
    }
  }, [projStatus]);

  const setActiveListRef = React.useCallback((pillarId) => (el) => {
    const prev = activeListRefs.current[pillarId];
    if (prev === el) return;
    // Tear down any sortable bound to the previous element for this pillar.
    if (sortableInstancesRef.current[pillarId]) {
      try { sortableInstancesRef.current[pillarId].destroy(); } catch (e) {}
      delete sortableInstancesRef.current[pillarId];
    }
    activeListRefs.current[pillarId] = el || null;
    if (!el || typeof window.Sortable === 'undefined') return;
    sortableInstancesRef.current[pillarId] = window.Sortable.create(el, {
      delay: 450,
      delayOnTouchOnly: true,
      animation: 180,
      ghostClass: 'proj-drag-ghost',
      chosenClass: 'proj-drag-chosen',
      dragClass: 'proj-drag-active',
      fallbackOnBody: true,
      forceFallback: true,
      onEnd: (evt) => {
        // Revert DOM mutation so React stays the source of truth, then persist.
        if (evt.oldIndex !== evt.newIndex && evt.item && evt.item.parentNode) {
          const parent = evt.item.parentNode;
          const refChild = parent.children[evt.oldIndex] || null;
          if (refChild && refChild !== evt.item) parent.insertBefore(evt.item, refChild);
          else if (!refChild) parent.appendChild(evt.item);
        }
        persistReorder(pillarId, evt.oldIndex, evt.newIndex);
      },
    });
  }, [persistReorder]);

  // Clean up sortable instances on unmount.
  React.useEffect(() => () => {
    for (const s of Object.values(sortableInstancesRef.current)) {
      try { s.destroy(); } catch (e) {}
    }
    sortableInstancesRef.current = {};
  }, []);

  const openCaptureSheet = (kind, text, aiClassified = false, suggestedProjectId = null) => {
    setCaptureSheet({ kind, text, aiClassified, suggestedProjectId });
  };

  // Format a {m,d,y} pick from the sheet's calendar into a YYYY-MM-DD date.
  const dateFromPick = (pick) => pick
    ? `${pick.y}-${String(pick.m + 1).padStart(2, '0')}-${String(pick.d).padStart(2, '0')}`
    : null;

  // Map the capture sheet's task status (todo/doing/waiting) to the schema enum.
  const taskStatusToSchema = (s) =>
    ({ todo: 'next', doing: 'in_progress', waiting: 'waiting' }[s] || 'next');

  const saveCapture = async (draft) => {
    setCaptureSheet(null);
    setCaptureText('');
    const map = {
      project: { label: 'Project created', hint: draft.name ? `"${draft.name}"` : '' },
      task:    { label: 'Task added',      hint: draft.label ? `"${draft.label}"` : '' },
      note:    { label: 'Note filed',      hint: draft.pillar ? 'Tagged · ready to triage' : 'In Inbox' },
    };
    showCaptureToast(map[draft.kind].label, map[draft.kind].hint);

    try {
      if (draft.kind === 'project') {
        const inserted = await window.db.insert('course_projects', {
          name: draft.name.trim(),
          pillar: draft.pillar || null,
          outcome: draft.dod || null,
          due_date: dateFromPick(draft.due),
          status: 'active',
        });
        const newId = inserted && inserted[0] && inserted[0].id;
        // Push to Notion (skips silently if notion_projects_db_id isn't set).
        if (newId && window.notionWriteback) {
          const page = await window.notionWriteback.createProjectPage({
            name: draft.name.trim(),
            pillar: draft.pillar || null,
            outcome: draft.dod || null,
            due_date: dateFromPick(draft.due),
            status: 'active',
          });
          if (page && page.url) {
            window.db.update('course_projects', newId, { notion_url: page.url }).catch(() => {});
          }
        }
        if (reloadData) await reloadData();
        if (newId) onOpenProject(newId);
        return;
      } else if (draft.kind === 'task') {
        const taskStatus = taskStatusToSchema(draft.status);
        const taskDoDate = dateFromPick(draft.date);
        const inserted = await window.db.insert('course_tasks', {
          title: draft.label.trim(),
          project_id: draft.projectId || null,
          pillar: draft.projectId ? null : (draft.pillar || null),
          status: taskStatus,
          do_date: taskDoDate,
          effort: draft.estimate ? `${draft.estimate}m`.replace('60m', '1h') : null,
          work_type: draft.workType || null,
        });
        const newTaskId = inserted && inserted[0] && inserted[0].id;
        if (newTaskId && window.notionWriteback) {
          const projectNotionUrl = draft.projectId && window.PROJECTS[draft.projectId]
            ? window.PROJECTS[draft.projectId].notionUrl
            : null;
          const page = await window.notionWriteback.createTaskPage({
            title: draft.label.trim(),
            status: taskStatus,
            do_date: taskDoDate,
            projectNotionUrl,
          });
          if (page && page.url) {
            window.db.update('course_tasks', newTaskId, { notion_url: page.url }).catch(() => {});
          }
        }
      } else if (draft.kind === 'note') {
        await window.db.insert('course_captures', {
          raw_text: draft.text.trim(),
          suggested_project_id: draft.projectId || null,
          pillar: draft.pillar || null,
          status: 'pending',
        });
      }
      if (reloadData) await reloadData();
    } catch (err) {
      console.error('Capture save failed', err);
      showCaptureToast('Save failed', err.message || 'Try again');
    }
  };

  const handleCapture = async (kind) => {
    const text = captureText.trim();
    setCaptureMenuOpen(false);
    if (kind === 'freeform') {
      if (!text) {
        showCaptureToast('Nothing to capture', 'Type a thought first');
        return;
      }
      setCaptureBusy(true);
      try {
        // Build a project context list so Claude can pick the related project
        // when the capture classifies as a task. Active + idea projects only.
        const candidates = Object.values(window.PROJECTS || {})
          .filter((p) => p.status === 'active' || p.status === 'idea')
          .map((p) => `- ${p.id}: ${p.name}${p.pillarLabel ? ' (' + p.pillarLabel + ')' : ''}`)
          .join('\n');

        const raw = await window.claude.complete({
          messages: [{
            role: 'user',
            content:
`Classify the following capture into ONE of: project (a new initiative with multiple steps), task (one concrete action), or note (a thought, reference, or reminder).

If the capture is a task OR a note AND it clearly references one of the existing projects below, return that project's id in \`projectId\`. If no project is a clear fit, omit \`projectId\` (do NOT guess).

Existing projects:
${candidates || '(none)'}

Return ONLY JSON: { "kind": "project"|"task"|"note", "label": "<short clean title under 60 chars>", "projectId": "<uuid or omit>" }

Capture:
${text}`,
          }],
        });
        let parsed = null;
        try {
          const m = raw.match(/\{[\s\S]*\}/);
          parsed = JSON.parse(m ? m[0] : raw);
        } catch (e) { parsed = null; }
        const finalKind = parsed && ['project','task','note'].includes(parsed.kind) ? parsed.kind : 'note';
        const label = (parsed && parsed.label) || text;
        const suggestedProjectId =
          (finalKind === 'task' || finalKind === 'note')
          && parsed && parsed.projectId && window.PROJECTS[parsed.projectId]
            ? parsed.projectId
            : null;
        openCaptureSheet(finalKind, label, true, suggestedProjectId);
      } catch (e) {
        openCaptureSheet('note', text, false);
      } finally {
        setCaptureBusy(false);
      }
    } else {
      openCaptureSheet(kind, text, false);
    }
  };
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // Track per-project status so rule chips can actually move things.
  // 'active' (default), 'idea', or 'dropped' (hidden).
  const statusOf = (id) => projStatus[id] || 'active';
  const moveProj = (id, status, pillarId) => {
    setProjStatus(s => ({ ...s, [id]: status }));
    setDismissed(d => ({ ...d, [`rule:${id}`]: true }));
    if (status === 'idea' && pillarId) {
      setIdeasOpen(s => ({ ...s, [`${pillarId}-ideas`]: true }));
    }
  };
  // Tasks: done-state and metadata persisted above.
  
  const togglePillar = (id) => setCollapsed(s => ({ ...s, [id]: !s[id] }));
  const toggleIdeas = (id) => setIdeasOpen(s => ({ ...s, [id]: !s[id] }));
  const dismiss = (id) => setDismissed(s => ({ ...s, [id]: true }));
  const resolveQueue = async (id, action) => {
    setQueueResolved((s) => ({ ...s, [id]: action }));
    try {
      if (action === 'kept') {
        // Reset the stall clock by bumping last_activity_at to now.
        await window.db.update('course_projects', id, { last_activity_at: new Date().toISOString() });
      } else if (action === 'idea' || action === 'paused' || action === 'archived') {
        await window.db.update('course_projects', id, { status: action });
        const proj = window.PROJECTS && window.PROJECTS[id];
        if (proj && proj.notionUrl && window.notionWriteback) {
          window.notionWriteback.projectStatus(proj.notionUrl, action);
        }
      }
      if (reloadData) reloadData();
    } catch (err) {
      console.error('Queue resolve failed', err);
      setQueueResolved((s) => { const next = { ...s }; delete next[id]; return next; });
    }
  };
  const toggleTask = (id, e) => {
    e && e.stopPropagation();
    const next = !taskDone[id];
    setTaskDone(s => ({ ...s, [id]: next }));
    const today = new Date().toISOString().slice(0, 10);
    window.db.update('course_tasks', id, {
      status: next ? 'done' : 'next',
      completed_date: next ? today : null,
    }).catch((err) => {
      console.error('Task update failed', err);
      setTaskDone(s => ({ ...s, [id]: !next })); // revert optimistic
    });
    // Best-effort Notion mirror — find task across projects, then pillar tasks.
    let taskNotionUrl = null;
    for (const p of Object.values(window.PROJECTS || {})) {
      const t = (p.initialTasks || []).find((x) => x.id === id);
      if (t) { taskNotionUrl = t.notionUrl; break; }
    }
    if (!taskNotionUrl) {
      for (const arr of Object.values(window.PILLAR_TASKS || {})) {
        const t = arr.find((x) => x.id === id);
        if (t) { taskNotionUrl = t.notionUrl; break; }
      }
    }
    if (taskNotionUrl && window.notionWriteback) {
      window.notionWriteback.taskStatus(taskNotionUrl, next ? 'done' : 'next');
    }
  };
  const openSheet = (id) => setSheetTaskId(id);
  const saveSheet = (draft) => {
    if (!sheetTaskId) return;
    setTaskMeta(m => ({ ...m, [sheetTaskId]: draft }));
    if (draft.status === 'done' && !taskDone[sheetTaskId]) {
      setTaskDone(s => ({ ...s, [sheetTaskId]: true }));
    } else if (draft.status !== 'done' && taskDone[sheetTaskId]) {
      setTaskDone(s => ({ ...s, [sheetTaskId]: false }));
    }
    setSheetTaskId(null);
  };

  // Task row helper — clicking the row toggles done. Long-press opens the sheet.
  const TaskRow = ({ id, label, extra, due }) => {
    const meta = taskMeta[id];
    const lp = useLongPress(() => openSheet(id));
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return (
      <div
        className={`task ${taskDone[id] ? 'done' : ''}`}
        data-task-id={id}
        onClick={(e) => { if (!lp.didFire()) toggleTask(id, e); }}
        {...lp.bind}
      >
        <span className="box"></span>
        <span className="label">{label}</span>
        {meta?.kind && <span className={`task-kind k-${meta.kind}`}>{meta.kind}</span>}
        {meta?.estimate && <span className="task-est tnum">{meta.estimate}m</span>}
        {meta?.date
          ? <span className="tdue tnum">{MONTHS[meta.date.m]} {meta.date.d}</span>
          : due && <span className="tdue tnum">{due}</span>}
        {extra}
      </div>
    );
  };

  // Pending Decisions queue — active projects with no last_activity_at update
  // for N days. Surfaces stalls so they can be re-routed or revived.
  const STALL_DAYS = 14;
  const stallThreshold = Date.now() - STALL_DAYS * 86400000;
  const queueItems = Object.values(window.PROJECTS || {})
    .filter((p) => p.status === 'active' && p.lastActivityAt && new Date(p.lastActivityAt).getTime() < stallThreshold)
    .sort((a, b) => new Date(a.lastActivityAt) - new Date(b.lastActivityAt))
    .slice(0, 6)
    .map((p) => {
      const days = Math.max(STALL_DAYS, Math.floor((Date.now() - new Date(p.lastActivityAt)) / 86400000));
      const pillarLabel = PILLAR_DISPLAY[p.pillar] || (p.pillar ? p.pillar : 'Unfiled');
      return {
        id: p.id,
        proj: `${pillarLabel} · ${p.name}`,
        text: `No work logged in ${days} days.`,
        actions: [
          { label: 'Move to Idea',    kind: 'primary', resolve: 'idea' },
          { label: 'Move to On hold', kind: '',        resolve: 'paused' },
          { label: 'Keep active',     kind: 'ghost',   resolve: 'kept' },
        ],
      };
    });

  const visibleQueue = queueItems.filter(q => !queueResolved[q.id]);

  return (
    <div className="screen" data-screen-label="01 Triage">
      <header className="head">
        <div className="head-row">
          <div>
            <div className="head-title">Course</div>
            <div className="head-sub">Triage</div>
          </div>
          <div className="head-icons">
            <button className="icon-btn" aria-label="Search" onClick={() => setOverlay('search')}><Icon.Search /></button>
            <button className="icon-btn" aria-label="Tasks" onClick={() => setOverlay('inbox')}>
              <Icon.Inbox />
              {pendingInboxCount > 0 && <span className="nb tnum">{pendingInboxCount}</span>}
            </button>
            <button className="icon-btn" aria-label="Menu" onClick={() => setOverlay('menu')}><Icon.Menu /></button>
          </div>
        </div>
      </header>

      <div className="body">

        {showQueue && visibleQueue.length > 0 && (
          <div className="queue">
            <div className="queue-card">
              <div className="queue-head">
                <Icon.Sparkle />
                <span className="label">Pending decisions</span>
                <span className="count tnum">{visibleQueue.length}</span>
              </div>

              {visibleQueue.map((q) => (
                <div className="queue-item" key={q.id}>
                  <span className="bullet"></span>
                  <div className="qbody">
                    <div className="qproj">{q.proj}</div>
                    <div className="qtext">{q.text}</div>
                    <div className="rule-actions">
                      {q.actions.map((a, i) => (
                        <span
                          key={i}
                          className={`chip ${a.kind} ${a.calendar && calendarFor === q.id ? 'on' : ''}`}
                          style={a.calendar ? { position: 'relative' } : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (a.calendar) {
                              setCalendarFor(c => c === q.id ? null : q.id);
                            } else {
                              resolveQueue(q.id, a.resolve);
                            }
                          }}
                        >
                          {a.label}
                        </span>
                      ))}
                    </div>
                    {calendarFor === q.id && (
                      <div className="queue-cal">
                        <MiniCalendar
                          onPick={(pick) => {
                            setCalendarFor(null);
                            resolveQueue(q.id, `rescheduled:${MONTHS[pick.m]} ${pick.d}`);
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(() => {
          // Group live projects (from window.PROJECTS, loaded by App on mount)
          // by pillar, then by Triage bucket within each pillar. Apply local
          // projStatus overrides so the user's in-session moves take effect.
          const all = Object.values(window.PROJECTS || {});
          const grouped = {}; // { pillarId: { active: [], onhold: [], idea: [] } }
          for (const p of all) {
            const override = projStatus[p.id];
            const bucket = bucketFor(override || p.status);
            if (bucket === 'hidden') continue;
            const pid = p.pillar || 'unfiled';
            const g = grouped[pid] || (grouped[pid] = { active: [], onhold: [], idea: [] });
            g[bucket].push(p);
          }

          // Loose pillar tasks (project-less, pillar-tagged). Group them so they
          // render at the bottom of each pillar; pillars that have only loose
          // tasks (no projects) still get a section.
          const pillarTasksMap = window.PILLAR_TASKS || {};
          const openPillarTasksFor = (pid) =>
            (pillarTasksMap[pid] || []).filter((t) => !t.done && t.rawStatus !== 'dropped');
          for (const pid of Object.keys(pillarTasksMap)) {
            if (openPillarTasksFor(pid).length > 0 && !grouped[pid]) {
              grouped[pid] = { active: [], onhold: [], idea: [] };
            }
          }

          // Active projects within each pillar sort by sort_order ascending
          // (nulls last, then last_activity_at desc for stability).
          for (const pid of Object.keys(grouped)) {
            grouped[pid].active.sort((a, b) => {
              const ao = a.sortOrder == null ? Infinity : a.sortOrder;
              const bo = b.sortOrder == null ? Infinity : b.sortOrder;
              if (ao !== bo) return ao - bo;
              const at = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
              const bt = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
              return bt - at;
            });
          }

          // Stable pillar order: known pillars first, then anything else by name.
          const knownOrder = ['arrow', 'sunny', 'side', 'life'];
          const pillarIds = Object.keys(grouped).sort((a, b) => {
            const ia = knownOrder.indexOf(a), ib = knownOrder.indexOf(b);
            if (ia === -1 && ib === -1) return a.localeCompare(b);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
          });

          const renderTaskRows = (proj) => {
            const open = (proj.initialTasks || []).filter((t) => !t.done).slice(0, 3);
            if (open.length === 0) return null;
            return (
              <div className="tasks">
                {open.map((t) => {
                  const extra = t.next
                    ? <span className="next">next</span>
                    : t.waiting
                      ? <span className="waiting">waiting{typeof t.waiting === 'string' ? <> · <span className="waiting-who">{t.waiting}</span></> : null}</span>
                      : null;
                  return <TaskRow key={t.id} id={t.id} label={t.label} due={t.due} extra={extra} />;
                })}
              </div>
            );
          };

          const QUICK_PILLARS = [
            { id: 'arrow', short: 'Arrow' },
            { id: 'sunny', short: 'Sunny' },
            { id: 'side',  short: 'Side' },
            { id: 'life',  short: 'Life' },
          ];
          const quickAssignPillar = (projectId, pillarId) => {
            window.db.update('course_projects', projectId, { pillar: pillarId }).then(() => {
              if (reloadData) reloadData();
            }).catch((err) => console.error('Quick pillar assign failed', err));
          };
          const renderProjectCard = (proj) => (
            <div className="proj" key={proj.id} onClick={() => onOpenProject(proj.id)}>
              <div className="proj-head">
                <span className="proj-name">{proj.name}</span>
                {proj.tag && <span className="proj-tag">{proj.tag}</span>}
              </div>
              {renderTaskRows(proj)}
              {!proj.pillar && (
                <div className="proj-quick-pillar" onClick={(e) => e.stopPropagation()}>
                  <span className="proj-quick-pillar-label">File to</span>
                  {QUICK_PILLARS.map((p) => (
                    <span
                      key={p.id}
                      className="proj-quick-pillar-chip"
                      onClick={() => quickAssignPillar(proj.id, p.id)}
                    >
                      <PillarDot pillar={p.id} size={6} />
                      {p.short}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );

          const renderOnHoldCard = (proj) => {
            const latestNote = proj.statusSeed && proj.statusSeed[0];
            const reason = latestNote ? (latestNote.summary || latestNote.body) : proj.notes;
            return (
              <div className="onhold" key={proj.id} onClick={() => onOpenProject(proj.id)} style={{ cursor: 'pointer' }}>
                <div className="proj-head">
                  <span className="proj-name">{proj.name}</span>
                  {proj.tag && <span className="proj-tag">{proj.tag}</span>}
                </div>
                {reason && (
                  <div className="onhold-meta">
                    <div className="reason">{String(reason).slice(0, 160)}</div>
                  </div>
                )}
              </div>
            );
          };

          const ideaAge = (proj) => {
            if (!proj.lastActivityAt) return '';
            const days = Math.floor((Date.now() - new Date(proj.lastActivityAt)) / 86400000);
            if (days < 1) return 'today';
            if (days < 7) return `${days}d`;
            if (days < 30) return `${Math.floor(days / 7)}w`;
            if (days < 365) return `${Math.floor(days / 30)}mo`;
            return `${Math.floor(days / 365)}y`;
          };

          return pillarIds.map((pid) => {
            const g = grouped[pid];
            const counts = [];
            if (g.active.length)  counts.push(`${g.active.length} active`);
            if (g.onhold.length)  counts.push(`${g.onhold.length} hold`);
            if (g.idea.length)    counts.push(`${g.idea.length} ideas`);
            const ideasKey = `${pid}-ideas`;
            return (
              <div key={pid} className={`pillar ${collapsed[pid] ? 'collapsed' : ''}`}>
                <div className="pillar-head" onClick={() => togglePillar(pid)}>
                  <span className="chev"><Icon.Chevron /></span>
                  <PillarDot pillar={pid} />
                  <span className="pillar-name">{pillarDisplayName(pid)}</span>
                  <span className="pillar-counts tnum">{counts.join(' · ') || '—'}</span>
                </div>
                <div className="pillar-body">
                  {g.active.length > 0 && <SubLabel>Active</SubLabel>}
                  <div className="proj-active-list" ref={setActiveListRef(pid)}>
                    {g.active.map(renderProjectCard)}
                  </div>

                  {g.onhold.length > 0 && (
                    <SubLabel right={String(g.onhold.length)}>On hold</SubLabel>
                  )}
                  {g.onhold.map(renderOnHoldCard)}

                  {g.idea.length > 0 && (
                    <>
                      <div className="ideas-toggle" onClick={() => toggleIdeas(ideasKey)}>
                        <span className="chev" style={{ transform: ideasOpen[ideasKey] ? 'rotate(90deg)' : 'rotate(0deg)' }}><Icon.Chevron /></span>
                        <span>Ideas ({g.idea.length})</span>
                      </div>
                      <div className={`ideas-list ${ideasOpen[ideasKey] ? 'open' : ''}`}>
                        <div className="ideas-inner">
                          {g.idea.map((proj) => (
                            <div className="idea-row" key={proj.id} onClick={() => onOpenProject(proj.id)}>
                              <span className="idot"></span>
                              {proj.name}
                              <span className="iage tnum">{ideaAge(proj)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {addingIdeaFor === pid ? (
                    <div className="add-task adding">
                      <span className="plus-mini">+</span>
                      <input
                        autoFocus
                        value={ideaText}
                        onChange={(e) => setIdeaText(e.target.value)}
                        onBlur={() => commitNewIdea(pid)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitNewIdea(pid);
                          if (e.key === 'Escape') { setIdeaText(''); setAddingIdeaFor(null); }
                        }}
                        placeholder="New idea…"
                      />
                    </div>
                  ) : (
                    <div className="add-task" onClick={() => setAddingIdeaFor(pid)}>
                      <span className="plus-mini">+</span>
                      <span>New idea</span>
                    </div>
                  )}

                  {(() => {
                    const ptasks = openPillarTasksFor(pid);
                    const adding = addingTaskFor === pid;
                    if (ptasks.length === 0 && !adding) return null;
                    return (
                      <>
                        {ptasks.length > 0 && <SubLabel right={String(ptasks.length)}>Tasks</SubLabel>}
                        <div className="pillar-tasks">
                          {ptasks.map((t) => {
                            const extra = t.next
                              ? <span className="next">next</span>
                              : t.waiting
                                ? <span className="waiting">waiting{typeof t.waiting === 'string' ? <> · <span className="waiting-who">{t.waiting}</span></> : null}</span>
                                : null;
                            return <TaskRow key={t.id} id={t.id} label={t.label} due={t.due} extra={extra} />;
                          })}
                          {adding ? (
                            <div className="add-task adding">
                              <span className="plus-mini">+</span>
                              <input
                                autoFocus
                                value={newTaskText}
                                onChange={(e) => setNewTaskText(e.target.value)}
                                onBlur={() => commitNewTask(pid)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitNewTask(pid);
                                  if (e.key === 'Escape') { setNewTaskText(''); setAddingTaskFor(null); }
                                }}
                                placeholder="New task…"
                              />
                            </div>
                          ) : (
                            <div className="add-task" onClick={() => setAddingTaskFor(pid)}>
                              <span className="plus-mini">+</span>
                              <span>Add task</span>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          });
        })()}


        <div style={{ height: 80 }}></div>
      </div>

      {/* Floating Plus FAB — always visible */}
      <div className="capture">
        <button
          className={`plus ${captureMenuOpen ? 'open' : ''}`}
          aria-label="Capture"
          onClick={() => setCaptureMenuOpen(v => !v)}
          disabled={captureBusy}
        >
          {captureBusy ? <Icon.Sparkle /> : <Icon.Plus />}
        </button>
        {captureMenuOpen && (
          <>
            <div className="capture-scrim" onClick={() => setCaptureMenuOpen(false)}></div>
            <div className="capture-menu" role="menu">
              <div className="capture-menu-input">
                <input
                  type="text"
                  placeholder="Capture a thought…"
                  value={captureText}
                  autoFocus
                  onChange={(e) => setCaptureText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && captureText.trim()) handleCapture('freeform');
                    if (e.key === 'Escape') setCaptureMenuOpen(false);
                  }}
                />
              </div>
              <div className="capture-menu-hint">
                {captureText.trim()
                  ? <>File <span className="capture-menu-quote">"{captureText.trim().slice(0,32)}{captureText.trim().length>32?'…':''}"</span> as…</>
                  : <>What are you capturing?</>}
              </div>
              <button className="capture-opt" onClick={() => handleCapture('project')}>
                <span className="capture-opt-icon proj"><span className="dot" style={{ background: 'var(--accent)' }}></span></span>
                <span className="capture-opt-body">
                  <span className="capture-opt-label">Project</span>
                  <span className="capture-opt-sub">A new initiative with steps</span>
                </span>
              </button>
              <button className="capture-opt" onClick={() => handleCapture('task')}>
                <span className="capture-opt-icon task"><span className="check"></span></span>
                <span className="capture-opt-body">
                  <span className="capture-opt-label">Task</span>
                  <span className="capture-opt-sub">One concrete action</span>
                </span>
              </button>
              <button className="capture-opt" onClick={() => handleCapture('note')}>
                <span className="capture-opt-icon note"><Icon.Inbox /></span>
                <span className="capture-opt-body">
                  <span className="capture-opt-label">Note</span>
                  <span className="capture-opt-sub">File to Inbox — triage later</span>
                </span>
              </button>
              <div className="capture-divider"></div>
              <button className="capture-opt freeform" onClick={() => handleCapture('freeform')}>
                <span className="capture-opt-icon ai"><Icon.Sparkle /></span>
                <span className="capture-opt-body">
                  <span className="capture-opt-label">Free form <span className="ai-tag">AI</span></span>
                  <span className="capture-opt-sub">Let Course sort it out</span>
                </span>
              </button>
            </div>
          </>
        )}
      </div>
      {captureToast && (
        <div className="capture-toast">
          <span className="capture-toast-dot"></span>
          <div>
            <div className="capture-toast-label">{captureToast.label}</div>
            {captureToast.hint && <div className="capture-toast-hint">{captureToast.hint}</div>}
          </div>
        </div>
      )}
      {captureSheet && (
        <CaptureSheet
          kind={captureSheet.kind}
          initialText={captureSheet.text}
          aiClassified={captureSheet.aiClassified}
          suggestedProjectId={captureSheet.suggestedProjectId}
          onClose={() => setCaptureSheet(null)}
          onSave={saveCapture}
        />
      )}

      {sheetTaskId && (
        <TaskSheet
          task={{
            label: (() => {
              const node = document.querySelector(`[data-task-id="${sheetTaskId}"] .label`);
              return node ? node.textContent : '';
            })(),
            done: !!taskDone[sheetTaskId],
            ...(taskMeta[sheetTaskId] || {}),
          }}
          onClose={() => setSheetTaskId(null)}
          onSave={saveSheet}
        />
      )}

      {overlay === 'search' && (
        <SearchOverlay onClose={() => setOverlay(null)} onOpenProject={onOpenProject} />
      )}
      {overlay === 'inbox' && (
        <InboxOverlay onClose={() => setOverlay(null)} onOpenProject={onOpenProject} reloadData={reloadData} />
      )}
      {overlay === 'settings' && (
        <SettingsSheet onClose={() => setOverlay(null)} />
      )}
      {overlay === 'menu' && (
        <MenuDrawer
          onClose={() => setOverlay(null)}
          onOpenProject={onOpenProject}
          currentScreen="triage"
          onGoto={(s) => {
            if (s === 'inbox') setOverlay('inbox');
            else if (s === 'settings') setOverlay('settings');
            else if (s === 'today' && onChangeScreen) onChangeScreen('today');
          }}
          pendingInboxCount={pendingInboxCount}
        />
      )}
    </div>
  );
}

window.Triage = Triage;
