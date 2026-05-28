# Course — Build Status

Last updated: 2026-05-27

## Where we are

Course was rebuilt into a tighter **Triage + Project** model (started 2026-05-25). The new design is the source of truth; pre-redesign UI is archived in `_old_ui/` and will be deleted once everything is ported. Live at https://nates123-cmd.github.io/Course-App/, single-file PWA (one `index.html` + per-screen `.jsx` files via Babel CDN), shared Supabase project `xsmnfcmtbpeaccnyinkr`. Mobile-first 440px column, V2-ready for desktop multi-column (now landed — see below).

The ritual surfaces (Morning Pulse, Monday Open, Friday Close, Dashboard) from the V1 build are NOT in the new design. Open question whether any return in V2; for now Triage + Project carry the whole flow.

## Recent work (2026-05-28 session)

- **Loose pillar tasks in Triage.** Project-less tasks that carry a `pillar` now render in a "Tasks" card at the bottom of their pillar section (open only; done/dropped filtered out). Pillars that have only loose tasks (no projects) still get a section. Inline "+ Add task" appears in that card when ≥1 loose task exists; the FAB capture flow is the path for the first one.
- **Task → pillar OR project at capture.** The New-task sheet gained a Pillar segmented row. Picking a project auto-fills its pillar; picking a pillar clears the project (mutually exclusive). Project chip now shows "None — file to pillar" and has a clear ×. Saved tasks write `course_tasks.pillar` (only when no project).
- **`course_tasks.pillar`** — column already existed in the live DB but was missing from `schema.sql`; now synced + indexed (`migrations/2026-05-28_task_pillar.sql`). Pillar values are stored lowercase by the app and normalized to lowercase on read, so capitalized legacy values (`Sunny`, `Life`) still group correctly. SW bumped to `course-v25`.

## Recent commits (2026-05-27 session)

- **`142dab3`** — Fix project-switch leaking previous project's tasks/state. `usePersistedState` only reads localStorage on mount; switching projects kept the previous project's `tasks`/`dod`/`riff`/`dueDate`/`status` in state and the write-back effect was overwriting the new project's localStorage with the stale values. Remounting via `key={openProjectId}` on `<Project>` forces every initializer to re-read the correct project's keys. *Existing data may be corrupted from prior switches — keys `course-v2:project.<id>.tasks` etc.; `course_projects.outcome` in Supabase may also be wrong.*
- **`9228167`** — Hide completed tasks behind a `Completed (N)` toggle on Project view. Open tasks render as before; completed tasks collapse under a disclosure row that only appears when there's ≥1 done task. Defaults to closed on every project open.
- **`e316c79`** — Restrict mobile zoom (`maximum-scale=1.0`, `user-scalable=no`); surface task `due` strings on Triage `TaskRow`s; bump SW cache to `course-v23` so deployed PWAs pick up fixes on next open.
- **`aa4314d`** — Long-press drag-to-reorder active projects within each pillar in Triage. Holds for ~450ms to lift, drag to new slot. New `sort_order` column on `course_projects` (double precision, indexed); renumbered with 1000-spacing per affected pillar on each drop. Sortable.js via CDN. Optimistic local mutation + background Supabase write — only `reloadData` on failure. SW bumped to `course-v24`.

## Architecture / direction decisions

- **Course owns active data; Notion → readable archive.** Solidified by [Course owns everything direction](memory/feedback_course_owns_everything.md). New screens default to inline-editable with Course→Notion writebacks. Don't suggest "edit in Notion" for operational fields.
- **Layout discipline** — all spacing/sizing in CSS vars, no max-widths on individual components. Mobile single-pane (~440px), desktop master-detail with Triage left + Project right. Reflow happens on the outer panes only, not the cards. Per [Course layout discipline](memory/feedback_course_layout_discipline.md).
- **Stable persistence per project.** Anything stored under a `project.${projectId}.X` key must remount cleanly when projectId changes — `usePersistedState` is initializer-only on mount, so always pass `key={projectId}` to project-scoped components.
- **Writeback fields**: project status, project outcome, project due_date, task status (+ `Complete` checkbox when status=done), project pillar. Task creation creates a Notion page via the proxy. Progress not written back (no clean target field in user's Notion model — `Completion` is a rollup).
- **Suite cross-app reads**: Today reads `course_projects` (id, name, status, pillar, work_area, sort_order, last_activity_at, due_date, outcome) and `course_tasks` (id, project_id, title, status, effort, work_type, day_order, do_date, pillar, notion_url) via its `usePillars` hook. No realtime — Today refreshes on mount/visit. Sort, due-date chip, and outcome subtitle in Today are driven by Course writes.

## Surfaces

| Surface | Purpose | Notes |
|---------|---------|-------|
| **Triage** | Pillar-by-pillar board of active projects + ideas + on-hold + loose pillar tasks; capture sheet; queue of pending decisions for stalled projects | Long-press-drag reorder of active projects within each pillar; loose (project-less, pillar-tagged) tasks render at the bottom of each pillar |
| **Project** | Full project record — name, status, pillar, due, DoD, milestones, tasks, riff → AI proposal pipeline, status notes, next moves (Claude) | Completed tasks hidden behind a toggle; component remounts on projectId change |
| **Today** | Day-stripe of tasks with `do_date = today` from across projects | Single-column list in the new design |
| **Capture sheet** | Triage's `+` FAB — quick add of project / task / note (with Claude auto-classify) | Writes to `course_captures` (note) or directly to projects/tasks |
| **Settings** | Tweaks panel, accent picker, density, Notion + Reminders sync hooks | Surfaces in app shell |

## Data shape (current)

- `course_projects` — id, name, outcome (DoD), notes, status, priority, start_date, due_date, completed_date, pillar, work_area, goal_id, notion_url, progress_pct, created_at, updated_at, last_activity_at, **`sort_order`** (added 2026-05-27)
- `course_tasks` — id, project_id, title, status, do_date, completed_date, effort, work_type, type, notes, person_dependency, work_area, **`pillar`** (loose tasks filed to a pillar without a project; synced into schema.sql 2026-05-28), notion_url, day_order, reschedule_count
- `course_status_notes` — id, project_id, body, summary, source, created_at
- `course_milestones` — id, project_id, label, marker_state, target_date, sort_order
- `course_captures` — id, body, status (pending|imported|dismissed), pillar (added 2026-05-26)
- `course_goals` (V1-era; may be folded later)
- `course_pulses`, `course_reviews`, `course_stall_states` (V1-era ritual tables; not used by new UI; keep for now)

## Pick up here

**Unverified — confirm before doing more:**
- (2026-05-28) Loose pillar tasks + task-to-pillar capture: data-layer grouping was verified against live data (a `pillar=Sunny`, project_id-null, status=next task grouped under the `sunny` section and a done one was filtered out). The **UI was not visually clicked through** — confirm the "Tasks" card renders at the bottom of a pillar, the inline "+ Add task" commits, and the capture sheet's Pillar/Project mutual-exclusion behaves. There are currently no open loose tasks in the DB, so nothing shows until you create one (FAB → New task → pick a pillar, leave project None).
- The project-switch state-leak fix (`142dab3`) writes the right localStorage keys now, but prior switches may have **corrupted existing per-project localStorage and `course_projects.outcome` in Supabase**. Spot-check projects you've switched between recently. Affected keys: `course-v2:project.<id>.{tasks,dod,riff,due,milestones,status}`.
- The PWA had to be force-refreshed twice (close-reopen cycles) to pick up new bundles after the SW bumps. Confirm `course-v24` is the live cache via DevTools `caches.keys()` if anything looks like an old build.
- The long-press drag UI was wired but not yet tested by the user on mobile. Risks: drag glitches if Triage re-renders mid-drag (Sortable instances are destroyed/recreated on every Triage render — fine in theory but unverified under load). If you see "lift then snap back" or "tap opens project instead of drag," that's where to look.

**Explicitly open threads from this session:**
- No realtime Course → Today sync. Today refreshes on mount only. A Supabase realtime channel subscription on `course_projects` + `course_tasks` would close the gap. Out of scope unless asked.
- `_old_ui/` still on disk — nothing in the new code references it; safe to delete when the next person feels like cleanup.
- The Course Bar (V2 conversational command line described in `suite-context.md`) is not started.
- Ritual surfaces (Morning Pulse / Monday Open / Friday Close) — pending the open question whether any return in V2. No work in progress.

## Known gaps / V2

- **No setup-flow re-entry** — once `course_setup_complete = true`, no manual re-import. Mostly a dev-only need.
- **No realtime to Today** — Today picks up Course changes on its next refresh (mount). Realtime channel subscription is a future task.
- **Idea resurfacing, parent/child projects, calendar integration** — V2 (in spec).
- **Notion writeback for `sort_order`** — Course doesn't writeback project order to Notion (no target field; Course is the source of truth for ordering).
- **Cross-pillar reorder via drag** — out of scope for V1; status/pillar pickers still own that flow.

## Where things live

- `index.html` + `app.jsx` — shell, responsive layout, data load
- `triage.jsx` — Triage screen (pillars, ideas, queue, FAB, long-press reorder)
- `project.jsx` — Project detail (riff → AI proposal, tasks with hide-completed toggle, milestones, status log)
- `today.jsx` — Today list
- `next-moves.jsx` — Claude-powered next-action proposals on Project view
- `capture-sheet.jsx`, `overlays.jsx`, `tweaks-panel.jsx`, `settings.jsx`, `status-log.jsx`, `components.jsx` — supporting UI
- `projects-data.jsx` — legacy in-file seed (mostly unused after Supabase load)
- `supabase-client.js` — REST wrapper + `loadCourseData` shaping function
- `claude-shim.js` — direct Claude API calls
- `notion-writeback.js` — write-through to Notion via the Edge Function proxy
- `sw.js` — service worker (cache name bumped per deploy; currently `course-v25`)
- `styles.css` — design tokens + per-component styles
- `schema.sql` — source-of-truth schema (mirrors what's in Supabase)
- `migrations/*.sql` — incremental migrations applied via MCP / dashboard
- `supabase/functions/course-notion-fetch/` — Notion proxy Edge Function
- `dev-config.js` — gitignored; local Claude API key + dev Supabase URL/key
- `_old_ui/` — pre-redesign single-file PWA (will be removed once nothing references it)
