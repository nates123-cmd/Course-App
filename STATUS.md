# Course — Build Status

Last updated: 2026-05-13

## Where we are

Course is usable end-to-end: Setup Flow ran, real Notion data is imported, Dashboard renders projects, Project Detail works with Claude-powered Next Moves and inline editing (DoD, due date, progress, task done). Writebacks to Notion are live for status / outcome / due date. The two visible gaps are Tasks Mode and Morning Pulse — both per spec build order, both planned next.

## Build order progress

| # | Item | Status |
|---|------|--------|
| 1 | Supabase schema + Edge Function + Setup Flow | ✅ Complete (6-step staged review, opt-in Notion writebacks) |
| 2 | Dashboard shell + Active Projects + Pillar color system | ✅ Complete |
| 3 | Project Detail + Next Moves (Claude) | ✅ Complete (V1) |
| 4 | Quick Capture + inbox processing | ✅ Complete — captures write to `course_captures`; Inbox view triages pending items with Claude batch classify (project/task/goal/note), per-card edit, Accept commits the entity, Dismiss closes. Header link shows pending count. |
| 5 | Tasks Mode + day grouping | ✅ Complete — drag-reorder, swipe push/done, cycle work type / effort, inline `+` add, day effort budget |
| 6 | Push-to-Reminders via Shortcuts | ✅ Complete (two-way) — Task Sheet has a Send to Reminders button that opens the `CourseAddReminder` Shortcut deeplink with `title\|date\|project\|notes` payload, then marks the task with a `reminders_uuid` marker so the sheet shows ✓ Sent on re-open. Settings → Reminders sync expands an in-place guide with the exact Shortcut specs, the Supabase endpoint, and a copy-anon-key button — covers both outbound (`CourseAddReminder`) and inbound (`CourseSyncIn`, posts new Reminders into `course_captures`, run on open via Personal Automation). |
| 7 | Morning Pulse + web push + expanded view | ⚠️ Partial — Claude-generated narrative + one question + wants-attention/on-pace lists, cached per-day to `course_pulses`. Web push notifications still deferred. |
| 8 | Monday Open flow | ✅ Complete — walks Active projects one at a time, three questions each (Yes/Push/Drop · next move · day chips), Claude batch-suggests next moves, commits to `course_reviews` with per-project timestamped `decisions_json`. "Yes" decisions auto-create `course_tasks`; "Drop" sets project to Archived + Notion writeback. |
| 9 | Friday Close + Still integration | ✅ Complete — Claude-written "The Read" narrative, computed Moved/Slipped sections, three textareas (drop/push-forward/surprised), Save-to-Still toggle that POSTs Q3 to Still's `reflections` table. "Review" link in dashboard header auto-routes by day of week (Mon-Thu → Open, Fri-Sun → Close); each flow has a "Switch to ___" link to swap manually. |
| 10 | Stall detection logic | ✅ Complete — `getStallInfo()` flags active projects with ≥7d idle + due within 30d. Dashboard rows show `!` + "Stalled Xd" in due column; At Risk stat count includes stalled. Project Detail shows a risk-bordered banner with last-move meta and a Mark addressed button that persists to `course_stall_states` and silences re-flagging for 7 days. Pulse `wants_attention` reason now reads "stalled Xd". Task-level analogue: `isTaskDrifting()` (≥3 forward reschedules) surfaces a `↻ N×` pill on task rows + a "Drifting" section in Pulse. Backed by `course_tasks.reschedule_count` + a Postgres trigger that auto-increments on `do_date` shifts forward. |
| 11 | Selective Notion import (paste-URL) | ✅ Complete — Settings → "Import a Notion page" opens a sheet that takes any Notion URL, parses the page ID (32-char or hyphenated UUID), `fetch_page`s via the Edge Function, auto-detects type from the parent DB (falls back to a manual Project/Goal/Task picker), shows a preview of name + key fields, warns if the page already exists in `course_*` tables, and writes the row on confirm. Projects jump to their Detail page post-import. |
| 12 | Goals strip refinement + Pillar color settings | ❌ Not started |
| 13 | Cross-app reads (Still, Tick) | ❌ V1.1+ |

## Beyond original build order

Real-use feedback drove these earlier than the build order would have:

- **Inline DoD editor** (formerly "Outcome") with Notion writeback to `Outcome` rich_text
- **Inline due-date editor** in meta row with native date picker + Notion writeback to `Due`
- **Manual progress override** — draggable slider, step 5, ticks at 25/50/75/100. Falls back to computed % of tasks done when null (label reads "Progress · auto")
- **Undo toast** after task done/reopen
- **Hierarchical Pillars→Areas in Setup Flow** — per-Area Pillar dropdown, honors user's Notion data model
- **Per-user data quirks handled** — Setup pulls Complete=false (not Task Status) since most user tasks have no status; includes unstatused projects + Paused / Under Review; unscoped tasks are first-class

## Architecture / direction decisions

- **Course owns active data; Notion → readable archive** — solidified by [Course owns everything direction](memory/feedback_course_owns_everything.md). New screens default to inline-editable with Course→Notion writebacks. Don't suggest "edit in Notion" for operational fields.
- **Layout discipline** — all spacing/sizing in CSS vars, no max-width on individual components; mobile-first 440px column today, V2 multi-column desktop reachable without rewrites.
- **Writeback fields so far**: project status, project outcome, project due_date, task status (+ Complete checkbox when status=done). Project progress is *not* written back (no clean target field; user's Notion has a `Completion` rollup that's auto-computed).

## Known V1 gaps

- Add-task on Project Detail uses a browser `prompt()` — needs inline editor.
- One hardcoded value: `1.5px` borders on task checkbox (off the integer spacing scale). Likely fine; flagged in spec discussion.
- Setup retry has no idempotency — if import fails partway through, retry duplicates. Workaround: truncate `course_*` tables + clear `course_setup_complete` localStorage key.
- No way to manually re-enter Setup once `course_setup_complete = true` (testing-only need).
- Service worker cache name still `course-v1`; hasn't been bumped despite many changes (no production deploy yet, so it doesn't matter — localhost bypasses SW).

## Schema changes since initial setup

Run these if you're setting up fresh (already in `schema.sql`):

```sql
alter table course_tasks add column notion_url text;
alter table course_projects add column progress_pct int check (progress_pct between 0 and 100);
alter table course_tasks add column day_order int;
```

## Next planned

**Tasks Mode** is next (build step 5). Then **Project Detail polish** (inline add-task editor, status edit), then **Morning Pulse** (build step 7 — first big Claude integration after Next Moves).

Notes added to spec V2 section that aren't in build order:

- **Project hierarchy (parent/child)** with Claude-assisted re-parenting ("Pickling nests under Cooking")
- **Idea resurfacing** — Pulse surfaces backburned Ideas when user has capacity
- **Calendar integration** (read-only) — Pulse + Monday Open read Google Calendar

## Where things live

- `index.html` — entire app (~2500 lines)
- `schema.sql` — Supabase schema
- `supabase/functions/course-notion-fetch/index.ts` — Notion proxy Edge Function (verify / search_databases / fetch_db_schema / query_db / fetch_page / update_page)
- `course-spec.md` — canonical product spec; mockups are visual source of truth
- `course-*.html` — mockups (dashboard, project detail, tasks mode, morning pulse, monday open, friday close)
- `dev-config.js` — gitignored; sets `localStorage['anthropic_api_key']` for local dev
