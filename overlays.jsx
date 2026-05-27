// Header-icon overlays for Triage: Search, Inbox, Menu.
// Mounted inside the iOS frame; styled to slide/fade in.

/* ─────────────────────────────────────────
   Search overlay — fuzzy-match over projects,
   tasks, and ideas in window.PROJECTS.
   ───────────────────────────────────────── */
function SearchOverlay({ onClose, onOpenProject }) {
  const [q, setQ] = React.useState('');
  const lower = q.trim().toLowerCase();

  // Flatten projects into searchable rows.
  const results = React.useMemo(() => {
    if (!window.PROJECTS) return { projects: [], tasks: [], ideas: [] };
    const projects = [], tasks = [], ideas = [];
    Object.entries(window.PROJECTS).forEach(([id, p]) => {
      // (legacy prototype filter removed — all real Supabase projects pass through)
      const haystack = [p.name, p.pillarLabel, p.latest, p.dod].filter(Boolean).join(' ').toLowerCase();
      const matchesProject = !lower || haystack.includes(lower);
      if (matchesProject) {
        (p.status === 'idea' ? ideas : projects).push({ id, ...p });
      }
      (p.initialTasks || []).forEach((t, ti) => {
        const tHay = (t.label || '').toLowerCase();
        if (lower && tHay.includes(lower)) {
          tasks.push({ id: `${id}:${t.id || ti}`, projectId: id, projectName: p.name, label: t.label });
        }
      });
    });
    return { projects, tasks, ideas };
  }, [lower]);

  const total = results.projects.length + results.tasks.length + results.ideas.length;

  // Focus input on mount
  const ref = React.useRef(null);
  React.useEffect(() => { ref.current && ref.current.focus(); }, []);
  React.useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const open = (id) => { onOpenProject(id); onClose(); };

  return (
    <div className="overlay-screen">
      <div className="overlay-head">
        <div className="search-field">
          <Icon.Search />
          <input
            ref={ref}
            placeholder="Search projects, tasks, ideas…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && <span className="search-clear" onClick={() => setQ('')}>×</span>}
        </div>
        <span className="overlay-cancel" onClick={onClose}>Cancel</span>
      </div>

      <div className="overlay-body">
        {!lower && (
          <div className="overlay-empty">
            <div className="overlay-empty-title">Search Course</div>
            <div className="overlay-empty-hint">Across projects, tasks, and ideas. Try a project name, a person, or a phrase from a riff.</div>
          </div>
        )}

        {lower && total === 0 && (
          <div className="overlay-empty">
            <div className="overlay-empty-title">Nothing matches "{q}"</div>
            <div className="overlay-empty-hint">Capture it instead?</div>
            <div className="overlay-empty-action">
              <span className="chip primary" onClick={onClose}>+ Capture "{q}"</span>
            </div>
          </div>
        )}

        {results.projects.length > 0 && (
          <div className="result-group">
            <div className="result-label">Projects · {results.projects.length}</div>
            {results.projects.map(p => (
              <div className="result-row" key={p.id} onClick={() => open(p.id)}>
                <PillarDot pillar={p.pillar} />
                <span className="result-name">{p.name}</span>
                <span className="result-meta">{p.pillarLabel}</span>
              </div>
            ))}
          </div>
        )}

        {results.tasks.length > 0 && (
          <div className="result-group">
            <div className="result-label">Tasks · {results.tasks.length}</div>
            {results.tasks.map(t => (
              <div className="result-row" key={t.id} onClick={() => open(t.projectId)}>
                <span className="result-icon">
                  <svg viewBox="0 0 24 24" style={{width:13,height:13,stroke:'currentColor',fill:'none',strokeWidth:1.8}}><rect x="3" y="3" width="18" height="18" rx="4"/></svg>
                </span>
                <span className="result-name">{t.label}</span>
                <span className="result-meta">{t.projectName}</span>
              </div>
            ))}
          </div>
        )}

        {results.ideas.length > 0 && (
          <div className="result-group">
            <div className="result-label">Ideas · {results.ideas.length}</div>
            {results.ideas.map(p => (
              <div className="result-row" key={p.id} onClick={() => open(p.id)}>
                <span className="result-icon"><span className="idot" style={{width:6, height:6, background:'var(--text-faint)'}}></span></span>
                <span className="result-name">{p.name}</span>
                <span className="result-meta">{p.pillarLabel}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Inbox — unscoped clearing queue.
   Each captured note can be assigned to a project,
   pushed to Reminders, or dropped.
   ───────────────────────────────────────── */
function InboxOverlay({ onClose, onOpenProject, reloadData }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [assigning, setAssigning] = React.useState(null); // item id with picker open
  const [justAssigned, setJustAssigned] = React.useState(null); // {id, projectName} for toast
  const toastTimer = React.useRef(null);

  const ageLabel = (iso) => {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  const loadCaptures = React.useCallback(async () => {
    setLoading(true);
    try {
      const rows = await window.db.select('course_captures', 'select=*&status=eq.pending&order=created_at.desc');
      setItems(rows.map((r) => ({
        id: r.id,
        text: r.raw_text,
        age: ageLabel(r.created_at),
        suggestedProjectId: r.suggested_project_id,
      })));
    } catch (err) {
      console.error('Inbox load failed', err);
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => { loadCaptures(); }, [loadCaptures]);

  const removeLocal = (id) => setItems(arr => arr.filter(x => x.id !== id));

  const dropItem = async (id) => {
    removeLocal(id);
    try { await window.db.update('course_captures', id, { status: 'dismissed', processed_at: new Date().toISOString() }); }
    catch (err) { console.error('Drop failed', err); loadCaptures(); }
  };

  const pushToReminders = async (item) => {
    // Same shortcut + pipe format as the TaskSheet's push.
    const projectName = item.suggestedProjectId && window.PROJECTS && window.PROJECTS[item.suggestedProjectId]
      ? window.PROJECTS[item.suggestedProjectId].name
      : '';
    const input = [item.text, '', projectName, ''].join('|');
    const url = `shortcuts://run-shortcut?name=CourseAddReminder&input=text&text=${encodeURIComponent(input)}`;
    window.location.href = url;
    removeLocal(item.id);
    try { await window.db.update('course_captures', item.id, { status: 'processed', processed_at: new Date().toISOString() }); }
    catch (err) { console.error('Push to Reminders mark-processed failed', err); }
  };

  const assignTo = async (captureId, projectId, projectName, captureText) => {
    setAssigning(null);
    removeLocal(captureId);
    setJustAssigned({ id: captureId, projectName });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setJustAssigned(null), 2200);
    try {
      // Create a task on the target project, then mark the capture processed.
      await window.db.insert('course_tasks', {
        project_id: projectId,
        title: captureText,
        status: 'next',
      });
      await window.db.update('course_captures', captureId, {
        status: 'processed',
        suggested_project_id: projectId,
        processed_at: new Date().toISOString(),
      });
      if (reloadData) reloadData();
    } catch (err) {
      console.error('Assign failed', err);
      loadCaptures(); // restore the item on failure
    }
  };

  React.useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const projectChoices = window.PROJECTS
    ? Object.entries(window.PROJECTS)
        .filter(([id, p]) => p.status !== 'idea' && p.status !== 'archived' && p.status !== 'done')
        .map(([id, p]) => ({ id, name: p.name, pillar: p.pillar, label: p.pillarLabel }))
    : [];

  React.useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="overlay-screen">
      <div className="overlay-head">
        <div className="overlay-title">
          <span>Inbox</span>
          <span className="overlay-count tnum">{items.length}</span>
        </div>
        <span className="overlay-cancel" onClick={onClose}>Done</span>
      </div>

      <div className="overlay-body">
        {loading ? (
          <div className="overlay-empty"><div className="overlay-empty-hint">Loading…</div></div>
        ) : items.length === 0 ? (
          <div className="overlay-empty">
            <div className="overlay-empty-title">All caught up</div>
            <div className="overlay-empty-hint">No unscoped captures.</div>
          </div>
        ) : (
          <>
            <div className="overlay-hint">
              Each one belongs somewhere. Send it home.
            </div>
            {items.map(it => {
              const suggested = it.suggestedProjectId
                ? projectChoices.find((p) => p.id === it.suggestedProjectId)
                : null;
              return (
                <div className="inbox-item" key={it.id}>
                  <div className="inbox-text">{it.text}</div>
                  <div className="inbox-meta tnum">
                    {it.age}
                    {suggested && <> · <span style={{ color: 'var(--accent)' }}>AI: {suggested.name}</span></>}
                  </div>
                  <div className="inbox-actions">
                    {suggested && (
                      <span
                        className="chip primary"
                        onClick={() => assignTo(it.id, suggested.id, suggested.name, it.text)}
                      >Accept → {suggested.name.slice(0, 22)}{suggested.name.length > 22 ? '…' : ''}</span>
                    )}
                    <span
                      className={`chip ${suggested ? '' : 'primary'}`}
                      onClick={() => setAssigning(assigning === it.id ? null : it.id)}
                    >
                      {suggested ? 'Pick different' : 'Assign to project'}
                    </span>
                    <span className="chip" onClick={() => pushToReminders(it)}>↗ Reminders</span>
                    <span className="chip ghost" onClick={() => dropItem(it.id)}>Drop</span>
                  </div>
                  {assigning === it.id && (
                    <div className="inbox-picker">
                      {projectChoices.map(p => (
                        <div
                          className="inbox-pick"
                          key={p.id}
                          onClick={() => assignTo(it.id, p.id, p.name, it.text)}
                        >
                          <PillarDot pillar={p.pillar} size={6} />
                          <span className="inbox-pick-name">{p.name}</span>
                          <span className="inbox-pick-tag">{p.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Menu drawer — app sections + settings.
   Slides in from the left.
   ───────────────────────────────────────── */
function MenuDrawer({ onClose, onOpenProject, currentScreen, onGoto, pendingInboxCount = 0 }) {
  React.useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Group projects by pillar for the menu.
  const pillarOrder = ['arrow', 'sunny', 'side', 'life'];
  const pillarNames = { arrow: 'Arrow', sunny: 'Slow Down Sunny', side: 'Side Gigs', life: 'Life' };
  const grouped = {};
  Object.entries(window.PROJECTS || {}).forEach(([id, p]) => {
    if (p.status === 'active' || p.status === 'paused' || p.status === 'routine') {
      const key = p.pillar || 'unfiled';
      (grouped[key] = grouped[key] || []).push({ id, ...p });
    }
  });
  const allPillarIds = [...pillarOrder, 'unfiled'].filter((pid) => grouped[pid]);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="drawer-title">Course</div>
          <div className="drawer-sub">May 23 · Saturday</div>
        </div>

        <div className="drawer-section">
          <div className="drawer-row on" onClick={() => { onGoto('triage'); onClose(); }}>
            <span className="drawer-icon"><Icon.Inbox /></span>
            <span className="drawer-label">Triage</span>
            <span className="drawer-kbd">⌘1</span>
          </div>
          <div className="drawer-row" onClick={() => { onGoto('inbox'); onClose(); }}>
            <span className="drawer-icon">
              <svg className="i" viewBox="0 0 24 24"><path d="M22 12c0 5.5-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2c4 0 7.4 2.3 9 5.7"/><path d="M22 4v6h-6"/></svg>
            </span>
            <span className="drawer-label">Inbox</span>
            {pendingInboxCount > 0 && <span className="drawer-count tnum">{pendingInboxCount}</span>}
          </div>
          <div className="drawer-row" onClick={() => { onGoto('today'); onClose(); }}>
            <span className="drawer-icon">
              <svg className="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            </span>
            <span className="drawer-label">Today</span>
          </div>
          <div className="drawer-row" onClick={() => { onGoto('today'); onClose(); }}>
            <span className="drawer-icon">
              <svg className="i" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>
            </span>
            <span className="drawer-label">This week</span>
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-section-label">Pillars</div>
          {allPillarIds.map(pid => (
            <div key={pid} className="drawer-pillar">
              <div className="drawer-pillar-head">
                <PillarDot pillar={pid === 'unfiled' ? null : pid} />
                <span className="drawer-pillar-name">{pillarNames[pid] || 'Unfiled'}</span>
                <span className="drawer-count tnum">{grouped[pid].length}</span>
              </div>
              {grouped[pid].map(p => (
                <div
                  key={p.id}
                  className="drawer-proj"
                  onClick={() => { onOpenProject(p.id); onClose(); }}
                >
                  <span className="drawer-proj-name">{p.name}</span>
                  {p.status === 'paused' && <span className="drawer-proj-tag">hold</span>}
                  {p.status === 'routine' && <span className="drawer-proj-tag">routine</span>}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="drawer-section">
          <div className="drawer-section-label">Other</div>
          <div className="drawer-row" onClick={onClose}>
            <span className="drawer-icon">
              <svg className="i" viewBox="0 0 24 24"><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/><circle cx="12" cy="12" r="4"/></svg>
            </span>
            <span className="drawer-label">Theme</span>
            <span className="drawer-meta">Use Tweaks</span>
          </div>
          <div className="drawer-row" onClick={() => { onGoto('settings'); onClose(); }}>
            <span className="drawer-icon"><Icon.Settings /></span>
            <span className="drawer-label">Settings</span>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SearchOverlay, InboxOverlay, MenuDrawer });
