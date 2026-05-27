// Course — main app shell with theme handling, navigation, tweaks

function LoadingShim() {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-faint)', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase',
    }}>Loading…</div>
  );
}

function ErrorShim({ message, onRetry }) {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column', gap: 12,
      alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center',
    }}>
      <div style={{ color: 'var(--risk)', fontSize: 14, fontWeight: 600 }}>
        Couldn't load Course data
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 320 }}>
        {message}
      </div>
      <button
        onClick={onRetry}
        style={{
          marginTop: 8, padding: '8px 14px', borderRadius: 'var(--r-pill)',
          background: 'var(--accent)', color: '#1c1814', border: 'none',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >Retry</button>
    </div>
  );
}

function NotionSyncIndicator() {
  // Counts in-flight Notion writeback failures since last dismissal. A successful
  // writeback clears it.
  const [fails, setFails] = React.useState([]);
  React.useEffect(() => {
    const handler = (e) => {
      const { ok, field, error } = e.detail || {};
      if (ok) {
        setFails([]); // any success wipes the dirty marker
      } else {
        setFails((arr) => {
          const next = [...arr, { field, error, at: Date.now() }];
          return next.slice(-10);
        });
      }
    };
    window.addEventListener('notion-writeback', handler);
    return () => window.removeEventListener('notion-writeback', handler);
  }, []);
  const [open, setOpen] = React.useState(false);

  if (fails.length === 0) return null;
  return (
    <div
      onClick={() => setOpen((o) => !o)}
      style={{
        position: 'fixed', bottom: 24, left: 24, zIndex: 40,
        background: 'rgba(212, 100, 74, 0.14)', // var(--risk) tinted
        color: 'var(--risk)',
        border: '0.5px solid var(--risk)',
        borderRadius: 'var(--r-pill)',
        padding: '8px 12px', fontSize: 12, fontWeight: 600,
        letterSpacing: '0.04em',
        cursor: 'pointer', userSelect: 'none',
        maxWidth: 320, lineHeight: 1.4,
        backdropFilter: 'blur(20px)',
      }}
      title={fails.map((f) => `${f.field}: ${f.error || 'failed'}`).join('\n')}
    >
      Notion out of sync ({fails.length})
      {open && (
        <div style={{ marginTop: 6, fontWeight: 400, fontSize: 11, color: 'var(--text-muted)', letterSpacing: 0 }}>
          {fails.slice(-3).map((f, i) => (
            <div key={i}>· {f.field}{f.error ? ` — ${f.error.slice(0, 60)}` : ''}</div>
          ))}
          <div
            onClick={(e) => { e.stopPropagation(); setFails([]); }}
            style={{ marginTop: 6, color: 'var(--accent)', cursor: 'pointer' }}
          >Dismiss ›</div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onReload }) {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', gap: 14,
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)' }}>
        Course
      </div>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
        color: 'var(--text-faint)',
      }}>No projects yet</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 320, lineHeight: 1.55 }}>
        Course is where you steer the work. Import projects from Notion to get started, or add one manually.
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button
          onClick={() => alert('Setup Flow — coming next session. For now, add a project via Supabase Dashboard or wait for the inline editor.')}
          style={{
            padding: '10px 16px', borderRadius: 'var(--r-pill)',
            background: 'var(--accent)', color: '#1c1814', border: 'none',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >Import from Notion</button>
        <button
          onClick={onReload}
          style={{
            padding: '10px 16px', borderRadius: 'var(--r-pill)',
            background: 'transparent', color: 'var(--text-muted)',
            border: '1px solid var(--border)',
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >Reload</button>
      </div>
    </div>
  );
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "density": "comfortable",
  "showQueue": true,
  "accent": "#d49355",
  "showTweaks": true
}/*EDITMODE-END*/;

const ACCENT_OPTIONS = [
  "#d49355", // amber/copper (default)
  "#c2562e", // burnt orange (closer to the original mockup)
  "#a8794d", // muted copper
  "#b88a55"  // sandy gold
];

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = React.useState('triage'); // 'triage' | 'project'
  const [openProjectId, setOpenProjectId] = React.useState(null);
  const [loadState, setLoadState] = React.useState('loading'); // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = React.useState(null);
  const [projectIds, setProjectIds] = React.useState([]);
  const [pendingInboxCount, setPendingInboxCount] = React.useState(0);

  // Global Cmd+Enter (or Ctrl+Enter) → click the nearest primary action chip.
  // Walks up from the focused input to find the relevant submit affordance.
  React.useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Enter') return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const active = document.activeElement;
      if (!active) return;
      const isField = active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable;
      if (!isField) return;

      // Walk up looking for a contextually relevant action button.
      let el = active.parentElement;
      while (el && el !== document.body) {
        const action =
             el.querySelector(':scope .chip.primary:not(.disabled)')
          || el.querySelector(':scope .capture-opt.freeform')
          || el.querySelector(':scope .riff-go:not(:disabled)')
          || el.querySelector(':scope button[type="submit"]:not(:disabled)');
        if (action) {
          e.preventDefault();
          action.click();
          return;
        }
        el = el.parentElement;
      }
      // Nothing found — fall back to blurring (commits via onBlur for inline editors).
      e.preventDefault();
      active.blur();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Load real Supabase data on mount. Until this resolves, render a loading
  // shim instead of the prototype's hardcoded Triage cards. After load,
  // window.PROJECTS is the registry the components read from.
  const reloadData = React.useCallback(async () => {
    try {
      const { registry, projectIds: ids, pendingInboxCount: count } = await window.loadCourseData();
      window.PROJECTS = registry;
      setProjectIds(ids);
      setPendingInboxCount(count || 0);
      setOpenProjectId((cur) => cur || ids[0] || null);
      setLoadState('ready');
    } catch (err) {
      console.error('Course: failed to load data', err);
      setLoadError(err.message || String(err));
      setLoadState('error');
    }
  }, []);
  React.useEffect(() => { reloadData(); }, [reloadData]);

  // Apply theme to <html> via data-theme attribute so the CSS variables flip
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', t.theme || 'system');
  }, [t.theme]);

  // Apply density via CSS var on documentElement so it cascades into the frame
  React.useEffect(() => {
    const map = { compact: 0.85, comfortable: 1, roomy: 1.15 };
    document.documentElement.style.setProperty('--density', map[t.density] || 1);
  }, [t.density]);

  // Apply accent override
  React.useEffect(() => {
    if (t.accent) {
      document.documentElement.style.setProperty('--accent', t.accent);
    }
  }, [t.accent]);

  const openProject = (id) => { setOpenProjectId(id || projectIds[0] || null); setScreen('project'); };
  const back = () => setScreen('triage');

  // Responsive shell: mobile single-pane, desktop master-detail (Triage left,
  // Project/Today right). Layout-discipline rule: no max-widths on cards;
  // components reflow via media queries on the outer panes only.
  const isReady = loadState === 'ready' && projectIds.length > 0;
  return (
    <div className="course-shell">
      {loadState === 'loading' && <LoadingShim />}
      {loadState === 'error' && <ErrorShim message={loadError} onRetry={reloadData} />}
      {loadState === 'ready' && projectIds.length === 0 && <EmptyState onReload={reloadData} />}
      {isReady && (
        <div className="course-layout" data-screen={screen}>
          <div className="course-pane course-pane-left">
            <Triage
              onOpenProject={openProject}
              density={t.density}
              showQueue={t.showQueue}
              reloadData={reloadData}
              pendingInboxCount={pendingInboxCount}
              onChangeScreen={setScreen}
            />
          </div>
          <div className="course-pane course-pane-right">
            {screen === 'project' && (
              <Project projectId={openProjectId} onBack={back} reloadData={reloadData} />
            )}
            {screen === 'today' && (
              <Today
                onOpenProject={openProject}
                onBack={() => setScreen('triage')}
                reloadData={reloadData}
              />
            )}
            {screen === 'triage' && (
              <div className="right-pane-placeholder">
                <div className="rpp-title">Course</div>
                <div className="rpp-hint">Pick a project from Triage, or capture something new with the +.</div>
              </div>
            )}
          </div>
        </div>
      )}

      <NotionSyncIndicator />

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakRadio
          label="Mode"
          value={t.theme}
          options={['system', 'dark', 'light']}
          onChange={(v) => setTweak('theme', v)}
        />
        <TweakColor
          label="Accent"
          value={t.accent}
          options={ACCENT_OPTIONS}
          onChange={(v) => setTweak('accent', v)}
        />

        <TweakSection label="Layout" />
        <TweakRadio
          label="Density"
          value={t.density}
          options={['compact', 'comfortable', 'roomy']}
          onChange={(v) => setTweak('density', v)}
        />

        <TweakSection label="Surface" />
        <TweakToggle
          label="Show pending decisions queue"
          value={t.showQueue}
          onChange={(v) => setTweak('showQueue', v)}
        />

        <TweakSection label="Navigation" />
        <TweakRadio
          label="Screen"
          value={screen}
          options={['triage', 'project']}
          onChange={(v) => setScreen(v)}
        />
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
