// Next Moves panel — sits above Tasks on the Project view.
// Default state shows 1-3 obvious next actions derived from project data.
// Below a hairline, a quiet "Think it through" affordance expands the panel
// into a guided conversation for when the user is stuck.

function NextMoves({ projectId, projectData, tasks, onAddTask, onChangeStatus, onStatusNote }) {
  const [mode, setMode] = React.useState('collapsed'); // 'collapsed' | 'expanded'
  const [thread, setThread] = React.useState([]); // [{role:'claude'|'user', text, chips?}]
  const [thinking, setThinking] = React.useState(false);
  const [turn, setTurn] = React.useState(0);
  const [resolution, setResolution] = React.useState(null); // {kind, label}
  const [customText, setCustomText] = React.useState('');
  const [customOpen, setCustomOpen] = React.useState(false);
  const bottomRef = React.useRef(null);

  // Derive obvious next moves from project state.
  const openTasks = tasks.filter(t => !t.done);
  const nextMoves = React.useMemo(() => {
    const flagged = openTasks.filter(t => t.next);
    const withDue = openTasks.filter(t => t.due && !t.next);
    const plain   = openTasks.filter(t => !t.next && !t.due && !t.waiting);
    const picks = [...flagged, ...withDue, ...plain].slice(0, 3);
    return picks;
  }, [openTasks]);

  const progressPct = tasks.length
    ? Math.round((tasks.filter(t => t.done).length / tasks.length) * 100)
    : 0;

  // Build a thin project context blob for Claude — with the latest user
  // status note quote-prioritized above task state.
  const buildContext = () => ({
    name: projectData.name,
    outcome: projectData.dod || '(none set)',
    latest: projectData.latest || '',
    latestStatusNote: projectData.latestStatusNote || null,
    status: projectData.status,
    progress: `${tasks.filter(t=>t.done).length} of ${tasks.length} tasks done (${progressPct}%)`,
    tasks: tasks.map(t => `${t.done ? '[x]' : '[ ]'} ${t.label}${t.waiting ? ` (waiting on ${t.waiting})` : ''}${t.due ? ` due ${t.due}` : ''}`),
  });

  React.useEffect(() => {
    if (bottomRef.current && mode === 'expanded') {
      bottomRef.current.scrollTop = bottomRef.current.scrollHeight;
    }
  }, [thread, thinking, resolution, mode]);

  // ── Open the conversation ──────────────────────────────────────
  const openThread = async () => {
    setMode('expanded');
    setThread([]);
    setResolution(null);
    setTurn(0);
    setThinking(true);
    try {
      const ctx = buildContext();
      const prompt =
`You are Course, a thinking partner inside a project planning app. The user has tapped "Think it through" because the obvious next moves aren't landing. Your job: ask ONE short, sharp diagnostic question rooted in the actual state of this project (outcome vs. progress, stalled tasks, overdue items, etc). Then offer 3-4 short chip answers for common cases plus the implied "Let me explain" escape.

SOURCE PRIORITY: When the user has written a status note (USER STATUS NOTE below), treat that as ground truth and quote or paraphrase it tightly. Only fall back to inferred state when no note exists.

PROJECT CONTEXT
Name: ${ctx.name}
Outcome (definition of done): ${ctx.outcome}
Status: ${ctx.status}
Progress: ${ctx.progress}
${ctx.latestStatusNote ? `USER STATUS NOTE (most recent, treat as ground truth):\n"${ctx.latestStatusNote}"\n` : ''}Latest synthesis: ${ctx.latest}
Tasks:
${ctx.tasks.join('\n')}

Return ONLY JSON:
{ "question": "<one-line question, under 22 words, references specifics from above>",
  "chips": ["<3-5 word chip>", "<3-5 word chip>", "<3-5 word chip>", "<3-5 word chip>"] }`;
      const raw = await window.claude.complete({ messages: [{ role: 'user', content: prompt }] });
      const parsed = parseJson(raw) || fallbackFirstTurn(ctx);
      setThread([{ role: 'claude', text: parsed.question, chips: parsed.chips }]);
    } catch (e) {
      setThread([{ role: 'claude', text: fallbackFirstTurn(buildContext()).question, chips: fallbackFirstTurn(buildContext()).chips }]);
    } finally {
      setThinking(false);
    }
  };

  // ── Respond to a chip or typed answer ──────────────────────────
  const respond = async (answer, opts = {}) => {
    const ctx = buildContext();
    const updatedThread = [...thread, { role: 'user', text: answer }];
    setThread(updatedThread);
    setCustomOpen(false);
    setCustomText('');
    setThinking(true);

    // If this was a free-text answer, save it as a status note so future
    // Claude calls can quote-priority it.
    if (opts.freeText && onStatusNote) {
      onStatusNote(answer, 'think_it_through');
    }

    const transcript = updatedThread.map(m => `${m.role === 'claude' ? 'Course' : 'User'}: ${m.text}`).join('\n');
    const isResolveTurn = turn >= 1; // resolve on the 2nd response

    try {
      let prompt;
      if (!isResolveTurn) {
        prompt =
`You are Course, a thinking partner. Continue the conversation. Your reply must REFRAME the user's answer using the project's actual context (outcome vs. progress, specific tasks, what's overdue), then ask ONE follow-up question. Be sharp and specific, not generic. Under 30 words for the reframe.

PROJECT CONTEXT
Name: ${ctx.name}
Outcome: ${ctx.outcome}
Progress: ${ctx.progress}
${ctx.latestStatusNote ? `USER STATUS NOTE (ground truth):\n"${ctx.latestStatusNote}"\n` : ''}Tasks:
${ctx.tasks.join('\n')}

TRANSCRIPT
${transcript}

Return ONLY JSON:
{ "reframe": "<the reframe, under 30 words>",
  "followup": "<one short question>",
  "chips": ["<3-5 word chip>", "<3-5 word chip>", "<3-5 word chip>"] }`;
      } else {
        prompt =
`You are Course. Based on the conversation, propose ONE concrete system change that resolves the user's stuckness. Either a deliberately tiny next task right-sized to the diagnosis, OR a status change.

Rules:
- If the user is overwhelmed / avoiding / next-step-too-big → propose a TINY task (e.g. "Open the spreadsheet for 5 min", "Send one text").
- If the user signals not-a-priority or no-energy → propose a status change.
- Tasks should be ONE concrete action under 60 chars.

PROJECT CONTEXT
Name: ${ctx.name}
Outcome: ${ctx.outcome}
Progress: ${ctx.progress}

TRANSCRIPT
${transcript}

Return ONLY JSON:
{ "reframe": "<a brief closing reframe, under 25 words>",
  "resolution": { "kind": "task" | "pause" | "idea" | "review",
                  "label": "<task label if kind=task, otherwise a short reason>",
                  "hint": "<one-line context for the user>" } }`;
      }
      const raw = await window.claude.complete({ messages: [{ role: 'user', content: prompt }] });
      const parsed = parseJson(raw);
      if (!isResolveTurn) {
        const safe = parsed || fallbackSecondTurn(answer);
        setThread([...updatedThread, { role: 'claude', text: safe.reframe + ' ' + safe.followup, chips: safe.chips }]);
        setTurn(t => t + 1);
      } else {
        const safe = parsed || fallbackResolve(answer, ctx);
        setThread([...updatedThread, { role: 'claude', text: safe.reframe }]);
        setResolution(safe.resolution);
        setTurn(t => t + 1);
      }
    } catch (e) {
      if (!isResolveTurn) {
        const safe = fallbackSecondTurn(answer);
        setThread([...updatedThread, { role: 'claude', text: safe.reframe + ' ' + safe.followup, chips: safe.chips }]);
        setTurn(t => t + 1);
      } else {
        const safe = fallbackResolve(answer, ctx);
        setThread([...updatedThread, { role: 'claude', text: safe.reframe }]);
        setResolution(safe.resolution);
        setTurn(t => t + 1);
      }
    } finally {
      setThinking(false);
    }
  };

  // ── Apply a resolution and collapse ────────────────────────────
  const applyResolution = (override) => {
    const r = override || resolution;
    if (!r) return;
    if (r.kind === 'task') {
      onAddTask && onAddTask(r.label, { tiny: true });
    } else if (r.kind === 'pause' || r.kind === 'idea' || r.kind === 'review') {
      const statusMap = { pause: 'on-hold', idea: 'idea', review: 'next-up' };
      onChangeStatus && onChangeStatus(statusMap[r.kind]);
    }
    closeThread();
  };
  const closeThread = () => {
    setMode('collapsed');
    setThread([]);
    setResolution(null);
    setTurn(0);
    setCustomOpen(false);
    setCustomText('');
  };

  const addNextMoveAsTask = (t) => {
    onAddTask && onAddTask(t.label, { existing: true, id: t.id });
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className={`section nm-section ${mode === 'expanded' ? 'nm-expanded' : ''}`} data-screen-label="Next Moves">
      {mode === 'expanded' && (
        <div className="lbl-row">
          <span className="lbl">
            <Icon.Sparkle /> Next moves
          </span>
          <span className="action" onClick={closeThread}>Close</span>
        </div>
      )}

      <div className={`nm-box ${mode === 'expanded' ? 'expanded' : 'nm-box-quiet'}`}>
        {mode === 'collapsed' && (
          <div className="nm-stuck" onClick={openThread}>
            <Icon.Sparkle />
            <span>Stuck on this one? <span className="nm-stuck-cta">Think it through</span></span>
            <span className="nm-stuck-chev">›</span>
          </div>
        )}

        {mode === 'expanded' && (
          <div className="nm-thread" ref={bottomRef}>
            <div className="nm-thread-eyebrow">
              <Icon.Sparkle />
              <span>Thinking it through · {projectData.name}</span>
            </div>

            {thread.map((m, i) => (
              <div key={i} className={`nm-msg nm-msg-${m.role}`}>
                {m.role === 'claude' && <span className="nm-msg-dot"></span>}
                <div className="nm-msg-bubble">{m.text}</div>
              </div>
            ))}

            {thinking && (
              <div className="nm-msg nm-msg-claude">
                <span className="nm-msg-dot"></span>
                <div className="nm-msg-bubble nm-typing"><span></span><span></span><span></span></div>
              </div>
            )}

            {/* Chips for the most-recent claude turn, only when not thinking and no resolution */}
            {!thinking && !resolution && thread.length > 0 && thread[thread.length - 1].role === 'claude' && thread[thread.length - 1].chips && (
              <div className="nm-chips">
                {thread[thread.length - 1].chips.map((c, i) => (
                  <button key={i} className="nm-chip" onClick={() => respond(c)}>{c}</button>
                ))}
                {!customOpen && (
                  <button className="nm-chip dashed" onClick={() => setCustomOpen(true)}>Let me explain…</button>
                )}
              </div>
            )}

            {customOpen && !resolution && (
              <div className="nm-custom">
                <textarea
                  autoFocus
                  placeholder="In your own words…"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      if (customText.trim()) respond(customText.trim(), { freeText: true });
                    }
                  }}
                  rows={2}
                ></textarea>
                <div className="nm-custom-actions">
                  <span className="chip ghost" onClick={() => { setCustomOpen(false); setCustomText(''); }}>Cancel</span>
                  <span
                    className={`chip primary ${customText.trim() ? '' : 'disabled'}`}
                    onClick={() => customText.trim() && respond(customText.trim(), { freeText: true })}
                  >Send</span>
                </div>
              </div>
            )}

            {/* Resolution card */}
            {resolution && (
              <div className="nm-resolution">
                <div className="nm-resolution-eyebrow">Suggested next move</div>
                {resolution.kind === 'task' ? (
                  <>
                    <div className="nm-resolution-task">
                      <span className="nm-resolution-box"></span>
                      <span className="nm-resolution-label">{resolution.label}</span>
                    </div>
                    {resolution.hint && <div className="nm-resolution-hint">{resolution.hint}</div>}
                    <div className="nm-resolution-actions">
                      <span className="chip ghost" onClick={() => {
                        const next = prompt('Edit task', resolution.label);
                        if (next != null) setResolution(r => ({ ...r, label: next }));
                      }}>Edit</span>
                      <span className="chip primary" onClick={() => applyResolution()}>+ Add task</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="nm-resolution-status">
                      <span className="nm-resolution-label">
                        {resolution.kind === 'pause' && 'Pause this project'}
                        {resolution.kind === 'idea' && 'Demote to Idea'}
                        {resolution.kind === 'review' && 'Move to Under Review'}
                      </span>
                    </div>
                    {resolution.hint && <div className="nm-resolution-hint">{resolution.hint}</div>}
                    <div className="nm-resolution-actions">
                      <span className="chip ghost" onClick={closeThread}>Not yet</span>
                      <span className="chip primary" onClick={() => applyResolution()}>Confirm</span>
                    </div>
                  </>
                )}

                {resolution.kind === 'task' && (
                  <>
                    <div className="nm-escape-divider">Or, if this isn't the season for it</div>
                    <div className="nm-escape-actions">
                      <button className="nm-escape-btn" onClick={() => applyResolution({ kind: 'pause' })}>Pause project</button>
                      <button className="nm-escape-btn" onClick={() => applyResolution({ kind: 'idea' })}>Demote to Idea</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────
function parseJson(raw) {
  if (!raw) return null;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : raw);
  } catch (e) { return null; }
}
function fallbackFirstTurn(ctx) {
  return {
    question:
      ctx.progress.includes('0 of') || ctx.progress.startsWith('0 ')
        ? `Nothing started on "${ctx.name}" yet — what's actually in the way?`
        : `What's actually going on with "${ctx.name}"?`,
    chips: ["Not sure what's next", "Avoiding it", "Next step's too big", "Maybe not a priority"],
  };
}
function fallbackSecondTurn(answer) {
  const a = (answer || '').toLowerCase();
  if (a.includes('avoid') || a.includes('too big') || a.includes('overwhelm')) {
    return {
      reframe: "Cliff-edge problem. The goal is real but the step in front of you is too tall.",
      followup: "What's the smallest possible version that still counts?",
      chips: ['5 minutes of work', 'Just open the file', 'Send one message'],
    };
  }
  if (a.includes('priority') || a.includes('not now') || a.includes('later')) {
    return {
      reframe: "Honesty helps here — if it's not the season, parking it costs less than dragging it.",
      followup: "Pause for a date, or genuinely demote it?",
      chips: ['Pause it', 'Demote to idea', 'Keep going'],
    };
  }
  return {
    reframe: "Got it. Let's pick the lightest move that gets you off zero.",
    followup: "If you only did one tiny thing today, what would it be?",
    chips: ['Five-minute version', 'Ask someone', 'Park it for now'],
  };
}
function fallbackResolve(answer, ctx) {
  const a = (answer || '').toLowerCase();
  if (a.includes('pause')) {
    return { reframe: "Parking it cleanly is better than dragging it.", resolution: { kind: 'pause', label: 'Pause project', hint: 'Comes back when you set the date' } };
  }
  if (a.includes('idea') || a.includes('demote')) {
    return { reframe: "Off the active list, still in the room.", resolution: { kind: 'idea', label: 'Demote to Idea', hint: 'Lives in the ideas bin until you pick it up again' } };
  }
  return {
    reframe: "Tiny is the move. Just lower the bar enough to clear it.",
    resolution: { kind: 'task', label: 'Spend 5 minutes on the next step', hint: "Right-sized to get off zero — done in under 10 minutes" },
  };
}

window.NextMoves = NextMoves;
