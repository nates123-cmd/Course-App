// Today — flat task list across all projects: overdue, due today, next-flagged.
// Tap a task to toggle done. Tap a project chip to open that project.

function Today({ onOpenProject, onBack, reloadData }) {
  const today = React.useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const todayLabel = React.useMemo(() => {
    const d = new Date();
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${days[d.getDay()]} · ${months[d.getMonth()]} ${d.getDate()}`;
  }, []);

  // Walk all projects, flatten tasks, tag each with its project.
  const allTasks = [];
  for (const p of Object.values(window.PROJECTS || {})) {
    for (const t of (p.initialTasks || [])) {
      if (t.done) continue;
      allTasks.push({ ...t, projectId: p.id, projectName: p.name, projectPillar: p.pillar });
    }
  }
  const overdue = allTasks.filter((t) => t.due && t.due < today).sort((a, b) => a.due.localeCompare(b.due));
  const cutoff = React.useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  const recentOverdue = overdue.filter((t) => t.due >= cutoff);
  const olderOverdue = overdue.filter((t) => t.due < cutoff);
  const [showAllOverdue, setShowAllOverdue] = React.useState(false);
  const visibleOverdue = showAllOverdue ? overdue : recentOverdue;
  const dueToday = allTasks.filter((t) => t.due === today);

  // Group upcoming (next 7 days, excluding today) by date.
  const weekDays = React.useMemo(() => {
    const out = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    return out;
  }, []);
  const upcomingByDay = {};
  for (const t of allTasks) {
    if (t.due && weekDays.includes(t.due)) {
      (upcomingByDay[t.due] = upcomingByDay[t.due] || []).push(t);
    }
  }
  const dayLabel = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const diff = Math.round((date - new Date(today.split('-').map(Number).reduce((acc, v, i) => i === 0 ? v : acc, 0))) / 86400000);
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dayName = days[date.getDay()];
    const dateStr = `${months[date.getMonth()]} ${date.getDate()}`;
    if (diff === 1) return `Tomorrow · ${dateStr}`;
    return `${dayName} · ${dateStr}`;
  };

  const nextFlagged = allTasks.filter((t) => t.next && !t.due);

  const [doneOverride, setDoneOverride] = React.useState({});
  const isDone = (id) => doneOverride[id];

  const toggleTask = (id, notionUrl) => {
    setDoneOverride((s) => ({ ...s, [id]: true }));
    const today = new Date().toISOString().slice(0, 10);
    window.db.update('course_tasks', id, { status: 'done', completed_date: today })
      .then(() => { if (reloadData) reloadData(); })
      .catch((err) => {
        console.error('Today toggle failed', err);
        setDoneOverride((s) => { const next = { ...s }; delete next[id]; return next; });
      });
    if (notionUrl && window.notionWriteback) {
      window.notionWriteback.taskStatus(notionUrl, 'done');
    }
  };

  const formatDue = (s) => {
    if (!s) return '';
    const [y, m, d] = s.split('-').map(Number);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[m - 1]} ${d}`;
  };

  const renderRow = (t) => (
    <div
      key={t.id}
      className={`today-row ${isDone(t.id) ? 'done' : ''}`}
      onClick={() => !isDone(t.id) && toggleTask(t.id, t.notionUrl)}
    >
      <span className="today-box"></span>
      <div className="today-body">
        <div className="today-label">{t.label}</div>
        <div
          className="today-proj"
          onClick={(e) => { e.stopPropagation(); onOpenProject(t.projectId); }}
        >
          <PillarDot pillar={t.projectPillar} size={5} />
          <span>{t.projectName}</span>
          {t.due && <span className="today-due tnum">· {formatDue(t.due)}</span>}
          {t.next && <span className="today-next">next</span>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="screen">
      <header className="head">
        <div className="head-row">
          <div>
            <div className="head-title">Today</div>
            <div className="head-sub">{todayLabel}</div>
          </div>
          <div className="head-icons">
            <button className="icon-btn" aria-label="Back to Triage" onClick={onBack}>
              <Icon.ChevLeft />
            </button>
          </div>
        </div>
      </header>

      <div className="body">
        {overdue.length === 0 && dueToday.length === 0 && nextFlagged.length === 0 && Object.keys(upcomingByDay).length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Nothing on the docket.</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              No overdue, due today, or upcoming-this-week tasks.
            </div>
          </div>
        )}

        {visibleOverdue.length > 0 && (
          <>
            <SubLabel right={String(visibleOverdue.length)}>Overdue</SubLabel>
            <div className="today-section">{visibleOverdue.map(renderRow)}</div>
            {!showAllOverdue && olderOverdue.length > 0 && (
              <div
                onClick={() => setShowAllOverdue(true)}
                style={{
                  fontSize: 11.5, color: 'var(--accent)', cursor: 'pointer',
                  padding: '6px 4px 16px', textAlign: 'center',
                }}
              >+ Show {olderOverdue.length} older (past 30d)</div>
            )}
          </>
        )}

        {dueToday.length > 0 && (
          <>
            <SubLabel right={String(dueToday.length)}>Due today</SubLabel>
            <div className="today-section">{dueToday.map(renderRow)}</div>
          </>
        )}

        {weekDays.filter((d) => upcomingByDay[d]).map((d) => (
          <React.Fragment key={d}>
            <SubLabel right={String(upcomingByDay[d].length)}>{dayLabel(d)}</SubLabel>
            <div className="today-section">{upcomingByDay[d].map(renderRow)}</div>
          </React.Fragment>
        ))}

        {nextFlagged.length > 0 && (
          <>
            <SubLabel right={String(nextFlagged.length)}>Next (undated)</SubLabel>
            <div className="today-section">{nextFlagged.map(renderRow)}</div>
          </>
        )}

        <div style={{ height: 120 }}></div>
      </div>
    </div>
  );
}

window.Today = Today;
