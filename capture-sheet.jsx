// CaptureSheet — bottom sheet for adding details after capturing a new item.
// Used by the + button on Triage. Renders different fields per kind:
//   project: name, pillar, definition of done, due date
//   task:    label, project, status, when, estimate
//   note:    text, optional pillar

function CaptureSheet({ kind, initialText, aiClassified, suggestedProjectId, onClose, onSave }) {
  const PILLARS = [
    { id: 'arrow', label: 'Arrow' },
    { id: 'sunny', label: 'Slow Down Sunny' },
    { id: 'side',  label: 'Side Gigs' },
    { id: 'life',  label: 'Life' },
  ];
  const TASK_STATUS = [
    { id: 'todo',    label: 'To do' },
    { id: 'doing',   label: 'In Progress' },
    { id: 'waiting', label: 'Waiting' },
  ];
  const WORK_TYPES = [
    { id: 'deep',  label: 'Deep',  hint: 'Focus' },
    { id: 'admin', label: 'Admin', hint: 'Light' },
  ];
  const ESTIMATES = [5, 15, 30, 60];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const initialProject = React.useMemo(() => {
    if (suggestedProjectId && window.PROJECTS && window.PROJECTS[suggestedProjectId]) {
      return suggestedProjectId;
    }
    if (!window.PROJECTS) return null;
    const entry = Object.entries(window.PROJECTS).find(([id, p]) => p.status === 'active');
    return entry ? entry[0] : null;
  }, [suggestedProjectId]);

  const [draft, setDraft] = React.useState(() => {
    if (kind === 'project') return { name: initialText, pillar: 'arrow', dod: '', due: null };
    if (kind === 'task')    return { label: initialText, projectId: initialProject, status: 'todo', date: null, estimate: null, workType: null };
    return { text: initialText, pillar: null, projectId: suggestedProjectId || null }; // note
  });
  const [calOpen, setCalOpen] = React.useState(false);
  const [projPickerOpen, setProjPickerOpen] = React.useState(false);
  const [guessingProject, setGuessingProject] = React.useState(false);

  // For task/note: kick off a Claude project-guess in the background when the
  // sheet opens with text already in hand. The Free-form path may have already
  // supplied suggestedProjectId — if so, skip the second call.
  React.useEffect(() => {
    if (kind !== 'task' && kind !== 'note') return;
    if (suggestedProjectId) return;
    const text = (initialText || '').trim();
    if (!text) return;
    if (!window.PROJECTS || !window.claude || !window.claude.complete) return;

    let cancelled = false;
    setGuessingProject(true);
    const candidates = Object.values(window.PROJECTS)
      .filter((p) => p.status === 'active' || p.status === 'idea')
      .map((p) => `- ${p.id}: ${p.name}${p.pillarLabel ? ' (' + p.pillarLabel + ')' : ''}`)
      .join('\n');

    window.claude.complete({
      messages: [{
        role: 'user',
        content:
`Pick the project this ${kind} most likely belongs to from the list. If no project is a clear fit, return null in projectId — do NOT guess.

${kind === 'task' ? 'Task' : 'Note'}: ${text}

Projects:
${candidates || '(none)'}

Return ONLY JSON: { "projectId": "<uuid>" | null }`,
      }],
    }).then((raw) => {
      if (cancelled) return;
      try {
        const m = raw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(m ? m[0] : raw);
        if (parsed && parsed.projectId && window.PROJECTS[parsed.projectId]) {
          setDraft((d) => ({ ...d, projectId: parsed.projectId }));
        }
      } catch (_) {}
    }).catch(() => {})
      .finally(() => { if (!cancelled) setGuessingProject(false); });

    return () => { cancelled = true; };
  }, [kind, initialText, suggestedProjectId]);

  React.useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const overlayRef = React.useRef(null);

  const projectChoices = window.PROJECTS
    ? Object.entries(window.PROJECTS)
        .filter(([id, p]) => p.status !== 'idea' && p.status !== 'archived' && p.status !== 'done')
        .map(([id, p]) => ({ id, name: p.name, pillar: p.pillar, label: p.pillarLabel }))
    : [];
  const selectedProj = projectChoices.find(p => p.id === draft.projectId);
  const dateLabel = draft.date ? `${MONTHS[draft.date.m]} ${draft.date.d}` : 'No date';
  const dueLabel  = draft.due  ? `${MONTHS[draft.due.m]} ${draft.due.d}`  : 'No due date';

  const titles = {
    project: 'New project',
    task: 'New task',
    note: 'New note',
  };
  const placeholders = {
    project: 'Project name',
    task: 'What needs doing?',
    note: 'Capture your thought…',
  };

  const canSave = (
    (kind === 'project' && draft.name.trim()) ||
    (kind === 'task'    && draft.label.trim()) ||
    (kind === 'note'    && draft.text.trim())
  );

  return (
    <div className="sheet-overlay" ref={overlayRef} onClick={onClose}>
      <div className="sheet capture-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle"></div>

        <div className="capture-sheet-title">
          <span className="capture-sheet-kind">{titles[kind]}</span>
          {aiClassified && (
            <span className="capture-sheet-ai">
              <Icon.Sparkle />
              Sorted by AI
            </span>
          )}
        </div>

        {kind === 'project' && (
          <>
            <div className="sheet-header">
              <input
                className="sheet-label"
                value={draft.name}
                onChange={(e) => setDraft(d => ({ ...d, name: e.target.value }))}
                placeholder={placeholders.project}
                autoFocus={!initialText}
              />
            </div>

            <div className="sheet-row">
              <span className="sheet-row-label">Pillar</span>
              <div className="sheet-segs sheet-segs-3">
                {PILLARS.map(p => (
                  <span
                    key={p.id}
                    className={`sheet-seg ${draft.pillar === p.id ? 'on' : ''}`}
                    onClick={() => setDraft(d => ({ ...d, pillar: p.id }))}
                  >
                    <PillarDot pillar={p.id} size={6} />
                    <span style={{ marginLeft: 5 }}>{p.label}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="sheet-row">
              <span className="sheet-row-label">Due</span>
              <div className="sheet-when">
                <span
                  className={`sheet-chip ${calOpen || draft.due ? 'on' : ''}`}
                  onClick={() => setCalOpen(o => !o)}
                >
                  <Icon.Flag />
                  {dueLabel}
                </span>
                {draft.due && (
                  <span className="sheet-chip-clear" onClick={() => setDraft(d => ({ ...d, due: null }))}>×</span>
                )}
              </div>
              {calOpen && (
                <div className="sheet-cal">
                  <MiniCalendar
                    initial={draft.due ? new Date(draft.due.y, draft.due.m, draft.due.d) : undefined}
                    onPick={(pick) => { setDraft(d => ({ ...d, due: pick })); setCalOpen(false); }}
                  />
                </div>
              )}
            </div>

            <div className="sheet-row">
              <span className="sheet-row-label">Definition of done</span>
              <textarea
                className="sheet-note"
                placeholder="What does done look like?"
                value={draft.dod}
                onChange={(e) => setDraft(d => ({ ...d, dod: e.target.value }))}
                rows={2}
              ></textarea>
            </div>
          </>
        )}

        {kind === 'task' && (
          <>
            <div className="sheet-header">
              <input
                className="sheet-label"
                value={draft.label}
                onChange={(e) => setDraft(d => ({ ...d, label: e.target.value }))}
                placeholder={placeholders.task}
                autoFocus={!initialText}
              />
            </div>

            <div className="sheet-row">
              <span className="sheet-row-label">Project</span>
              <div className="sheet-when">
                <span
                  className={`sheet-chip ${projPickerOpen ? 'on' : ''}`}
                  onClick={() => setProjPickerOpen(o => !o)}
                >
                  {selectedProj ? (
                    <>
                      <PillarDot pillar={selectedProj.pillar} size={6} />
                      <span style={{ marginLeft: 6 }}>{selectedProj.name}</span>
                    </>
                  ) : guessingProject ? (
                    <>
                      <Icon.Sparkle />
                      <span style={{ marginLeft: 6, color: 'var(--text-faint)' }}>Guessing…</span>
                    </>
                  ) : <span style={{ color: 'var(--text-faint)' }}>Pick a project</span>}
                </span>
              </div>
              {projPickerOpen && (
                <div className="sheet-projects">
                  {projectChoices.map(p => (
                    <div
                      className={`sheet-project-row ${draft.projectId === p.id ? 'sel' : ''}`}
                      key={p.id}
                      onClick={() => { setDraft(d => ({ ...d, projectId: p.id })); setProjPickerOpen(false); }}
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
              <div className="sheet-segs sheet-segs-3">
                {TASK_STATUS.map(s => (
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
                {ESTIMATES.map(m => (
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
              <span className="sheet-row-label">Type of work</span>
              <div className="sheet-segs sheet-segs-2">
                {WORK_TYPES.map(wt => (
                  <span
                    key={wt.id}
                    className={`sheet-seg sheet-seg-tall ${draft.workType === wt.id ? 'on' : ''}`}
                    onClick={() => setDraft(d => ({ ...d, workType: d.workType === wt.id ? null : wt.id }))}
                  >
                    <span className="sheet-seg-label">{wt.label}</span>
                    <span className="sheet-seg-hint">{wt.hint}</span>
                  </span>
                ))}
              </div>
              <div className="sheet-row-hint">Optional</div>
            </div>
          </>
        )}

        {kind === 'note' && (
          <>
            <div className="sheet-row" style={{ paddingTop: 8 }}>
              <textarea
                className="sheet-note capture-note-area"
                placeholder={placeholders.note}
                value={draft.text}
                onChange={(e) => setDraft(d => ({ ...d, text: e.target.value }))}
                rows={4}
                autoFocus={!initialText}
              ></textarea>
            </div>

            <div className="sheet-row">
              <span className="sheet-row-label">Project</span>
              <div className="sheet-when">
                <span
                  className={`sheet-chip ${projPickerOpen ? 'on' : ''}`}
                  onClick={() => setProjPickerOpen(o => !o)}
                >
                  {selectedProj ? (
                    <>
                      <PillarDot pillar={selectedProj.pillar} size={6} />
                      <span style={{ marginLeft: 6 }}>{selectedProj.name}</span>
                    </>
                  ) : guessingProject ? (
                    <>
                      <Icon.Sparkle />
                      <span style={{ marginLeft: 6, color: 'var(--text-faint)' }}>Guessing…</span>
                    </>
                  ) : <span style={{ color: 'var(--text-faint)' }}>None</span>}
                </span>
                {draft.projectId && (
                  <span className="sheet-chip-clear" onClick={() => setDraft(d => ({ ...d, projectId: null }))}>×</span>
                )}
              </div>
              {projPickerOpen && (
                <div className="sheet-projects">
                  {projectChoices.map(p => (
                    <div
                      className={`sheet-project-row ${draft.projectId === p.id ? 'sel' : ''}`}
                      key={p.id}
                      onClick={() => { setDraft(d => ({ ...d, projectId: p.id })); setProjPickerOpen(false); }}
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
              <span className="sheet-row-label">Pillar</span>
              <div className="sheet-segs sheet-segs-3">
                {PILLARS.map(p => (
                  <span
                    key={p.id}
                    className={`sheet-seg ${draft.pillar === p.id ? 'on' : ''}`}
                    onClick={() => setDraft(d => ({ ...d, pillar: d.pillar === p.id ? null : p.id }))}
                  >
                    <PillarDot pillar={p.id} size={6} />
                    <span style={{ marginLeft: 5 }}>{p.label}</span>
                  </span>
                ))}
              </div>
              <div className="sheet-row-hint">Both optional — leave blank to file in Inbox</div>
            </div>
          </>
        )}

        <div className="sheet-actions">
          <span className="chip ghost" onClick={onClose}>Cancel</span>
          <span
            className={`chip primary ${canSave ? '' : 'disabled'}`}
            onClick={() => canSave && onSave({ kind, ...draft })}
          >
            {kind === 'project' ? 'Create project' : kind === 'task' ? 'Add task' : 'File note'}
          </span>
        </div>
      </div>
    </div>
  );
}

window.CaptureSheet = CaptureSheet;
