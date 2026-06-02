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

// Theme is applied straight to the DOM and persisted in localStorage so it
// survives reloads in the deployed PWA. (The dev Tweaks panel only works inside
// the editor host — it can't open or persist in the shipped app, so localStorage
// is the real source of truth.)
//
// Modes: 'system' (follow OS), 'dark', 'light', and 'solar' — solar switches the
// applied light/dark palette by the sun (sunrise→light, sunset→dark) using a
// network-free NOAA approximation + geolocation, ported from Ink. The user's
// chosen mode lives in course_theme; for solar, the *resolved* palette ('dark'
// or 'light') is what lands on data-theme.
const THEME_KEY = 'course_theme';
const SOLAR_DARK_KEY = 'course_solar_dark'; // last-known resolution, read pre-paint

function osDark() {
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

// Sunrise/sunset (NOAA approximation, pure JS, no network). Returns Date (UTC) or null at poles.
function sunTimes(date, lat, lng) {
  const Z = 90.833, D = Math.PI / 180, R = 180 / Math.PI;
  const Y = date.getUTCFullYear(), Mo = date.getUTCMonth(), Da = date.getUTCDate();
  const N = Math.floor((Date.UTC(Y, Mo, Da) - Date.UTC(Y, 0, 0)) / 86400000);
  function calc(rise) {
    const lngH = lng / 15, t = N + ((rise ? 6 : 18) - lngH) / 24;
    const M = (0.9856 * t) - 3.289;
    let L = (M + 1.916 * Math.sin(M * D) + 0.020 * Math.sin(2 * M * D) + 282.634 + 360) % 360;
    let RA = (R * Math.atan(0.91764 * Math.tan(L * D)) + 360) % 360;
    RA += (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90); RA /= 15;
    const sinDec = 0.39782 * Math.sin(L * D), cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(Z * D) - sinDec * Math.sin(lat * D)) / (cosDec * Math.cos(lat * D));
    if (cosH > 1 || cosH < -1) return null; // sun never rises / never sets
    let H = (rise ? 360 - R * Math.acos(cosH) : R * Math.acos(cosH)) / 15;
    let UT = ((H + RA - 0.06571 * t - 6.622) - lngH) % 24; UT = (UT + 24) % 24;
    return new Date(Date.UTC(Y, Mo, Da) + UT * 3600000);
  }
  return { sunrise: calc(true), sunset: calc(false) };
}
function getGeo() { try { return JSON.parse(localStorage.getItem('course_geo') || 'null'); } catch (_) { return null; } }
function requestGeo(cb) {
  if (!navigator.geolocation) { cb && cb(null); return; }
  navigator.geolocation.getCurrentPosition(
    p => { const g = { lat: p.coords.latitude, lng: p.coords.longitude }; localStorage.setItem('course_geo', JSON.stringify(g)); cb && cb(g); },
    _ => { cb && cb(null); }, { maximumAge: 6 * 3600000, timeout: 8000 });
}
// No coordinates (denied/unavailable, or polar day/night): decide by LOCAL clock —
// dark before 7am or from 7pm. Deliberately NOT osDark(), so solar still tracks
// day/night with no geo instead of silently mirroring the OS theme.
function clockFallback() {
  const now = new Date(), h = now.getHours();
  const dark = h < 7 || h >= 19;
  const nx = new Date(now);
  if (h < 7) nx.setHours(7, 0, 0, 0);
  else if (h < 19) nx.setHours(19, 0, 0, 0);
  else { nx.setDate(nx.getDate() + 1); nx.setHours(7, 0, 0, 0); }
  return { dark, next: nx - now };
}
// Solar resolution → {dark, next} (next = ms until the next transition). Gather sun
// events for yesterday/today/tomorrow and reason from the instants nearest now, since
// sunTimes() is anchored to the input's UTC date (western longitudes can spill a day).
function resolveSolar() {
  const g = getGeo(); if (!g) return clockFallback();
  const now = new Date(), sunrises = [], sunsets = [];
  for (const off of [-1, 0, 1]) {
    const st = sunTimes(new Date(now.getTime() + off * 86400000), g.lat, g.lng);
    if (st.sunrise) sunrises.push(st.sunrise);
    if (st.sunset) sunsets.push(st.sunset);
  }
  if (!sunrises.length || !sunsets.length) return clockFallback();
  const lastBefore = arr => arr.filter(t => t <= now).sort((a, b) => b - a)[0] || null;
  const firstAfter = arr => arr.filter(t => t > now).sort((a, b) => a - b)[0] || null;
  const lastSunrise = lastBefore(sunrises), lastSunset = lastBefore(sunsets);
  let dark;
  if (!lastSunrise) dark = true;
  else if (!lastSunset) dark = false;
  else dark = lastSunset > lastSunrise;
  const next = [firstAfter(sunrises), firstAfter(sunsets)].filter(Boolean).sort((a, b) => a - b)[0];
  return { dark, next: next ? next - now : null };
}

function getCourseTheme() {
  const t = localStorage.getItem(THEME_KEY);
  return (t === 'light' || t === 'dark' || t === 'system' || t === 'solar') ? t : 'dark';
}

// Apply the current stored mode to <html data-theme>. Solar resolves to a concrete
// dark/light palette; system stays "system" so the CSS media query drives it.
function applyTheme() {
  const mode = getCourseTheme();
  let attr;
  if (mode === 'solar') {
    const dark = resolveSolar().dark;
    localStorage.setItem(SOLAR_DARK_KEY, dark ? '1' : '0'); // pre-paint reads this next boot
    attr = dark ? 'dark' : 'light';
  } else {
    attr = mode; // system | dark | light
  }
  document.documentElement.setAttribute('data-theme', attr);
  // Keep browser/status-bar chrome in sync with the resolved palette.
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  const isLight = attr === 'light' || (attr === 'system' && prefersLight);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isLight ? '#f5efe4' : '#1c1814');
  scheduleSolar();
  if (mode === 'solar') ensureSolarGeo();
}

// Request geolocation at most once per load when solar is active but we have no
// coords yet, so a session already on solar self-heals from the clock fallback.
let _geoTried = false;
function ensureSolarGeo() {
  if (_geoTried || getGeo() || getCourseTheme() !== 'solar') return;
  _geoTried = true; requestGeo(() => applyTheme());
}
let _solarTimer = null;
function scheduleSolar() {
  if (_solarTimer) { clearTimeout(_solarTimer); _solarTimer = null; }
  if (getCourseTheme() !== 'solar') return;
  const s = resolveSolar();
  // Re-apply at the next sun event; cap at 6h to re-check (and dodge setTimeout overflow).
  if (s && s.next != null) _solarTimer = setTimeout(applyTheme, Math.min(s.next + 1000, 6 * 3600000));
}

window.setCourseTheme = (mode) => {
  localStorage.setItem(THEME_KEY, mode);
  if (mode === 'solar') _geoTried = false; // re-pick → retry location even if previously denied
  applyTheme();
  window.dispatchEvent(new CustomEvent('coursethemechange', { detail: mode }));
};

// Re-resolve on OS palette flip (system mode, or solar's polar/clock fallback),
// and re-check solar when the tab returns to the foreground (timers throttle while hidden).
if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onFlip = () => { const t = getCourseTheme(); if (t === 'system' || t === 'solar') applyTheme(); };
  mq.addEventListener ? mq.addEventListener('change', onFlip) : mq.addListener(onFlip);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && getCourseTheme() === 'solar') applyTheme();
});

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
      // Pull this user's cloud settings (Notion DB ids, theme) into localStorage
      // before loading data, so settings follow the login across devices.
      if (window.suiteSettings) { await window.suiteSettings.load(); applyTheme(); }
      const { registry, pillarTasks, projectIds: ids, pendingInboxCount: count } = await window.loadCourseData();
      window.PROJECTS = registry;
      window.PILLAR_TASKS = pillarTasks || {};
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

  // Apply the persisted theme on mount. localStorage is the source of truth (set
  // via the Settings sheet → window.setCourseTheme). OS-flip / solar-event /
  // foreground re-resolution is wired at module scope.
  React.useEffect(() => { applyTheme(); }, []);

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
              <Project key={openProjectId} projectId={openProjectId} onBack={back} reloadData={reloadData} />
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
          options={['system', 'dark', 'light', 'solar']}
          onChange={(v) => { setTweak('theme', v); window.setCourseTheme(v); }}
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
