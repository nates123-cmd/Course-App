// Settings — manage API key + Notion DB ids without leaving Course.
// Each field reads/writes localStorage on blur. Bottom-sheet pattern, reuses
// .sheet-overlay/.sheet styles.

function SettingsSheet({ onClose, reloadData }) {
  const [anthKey, setAnthKey]     = React.useState(() => localStorage.getItem('anthropic_api_key') || '');
  const [projDb, setProjDb]       = React.useState(() => localStorage.getItem('notion_projects_db_id') || '');
  const [tasksDb, setTasksDb]     = React.useState(() => localStorage.getItem('notion_tasks_db_id') || '');
  const [showKey, setShowKey]     = React.useState(false);
  const [theme, setTheme]         = React.useState(() => localStorage.getItem('course_theme') || 'dark');
  const [savedField, setSavedField] = React.useState(null);

  const pickTheme = (mode) => {
    setTheme(mode);
    if (window.setCourseTheme) window.setCourseTheme(mode);
  };
  const [syncState, setSyncState] = React.useState('idle'); // 'idle' | 'running' | 'done' | 'error'
  const [syncMsg, setSyncMsg]     = React.useState(null);

  const runSync = async () => {
    if (syncState === 'running' || !window.notionSync) return;
    setSyncState('running');
    setSyncMsg('Starting…');
    try {
      const res = await window.notionSync.syncProjects({ onProgress: setSyncMsg });
      setSyncState('done');
      setSyncMsg(`Synced ${res.total} projects · ${res.inserted} new, ${res.updated} updated`);
      // Reflect the resolved/self-healed DB id back into the field.
      setProjDb(localStorage.getItem('notion_projects_db_id') || '');
      if (reloadData) await reloadData();
    } catch (err) {
      setSyncState('error');
      setSyncMsg(err.message || String(err));
    }
  };

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
          <span className="sheet-row-label">Appearance</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['system', 'System'], ['dark', 'Dark'], ['light', 'Light'], ['solar', 'Solar']].map(([val, lbl]) => (
              <span
                key={val}
                className={`chip ${theme === val ? 'primary' : 'ghost'}`}
                onClick={() => pickTheme(val)}
                style={{ flex: 1, minWidth: 64, justifyContent: 'center', textAlign: 'center' }}
              >{lbl}</span>
            ))}
          </div>
          <div className="sheet-row-hint">System follows your device. Solar tracks the sun — light by day, dark after sunset (asks for your location once).</div>
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

        <div className="sheet-row">
          <span className="sheet-row-label">Sync from Notion</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              className={`chip primary ${syncState === 'running' ? 'disabled' : ''}`}
              onClick={runSync}
            >{syncState === 'running' ? 'Syncing…' : 'Pull projects'}</span>
            {syncMsg && (
              <span style={{
                fontSize: 12,
                color: syncState === 'error' ? 'var(--risk)' : 'var(--text-muted)',
                flex: 1, minWidth: 0,
              }}>{syncMsg}</span>
            )}
          </div>
          <div className="sheet-row-hint">Pulls all non-archived projects from Notion into Course (insert + update). Done/Archived are not pulled.</div>
        </div>

        <div className="sheet-actions">
          <span className="chip primary" onClick={onClose}>Done</span>
        </div>
      </div>
    </div>
  );
}

window.SettingsSheet = SettingsSheet;
