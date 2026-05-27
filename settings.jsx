// Settings — manage API key + Notion DB ids without leaving Course.
// Each field reads/writes localStorage on blur. Bottom-sheet pattern, reuses
// .sheet-overlay/.sheet styles.

function SettingsSheet({ onClose }) {
  const [anthKey, setAnthKey]     = React.useState(() => localStorage.getItem('anthropic_api_key') || '');
  const [projDb, setProjDb]       = React.useState(() => localStorage.getItem('notion_projects_db_id') || '');
  const [tasksDb, setTasksDb]     = React.useState(() => localStorage.getItem('notion_tasks_db_id') || '');
  const [showKey, setShowKey]     = React.useState(false);
  const [savedField, setSavedField] = React.useState(null);

  React.useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const flashSaved = (field) => {
    setSavedField(field);
    setTimeout(() => setSavedField(null), 1200);
  };

  const commit = (key, value, label) => {
    const v = (value || '').trim();
    if (v) localStorage.setItem(key, v);
    else   localStorage.removeItem(key);
    flashSaved(label);
  };

  const normalizeDbId = (raw) => {
    // Accept full URLs or hyphenated UUIDs; strip to the 32-char hex.
    const m = String(raw || '').match(/([0-9a-f]{32})/i);
    return m ? m[1] : '';
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle"></div>

        <div className="capture-sheet-title">
          <span className="capture-sheet-kind">Settings</span>
        </div>

        <div className="sheet-row">
          <span className="sheet-row-label">
            Anthropic API key
            {savedField === 'anth' && <span style={{ marginLeft: 8, color: 'var(--good)' }}>saved ✓</span>}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={showKey ? 'text' : 'password'}
              className="sheet-label"
              value={anthKey}
              onChange={(e) => setAnthKey(e.target.value)}
              onBlur={() => commit('anthropic_api_key', anthKey, 'anth')}
              placeholder="sk-ant-…"
              style={{ flex: 1 }}
            />
            <span
              className="chip ghost"
              onClick={() => setShowKey((s) => !s)}
              style={{ flexShrink: 0 }}
            >{showKey ? 'Hide' : 'Show'}</span>
          </div>
          <div className="sheet-row-hint">Powers Capture classification, Riff process, Next Moves.</div>
        </div>

        <div className="sheet-row">
          <span className="sheet-row-label">
            Notion Projects DB id
            {savedField === 'proj' && <span style={{ marginLeft: 8, color: 'var(--good)' }}>saved ✓</span>}
          </span>
          <input
            type="text"
            className="sheet-label"
            value={projDb}
            onChange={(e) => setProjDb(e.target.value)}
            onBlur={() => {
              const normalized = normalizeDbId(projDb);
              setProjDb(normalized);
              commit('notion_projects_db_id', normalized, 'proj');
            }}
            placeholder="32-char hex (or paste full Notion URL)"
          />
          <div className="sheet-row-hint">New projects created in Course push here.</div>
        </div>

        <div className="sheet-row">
          <span className="sheet-row-label">
            Notion Tasks DB id
            {savedField === 'tasks' && <span style={{ marginLeft: 8, color: 'var(--good)' }}>saved ✓</span>}
          </span>
          <input
            type="text"
            className="sheet-label"
            value={tasksDb}
            onChange={(e) => setTasksDb(e.target.value)}
            onBlur={() => {
              const normalized = normalizeDbId(tasksDb);
              setTasksDb(normalized);
              commit('notion_tasks_db_id', normalized, 'tasks');
            }}
            placeholder="32-char hex (or paste full Notion URL)"
          />
          <div className="sheet-row-hint">New tasks created in Course push here, linked to project.</div>
        </div>

        <div className="sheet-actions">
          <span className="chip primary" onClick={onClose}>Done</span>
        </div>
      </div>
    </div>
  );
}

window.SettingsSheet = SettingsSheet;
