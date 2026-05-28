// Shared icons & small components for Course

const Icon = {
  Menu: () => (
    <svg className="i" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
  ),
  Search: () => (
    <svg className="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
  ),
  Bell: () => (
    <svg className="i" viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>
  ),
  Inbox: () => (
    <svg className="i" viewBox="0 0 24 24"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M3 13V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7"/><path d="M3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></svg>
  ),
  Settings: () => (
    <svg className="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.09.69.27.96.51.27.24.5.55.55.85"/></svg>
  ),
  Refresh: () => (
    <svg className="i i-sm" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 4v4h-4M3 20v-4h4"/></svg>
  ),
  Chevron: () => (
    <svg className="i i-sm" viewBox="0 0 24 24" style={{width:9,height:9}}><path d="m6 9 6 6 6-6"/></svg>
  ),
  ChevLeft: () => (
    <svg className="i i-sm" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
  ),
  Plus: () => (
    <svg viewBox="0 0 24 24" style={{width:18,height:18,stroke:'currentColor',fill:'none',strokeWidth:2,strokeLinecap:'round'}}><path d="M12 5v14M5 12h14"/></svg>
  ),
  Mic: () => (
    <svg className="i" viewBox="0 0 24 24" style={{width:16,height:16}}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
  ),
  Flag: () => (
    <svg className="i" viewBox="0 0 24 24" style={{width:11,height:11,strokeWidth:2}}><path d="M4 21V4M4 4l8 2 8-2v10l-8 2-8-2"/></svg>
  ),
  Sparkle: () => (
    <svg className="i" viewBox="0 0 24 24" style={{width:12,height:12,strokeWidth:1.8}}><path d="M12 3v6m0 6v6M3 12h6m6 0h6M5.6 5.6l4.2 4.2m4.4 4.4 4.2 4.2M18.4 5.6l-4.2 4.2m-4.4 4.4-4.2 4.2"/></svg>
  ),
};

// Pillar dot
function PillarDot({ pillar, size = 8 }) {
  const map = {
    arrow: 'var(--pillar-arrow)',
    sunny: 'var(--pillar-sunny)',
    side:  'var(--pillar-side)',
    life:  'var(--pillar-side)', // user's canonical "Life" pillar reuses Side's purple
  };
  return <span className="pdot" style={{ width: size, height: size, background: map[pillar] || 'var(--text-faint)' }}></span>;
}

// Section sublabel
function SubLabel({ children, right }) {
  return (
    <div className="subhead">
      <span className="l">{children}</span>
      {right && <span className="r">{right}</span>}
    </div>
  );
}

// Persisted-state hook — same shape as useState but writes through to localStorage.
// Useful for keeping checkbox state, expansion, etc. across navigation + reload.
function usePersistedState(key, initial) {
  const fullKey = `course-v2:${key}`;
  const [value, setValue] = React.useState(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw == null) return typeof initial === 'function' ? initial() : initial;
      return JSON.parse(raw);
    } catch (e) {
      return typeof initial === 'function' ? initial() : initial;
    }
  });
  React.useEffect(() => {
    try { localStorage.setItem(fullKey, JSON.stringify(value)); } catch (e) {}
  }, [fullKey, value]);
  return [value, setValue];
}

// Long-press hook — fires after `ms` of held pointer.
function useLongPress(callback, { ms = 450 } = {}) {
  const timer = React.useRef(null);
  const fired = React.useRef(false);
  const start = React.useRef({ x: 0, y: 0 });

  const cancel = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };
  const begin = (e) => {
    fired.current = false;
    const point = e.touches ? e.touches[0] : e;
    start.current = { x: point.clientX, y: point.clientY };
    cancel();
    timer.current = setTimeout(() => {
      fired.current = true;
      try { navigator.vibrate && navigator.vibrate(8); } catch (_) {}
      callback(e);
    }, ms);
  };
  const move = (e) => {
    if (!timer.current) return;
    const point = e.touches ? e.touches[0] : e;
    const dx = point.clientX - start.current.x;
    const dy = point.clientY - start.current.y;
    if (dx * dx + dy * dy > 36) cancel(); // moved >6px — treat as scroll
  };
  const end = () => cancel();
  const onContextMenu = (e) => { e.preventDefault(); callback(e); };

  return {
    bind: {
      onMouseDown: begin,
      onMouseMove: move,
      onMouseUp: end,
      onMouseLeave: end,
      onTouchStart: begin,
      onTouchMove: move,
      onTouchEnd: end,
      onTouchCancel: end,
      onContextMenu,
    },
    didFire: () => fired.current,
    cancel,
  };
}

// Bottom-sheet task editor — assignable to any task in the app.
function TaskSheet({ task, onClose, onSave, onDelete, onPushReminders }) {
  const [draft, setDraft] = React.useState(() => ({
    label: task.label || '',
    status: task.done ? 'done' : (task.status || 'none'),  // 'none' | 'todo' | 'doing' | 'waiting' | 'done'
    date: task.date || null,        // {m,d,y}
    estimate: task.estimate || null, // 5 | 15 | 30 | 60
    kind: task.kind || null,         // 'deep' | 'admin'
    note: task.note || '',
    projectId: task.projectId || null,
  }));
  const [calOpen, setCalOpen] = React.useState(false);
  const [projPickerOpen, setProjPickerOpen] = React.useState(false);
  const projectChoices = window.PROJECTS
    ? Object.entries(window.PROJECTS)
        .filter(([id, p]) => p.status !== 'idea' && p.status !== 'archived' && p.status !== 'done')
        .map(([id, p]) => ({ id, name: p.name, pillar: p.pillar, label: p.pillarLabel }))
    : [];
  const selectedProj = projectChoices.find((p) => p.id === draft.projectId);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Close on escape
  React.useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const dateLabel = draft.date ? `${MONTHS[draft.date.m]} ${draft.date.d}` : 'No date';

  const STATUS = [
    { id: 'none',    label: 'None' },
    { id: 'todo',    label: 'To do' },
    { id: 'doing',   label: 'In Progress' },
    { id: 'waiting', label: 'Waiting' },
    { id: 'done',    label: 'Done' },
  ];
  const EST = [5, 15, 30, 60];
  const KIND = [
    { id: 'deep',  label: 'Deep',  hint: 'Focus work' },
    { id: 'admin', label: 'Admin', hint: 'Light work' },
  ];

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle"></div>
        <div className="sheet-header">
          <input
            className="sheet-label"
            value={draft.label}
            onChange={(e) => setDraft(d => ({ ...d, label: e.target.value }))}
            placeholder="Task"
          />
        </div>

        <div className="sheet-row">
          <span className="sheet-row-label">Project</span>
          <div className="sheet-when">
            <span
              className={`sheet-chip ${projPickerOpen ? 'on' : ''}`}
              onClick={() => setProjPickerOpen((o) => !o)}
            >
              {selectedProj ? (
                <>
                  <PillarDot pillar={selectedProj.pillar} size={6} />
                  <span style={{ marginLeft: 6 }}>{selectedProj.name}</span>
                </>
              ) : <span style={{ color: 'var(--text-faint)' }}>None</span>}
            </span>
            {draft.projectId && (
              <span className="sheet-chip-clear" onClick={() => setDraft((d) => ({ ...d, projectId: null }))}>×</span>
            )}
          </div>
          {projPickerOpen && (
            <div className="sheet-projects">
              {projectChoices.map((p) => (
                <div
                  className={`sheet-project-row ${draft.projectId === p.id ? 'sel' : ''}`}
                  key={p.id}
                  onClick={() => { setDraft((d) => ({ ...d, projectId: p.id })); setProjPickerOpen(false); }}
                >
                  <PillarDot pillar={p.pillar} size={6} />
                  <span className="sheet-project-name">{p.name}</span>
                  <span className="sheet-project-tag">{p.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sheet-row">
          <span className="sheet-row-label">Status</span>
          <div className="sheet-segs">
            {STATUS.map(s => (
              <span
                key={s.id}
                className={`sheet-seg ${draft.status === s.id ? 'on' : ''}`}
                onClick={() => setDraft(d => ({ ...d, status: s.id }))}
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>

        <div className="sheet-row">
          <span className="sheet-row-label">When</span>
          <div className="sheet-when">
            <span
              className={`sheet-chip ${calOpen || draft.date ? 'on' : ''}`}
              onClick={() => setCalOpen(o => !o)}
            >
              <Icon.Flag />
              {dateLabel}
            </span>
            {draft.date && (
              <span className="sheet-chip-clear" onClick={() => setDraft(d => ({ ...d, date: null }))}>×</span>
            )}
          </div>
          {calOpen && (
            <div className="sheet-cal">
              <MiniCalendar
                initial={draft.date ? new Date(draft.date.y, draft.date.m, draft.date.d) : undefined}
                onPick={(pick) => { setDraft(d => ({ ...d, date: pick })); setCalOpen(false); }}
              />
            </div>
          )}
        </div>

        <div className="sheet-row">
          <span className="sheet-row-label">Estimate</span>
          <div className="sheet-segs">
            {EST.map(m => (
              <span
                key={m}
                className={`sheet-seg ${draft.estimate === m ? 'on' : ''}`}
                onClick={() => setDraft(d => ({ ...d, estimate: d.estimate === m ? null : m }))}
              >
                <span className="tnum">{m}</span><span className="sheet-seg-sub">min</span>
              </span>
            ))}
          </div>
        </div>

        <div className="sheet-row">
          <span className="sheet-row-label">Kind</span>
          <div className="sheet-segs sheet-segs-2">
            {KIND.map(k => (
              <span
                key={k.id}
                className={`sheet-seg sheet-seg-tall ${draft.kind === k.id ? 'on' : ''}`}
                onClick={() => setDraft(d => ({ ...d, kind: d.kind === k.id ? null : k.id }))}
              >
                <span className="sheet-seg-label">{k.label}</span>
                <span className="sheet-seg-hint">{k.hint}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="sheet-row">
          <span className="sheet-row-label">Note</span>
          <textarea
            className="sheet-note"
            placeholder="Anything to remember…"
            value={draft.note}
            onChange={(e) => setDraft(d => ({ ...d, note: e.target.value }))}
            rows={2}
          ></textarea>
        </div>

        {(onPushReminders || onDelete) && (
          <div className="sheet-actions sheet-actions-extra">
            {onPushReminders && (
              <span className="chip" onClick={() => onPushReminders(draft)}>↗ Reminders</span>
            )}
            {onDelete && (
              <span
                className="chip danger"
                onClick={() => {
                  if (confirm('Delete this task?')) onDelete();
                }}
              >Delete</span>
            )}
          </div>
        )}
        <div className="sheet-actions">
          <span className="chip ghost" onClick={onClose}>Cancel</span>
          <span className="chip primary" onClick={() => onSave(draft)}>Save</span>
        </div>
      </div>
    </div>
  );
}

// Compact calendar popover, used by project meta + queue "New date" chips.
function MiniCalendar({ initial, onPick, onDismiss }) {
  const now = initial || new Date();
  const [view, setView] = React.useState({ m: now.getMonth(), y: now.getFullYear() });
  const [selected, setSelected] = React.useState({ m: now.getMonth(), d: now.getDate(), y: now.getFullYear() });
  const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const firstDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const step = (delta) => {
    let m = view.m + delta, y = view.y;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setView({ m, y });
  };
  return (
    <div className="popover cal" onClick={(e) => e.stopPropagation()}>
      <div className="cal-head">
        <button className="cal-nav" onClick={() => step(-1)} aria-label="Previous"><Icon.ChevLeft /></button>
        <span className="cal-title">{MONTHS_FULL[view.m]} {view.y}</span>
        <button className="cal-nav" onClick={() => step(1)} aria-label="Next" style={{ transform: 'rotate(180deg)' }}><Icon.ChevLeft /></button>
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
          const isSelected = day === selected.d && view.m === selected.m && view.y === selected.y;
          return (
            <span
              key={`d-${day}`}
              className={`cal-day tnum ${isSelected ? 'sel' : ''}`}
              onClick={() => {
                const pick = { m: view.m, d: day, y: view.y };
                setSelected(pick);
                onPick && onPick(pick);
              }}
            >
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { Icon, PillarDot, SubLabel, MiniCalendar, useLongPress, TaskSheet, usePersistedState });
