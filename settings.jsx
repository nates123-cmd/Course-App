// Settings — manage Notion DB ids + theme without leaving Course.
// Synced settings are tied to your login (Supabase user_settings) via
// window.suiteSettings, with localStorage as the offline mirror. The Anthropic
// key is no longer entered here — it lives server-side in the `claude` edge
// function (see claude-shim.js). Bottom-sheet pattern, reuses .sheet styles.

function SettingsSheet({ onClose, reloadData }) {
  const [projDb, setProjDb]       = React.useState(() => localStorage.getItem('notion_projects_db_id') || '');
  const [tasksDb, setTasksDb]     = React.useState(() => localStorage.getItem('notion_tasks_db_id') || '');
  const [theme, setTheme]         = React.useState(() => localStorage.getItem('course_theme') || 'dark');
  const [savedField, setSavedField] = React.useState(null);

  const pickTheme = (mode) => {
    setTheme(mode);
    if (window.setCourseTheme) window.setCourseTheme(mode);
    if (window.suiteSettings) window.suiteSettings.set('course_theme', mode);
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
    // Synced keys go through suiteSettings (localStorage + the user's cloud row);
    // anything else stays device-local.
    if (window.suiteSettings && window.suiteSettings.SYNCED_KEYS.includes(key)) {
      window.suiteSettings.set(key, v);
    } else if (v) {
      localStorage.setItem(key, v);
    } else {
      localStorage.removeItem(key);
    }
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
          <span className="sheet-row-label">AI</span>
          <div className="sheet-row-hint">Capture classification, Riff, and Next Moves run through your login — no API key to enter. Powered server-side.</div>
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
