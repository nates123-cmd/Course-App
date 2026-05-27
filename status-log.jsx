// "Where it stands" — status log + Notion summary affordance for Project Detail.
// Surfaces the user's own words about a project above Claude's inferred analysis.
// Status log is an append-only, timestamped feed; entries come from manual
// updates, Think It Through free-text answers, or capture intake.

function StatusLog({ projectId, projectName, seedEntries, onLatestChange }) {
  const [entries, setEntries] = usePersistedState(
    `project.${projectId}.statusLog`,
    seedEntries || []
  );
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [expanded, setExpanded] = React.useState(false);
  const [openIds, setOpenIds] = React.useState({});
  const [latestOpen, setLatestOpen] = React.useState(false);

  // Surface latest entry's body upstream so other components (Next Moves,
  // Think It Through) can quote-priority it.
  React.useEffect(() => {
    if (onLatestChange) onLatestChange(entries[0]?.body || null);
  }, [entries, onLatestChange]);

  // Re-read localStorage when other components (Riff, Think It Through) append
  // a note via window.addStatusNoteForProject and broadcast the event. Auto-
  // expand the latest entry so the user sees the full body of what they just
  // wrote, not the AI summary.
  React.useEffect(() => {
    const handler = (e) => {
      if (e?.detail?.projectId !== projectId) return;
      try {
        const raw = localStorage.getItem(`course-v2:project.${projectId}.statusLog`);
        if (raw) setEntries(JSON.parse(raw));
      } catch (_) {}
      setLatestOpen(true);
    };
    window.addEventListener('status-log-updated', handler);
    return () => window.removeEventListener('status-log-updated', handler);
  }, [projectId, setEntries]);

  const addEntry = () => {
    const v = draft.trim();
    if (!v) { setAdding(false); return; }
    const entry = {
      id: `s${Date.now()}`,
      body: v,
      createdAt: new Date().toISOString(),
      source: 'manual',
    };
    setEntries(arr => [entry, ...arr]);
    setDraft('');
    setAdding(false);
  };

  const cancel = () => { setDraft(''); setAdding(false); };

  if (entries.length === 0 && !adding) {
    return (
      <div className="section status-log status-log-empty">
        <div className="lbl-row">
          <span className="lbl">Where it stands</span>
          <span className="action" onClick={() => setAdding(true)}>+ Update</span>
        </div>
        <div className="status-empty">
          <span>No status notes yet — Course is working from inferred state.</span>
          <span className="status-empty-link" onClick={() => setAdding(true)}>Add the first ›</span>
        </div>
      </div>
    );
  }

  const latest = entries[0];
  const older = entries.slice(1);
  const shownOlder = expanded ? older : older.slice(0, 2);

  return (
    <div className="section status-log">
      <div className="lbl-row">
        <span className="lbl">Where it stands</span>
        {!adding && (
          <span className="action" onClick={() => setAdding(true)}>+ Update</span>
        )}
      </div>

      {adding && (
        <div className="status-add">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="In your own words — where does this stand right now?"
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancel();
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addEntry();
            }}
            rows={3}
          ></textarea>
          <div className="status-add-actions">
            <span className="chip ghost" onClick={cancel}>Cancel</span>
            <span
              className={`chip primary ${draft.trim() ? '' : 'disabled'}`}
              onClick={() => draft.trim() && addEntry()}
            >Save update</span>
          </div>
        </div>
      )}

      {latest && (
        <div
          className={`status-latest ${latest.summary ? 'has-summary' : ''} ${latestOpen ? 'open' : ''}`}
          onClick={() => latest.summary && setLatestOpen((o) => !o)}
          style={latest.summary ? { cursor: 'pointer' } : undefined}
        >
          <div className="status-latest-body">
            {latest.summary && !latestOpen ? latest.summary : latest.body}
          </div>
          {latest.summary && (
            <div className="status-latest-expand">
              {latestOpen ? 'Hide log ‹' : 'Tap for log ›'}
            </div>
          )}
          <div className="status-latest-byline">
            <span className="status-author">You</span>
            <span>·</span>
            <span>{formatRelative(latest.createdAt)}</span>
            {latest.source && latest.source !== 'manual' && (
              <span className="status-source-tag">{tagFor(latest.source)}</span>
            )}
          </div>
        </div>
      )}

      {older.length > 0 && (
        <>
          <div className="status-timeline-divider"></div>
          <div className="status-timeline">
            {shownOlder.map(e => (
              <div
                key={e.id}
                className={`status-timeline-row ${openIds[e.id] ? 'open' : ''}`}
                onClick={() => setOpenIds(s => ({ ...s, [e.id]: !s[e.id] }))}
                style={{ cursor: 'pointer' }}
              >
                <span className="status-timeline-date tnum">{formatShortDate(e.createdAt)}</span>
                <div className="status-timeline-body">
                  <span>{(e.summary && !openIds[e.id]) ? e.summary : e.body}</span>
                  {e.source && e.source !== 'manual' && (
                    <span className="status-source-tag inline">{tagFor(e.source)}</span>
                  )}
                </div>
              </div>
            ))}
            {older.length > 2 && (
              <span className="status-show-all" onClick={() => setExpanded(v => !v)}>
                {expanded
                  ? `Show recent only ‹`
                  : `Show all ${older.length} updates ›`}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Notion summary affordance — manual only. Shows the count of tagged pages,
// last-edited recency, and a "Summarize" button. On tap, expands inline with
// the Claude-generated summary + an "ask about these notes" field.
function NotionSummary({ projectId, projectName, pageCount = 3, lastEditedAgo = '4d ago' }) {
  const [expanded, setExpanded] = React.useState(false);
  const [summary, setSummary] = React.useState(null);
  const [loadingSummary, setLoadingSummary] = React.useState(false);
  const [question, setQuestion] = React.useState('');
  const [conversation, setConversation] = React.useState([]); // [{q, a, loading}]

  // A mock "Notion page content" snapshot for the Claude call — in real life
  // this comes from the Edge Function proxy querying tagged pages.
  const mockNotionContext = `Project: ${projectName}
[3 tagged Notion pages, most recent first]

— Page: "${projectName} · Mar 12 standup" (last edited 4d ago) —
Quick standup. The biggest open question is whether to push the timeline by two weeks to absorb the legal-review cycle. Mara wants to hold the date. I'd rather move it. We're not aligned. Action: get one more conversation before Friday.

— Page: "${projectName} · Notes" (last edited 11d ago) —
Random thoughts. The team is small enough that we can probably do this without a formal PM. But I keep losing track of decisions. Need a place where the rationale for things is captured, not just the artifacts.

— Page: "${projectName} · Kickoff" (last edited 3w ago) —
Original framing. The goal is X. Constraints are budget, timeline, and team availability. Risks identified at kickoff: legal, vendor lock-in, scope creep.`;

  const runSummary = async () => {
    setExpanded(true);
    if (summary) return; // cached
    setLoadingSummary(true);
    try {
      const raw = await window.claude.complete({
        messages: [{
          role: 'user',
          content:
`You are summarizing the user's OWN Notion notes for the project "${projectName}". Frame the summary as being about THEIR notes — start with phrases like "Your Mar 12 notes flag…" or "In your latest standup you noted…". Be short and concrete (2-3 sentences). Surface the most actionable signal.

NOTES:
${mockNotionContext}`,
        }],
      });
      setSummary(raw.trim());
    } catch (e) {
      setSummary("Couldn't reach Notion right now. The most recent page was edited 4 days ago — try again or open it directly.");
    } finally {
      setLoadingSummary(false);
    }
  };

  const askQuestion = async () => {
    const q = question.trim();
    if (!q) return;
    const idx = conversation.length;
    setConversation(arr => [...arr, { q, a: null, loading: true }]);
    setQuestion('');
    try {
      const raw = await window.claude.complete({
        messages: [{
          role: 'user',
          content:
`The user is asking a question about THEIR own Notion notes for the project "${projectName}". Answer based ONLY on the notes. Quote/paraphrase specific entries. If the notes don't answer it, say so. Keep it under 3 sentences.

NOTES:
${mockNotionContext}

QUESTION:
${q}`,
        }],
      });
      setConversation(arr => arr.map((m, i) => i === idx ? { ...m, a: raw.trim(), loading: false } : m));
    } catch (e) {
      setConversation(arr => arr.map((m, i) => i === idx ? { ...m, a: "Couldn't reach the notes right now.", loading: false } : m));
    }
  };

  return (
    <div className="section notion-card-section">
      <div className={`notion-card ${expanded ? 'expanded' : ''}`}>
        <div className="notion-card-head" onClick={() => !expanded && runSummary()}>
          <span className="notion-glyph"><NotionGlyph /></span>
          <div className="notion-card-meta">
            <div className="notion-card-title">{projectName} · notes</div>
            <div className="notion-card-sub tnum">
              {pageCount} tagged pages · last edited {lastEditedAgo}
            </div>
          </div>
          {!expanded ? (
            <span className="notion-card-action" onClick={(e) => { e.stopPropagation(); runSummary(); }}>
              Summarize ›
            </span>
          ) : (
            <span className="notion-card-action ghost" onClick={(e) => { e.stopPropagation(); setExpanded(false); }}>
              Close
            </span>
          )}
        </div>

        {expanded && (
          <div className="notion-card-body">
            <div className="notion-section">
              <div className="notion-section-label">Summary of latest</div>
              {loadingSummary ? (
                <div className="notion-loading">
                  <span></span><span></span><span></span>
                </div>
              ) : (
                <div className="notion-summary-text">{summary}</div>
              )}
            </div>

            {conversation.length > 0 && (
              <div className="notion-conversation">
                {conversation.map((m, i) => (
                  <div key={i} className="notion-qa">
                    <div className="notion-q">{m.q}</div>
                    {m.loading ? (
                      <div className="notion-loading"><span></span><span></span><span></span></div>
                    ) : (
                      <div className="notion-a">{m.a}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="notion-ask">
              <input
                type="text"
                placeholder="Ask about these notes…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && question.trim()) askQuestion(); }}
              />
              <span
                className={`notion-ask-send ${question.trim() ? 'on' : ''}`}
                onClick={() => question.trim() && askQuestion()}
              >Ask ›</span>
            </div>

            <a
              className="notion-open-link"
              href="https://notion.so"
              target="_blank"
              rel="noopener noreferrer"
            >Open full page in Notion ↗</a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────
function formatRelative(iso) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function formatShortDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function tagFor(source) {
  if (source === 'think_it_through') return 'TIT';
  if (source === 'capture') return 'capture';
  return source;
}

// Approximation of Notion's "N" — clean, geometric.
function NotionGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M4.5 4.5h3.2l8.4 9.8V4.5h2.4v15h-3l-8.6-10v10H4.5V4.5z"/>
    </svg>
  );
}

window.StatusLog = StatusLog;
window.NotionSummary = NotionSummary;
window.addStatusNoteForProject = function addStatusNoteForProject(projectId, body, source, summary) {
  // Imperative helper used by Next Moves / Think It Through / Riff to append a
  // note. Reads/writes the same localStorage slot the component uses.
  if (!body) return;
  const key = `course-v2:project.${projectId}.statusLog`;
  let entries = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) entries = JSON.parse(raw);
  } catch (e) { entries = []; }
  const entry = {
    id: `s${Date.now()}`,
    body,
    summary: summary || null,
    createdAt: new Date().toISOString(),
    source: source || 'manual',
  };
  entries = [entry, ...entries];
  try { localStorage.setItem(key, JSON.stringify(entries)); } catch (e) {}
  // Broadcast so any open component can re-render
  try { window.dispatchEvent(new CustomEvent('status-log-updated', { detail: { projectId } })); } catch (e) {}
};
