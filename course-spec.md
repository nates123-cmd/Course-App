# Course — App Spec

## What It Is

Course is a project execution PWA — the fifth app in a personal OS suite alongside Break (mind enrichment), Tick (behavioral tracking), Still (reflection), and Tide (intake tracking). Course owns the active middle layer between a goal and tomorrow's actions: projects in motion, the next moves on each, and the rhythm of starting and closing each week.

The core mechanic is **execution clarity** — what's active, what's stalled, what's the next physical action, and is anything quietly slipping. Course doesn't try to be Reminders (Reminders owns thin dated tasks) or Notion (Notion stays the notes/reference/ideation layer). Course is the cockpit between them.

Same stack as the other apps: single-file PWA, GitHub Pages, Supabase REST, direct Claude API browser calls, no build step. Shares the same Supabase project as Break, Tick, Still, and Tide.

---

## Design System

**Palette:** Warm dark (espresso) base with amber/copper accent. The name *Course* points at coffee/grounds/terrain — palette earns the name.

Dark mode (default):
- `--bg: #1c1814` — espresso background
- `--bg-elevated: #28221d` — cards
- `--bg-nested: #322a23` — nested elements
- `--border: #3a3128`
- `--text: #ede4d6` — warm off-white
- `--text-muted: #968878`
- `--text-faint: #5e5448`
- `--accent: #d49355` — amber
- `--accent-dim: #8a6238`
- `--risk: #d4644a` — burnt orange
- `--good: #8aa365` — muted sage

Light mode (system-following):
- `--bg: #f5efe4` — warm sand
- `--bg-elevated: #ebe3d3`
- `--bg-nested: #e0d7c4`
- `--text: #221c14`
- `--accent: #a86528` — burnt sienna
- (full set in mockups)

**Pillar colors** (for color-coding projects/goals — muted to fit the palette):
- `--pillar-arrow: #8aa3c4` — slate blue (work)
- `--pillar-sunny: #d4a86a` — warm gold (personal/wellness)
- `--pillar-side: #b884c4` — muted plum (creative/side work)
- Two reserved (sage, dusty rose) if more pillars are added

**Density:** Dense, scannable. Course is a cockpit, not a contemplative surface. Cards stack tight, project rows show two lines (name + due on row 1, tag + progress bar + % on row 2).

**Tone of voice (for all Claude-generated content):** Tight, imperative, parenthetical context only when it adds signal. Examples:
- ✅ "Confirm Casablanca lease terms with Cedric (sitting 6d)"
- ❌ "Confirm Casablanca lease final terms with Cedric — the contract review has been sitting since last week"
- ✅ "ECS slipped further than planned despite Monday's commitment."
- ❌ "I noticed that ECS didn't progress as much as we'd hoped, even though you committed to it on Monday."

Claude is the steady second voice in the cockpit, not a chatty assistant.

**Layout discipline:** V1 is mobile-first column (440px centered on desktop, matching the rest of the suite). V2 should be able to add a true desktop multi-column layout without rewrites — so individual components must render at any width. Rules, honored strictly:

- No `max-width` on cards or sections. Only the outer body container is width-constrained.
- All spacing and sizing (radii, paddings, gaps, font sizes) live in CSS variables. Hardcoded pixel values in component CSS are a smell.
- Components must not assume a fixed parent width or column count. A project row should look right in a 320px column or a 640px one.
- If a component genuinely requires mobile-specific assumptions to work, flag it as a deviation rather than silently coding it that way.

---

## Data Model

Course's Supabase tables (after the one-time Notion import):

**projects**
- id, name, outcome, **notes** (free-form text, nullable — long-form context/scratch separate from `outcome`/Definition of Done), status (active/idea/paused/done/archived/routine/under_review), priority (low/medium/high), start_date, due_date, completed_date, pillar (tag string), work_area (tag string), goal_id (FK), notion_url, progress_pct (int 0–100, nullable — manual override; when null Project Detail falls back to computed % of tasks done), created_at, updated_at, last_activity_at

`notes` vs `outcome`: `outcome` is the Definition of Done (the finish line, one sharp statement); `notes` is everything else — context, links, open questions, scratch thinking. They're deliberately separate fields so the DoD stays uncluttered. "Ideas" are just projects with `status='idea'`, so they get notes via the same field — no separate ideas table.

**tasks**
- id, project_id (FK, nullable), title, status (triage/next/in_progress/waiting/done/dropped), do_date, completed_date, effort (15m/30m/1h/2h+), work_type (scheduled/deep/admin), type (home/away), notes, person_dependency, reminders_uuid (for tracking what was pushed), notion_url (for status writebacks), created_at, updated_at

**goals**
- id, name, description, pillar (tag string), target_date, status, notion_url, progress_pct, current_state_label, created_at

**captures**
- id, raw_text, suggested_project_id (nullable), suggested_task_title, status (pending/processed/dismissed), created_at, processed_at

**pulses** (daily morning pulse history)
- id, date, narrative_text, breakdown_json (wants_attention + on_pace lists), one_question_text, one_question_answer, created_at

**reviews** (Monday open + Friday close)
- id, review_type (monday_open/friday_close), week_of (date), narrative_text, decisions_json, answers_json, pushed_to_still (bool), created_at

**stall_states** (which projects are flagged + Claude's last question)
- id, project_id (FK), flagged_at, last_question, dismissed_at

**Pillars and Work Areas** live as **tag strings** on projects, not separate tables. Aggregation happens at query time. Pillar colors are configured in app settings and stored client-side (5 slots: arrow/sunny/side/d/e).

### Pillar vs Area — the formal model

These two concepts are deliberately distinct and must not be conflated:

- **Pillar** — a *top-level life domain*. There are a small, fixed set (Arrow = work, Sunny = personal/wellness, Life = life-admin/other; two reserved slots). A Pillar is the highest grouping in every Course surface (dashboard "By Pillar", Monday Open walk order, Pulse grouping). Pillars are stable — they rarely change.
- **Area** (a.k.a. Work Area) — a *sub-grouping inside exactly one Pillar*. Examples: "Casablanca" and "Hiring" are Areas under the Arrow pillar; "Fitness" is an Area under Sunny. An Area belongs to **one and only one** Pillar. Areas are numerous and fluid.

**The hierarchy is strict: Pillar → Area → Project/Task.** Every Area maps up to exactly one Pillar. Every Project has at most one Area and at most one Pillar. A Task inherits its Pillar/Area from its parent Project; an orphan Task may carry its own `work_area` string.

**Derivation rule (single source of truth).** A Project's Pillar is *derived from its Area* via the **Area→Pillar map**, which is established during Setup Step 2 (each Notion Area's `Pillar` relation, user-overridable) and persisted client-side (`course_area_pillar_map` in localStorage). The map is the authority. Concretely:

- When a Project has an Area, its effective Pillar = `areaPillarMap[area]` (the stored `pillar` column is a denormalized cache, refreshed on Setup/import and on inline Area edits).
- When a Project has no Area, its Pillar is whatever was set directly (manual pillar pick), else "no pillar".
- An orphan Task's Pillar = `areaPillarMap[task.work_area]` when resolvable, else none.

All Pillar resolution in code goes through one helper (`pillarForArea(area)` / `effectivePillar(projectOrTask)`) so the rule lives in exactly one place. Aggregations, Monday Open ordering, and Pulse grouping all call it rather than reading `.pillar` directly.

**Why formalize:** earlier surfaces sometimes treated Area and Pillar as interchangeable free-text tags, which produced inconsistent grouping (a project showing under its Area name in one view and its Pillar in another). The map + single helper removes the ambiguity without introducing separate DB tables (still tag strings on rows; the structure lives in the map).

---

## Core Screens

### 1. Dashboard — Projects mode (default)

The home view. Top to bottom:

**Header** — "Course" (32px bold) + Review / History util links. Date below in muted text.

**Goals strip (collapsible)** — Bordered top and bottom by horizontal rules. Header reads "Aiming At · 3 goals" with a Show/Hide toggle. When expanded: horizontally-scrolling row of goal chips. Each chip has a 2px colored left edge in its Pillar color, the goal name, a thin progress bar, and a state label ("On track" / "Stalled" / "3 sketched"). User can collapse to reclaim space — preference persists.

**Mode toggle** — Two-segment pill: Tasks / Projects. Projects is default.

**Pulse card** — Amber left-accent stripe (3px). "MORNING PULSE" label in amber uppercase. 4-line narrative below in the standard tone register.

**Stats row** — Three cells: Active / At Risk / Done this wk. Big tabular numbers (26px), small labels.

**Active Projects section** — Section label with a "By Pillar" toggle action (alternate grouping). Pillar legend strip below shows current Pillars with their colors for quick identification.

**Project rows** — Two-line cards:
- Row 1: Pillar dot (colored) + project name (with `!` risk marker if applicable), due date right-aligned (red if at risk)
- Row 2: Work Area tag pill, thin progress bar, % done
- Tap → Project Detail

**Capture field** — Sticky at bottom: amber `+` icon + "Capture a thought…" placeholder.

### 2. Dashboard — Tasks mode

Same chrome (header, goals strip collapsed by default, mode toggle), different content:

**Pulse** — Today-focused tone: "5 tasks scheduled, mostly Admin. The deep-work block for ECS is the one that matters — protect it."

**Stats** — Today / This week / Done today (replaces Active / At Risk / Done this wk)

**Day headers** — Today (amber, highlighted) and Tomorrow (muted). Horizon ends at tomorrow. Anything further out lives in Project Detail. Tasks mode is *execution*, not planning.

Each day header includes:
- Day label + count: `Today · Wed May 13 · 5`
- **Effort budget** — sum of effort pill values (15m=15, 30m=30, 1h=60, 2h+=120), shown as `~Xh`. Total > 5h dims to muted amber as a soft warning. Recomputes on every add / edit / reorder / push.
- **Inline `+` button** — taps to expand a text input below the header. Enter saves a new task with `do_date` set to that day, `status='triage'`, `effort='30m'`, `work_type='admin'`, `project_id=null`, and `day_order = max(day_order)+1` for that day. After save the input clears + retains focus for fast batch entry. Escape closes.

**Day overload advisory.** The dimmed budget is too subtle when a day is genuinely overcommitted. When a day section crosses *any* of these thresholds — total effort **> 6h**, **> 8 tasks**, or work spread across **> 4 distinct projects** — Course renders a soft advisory banner directly under the day header (risk-tinted left border, not a modal, not blocking). It states the concrete numbers and a single recommendation, e.g. *"Today is heavy: 11 tasks, ~7.5h, across 6 projects. Consider pushing the lowest-priority project's tasks to a lighter day, or focus one project and triage the rest."* The recommendation is deterministic in V1 (template chosen by which threshold(s) tripped); it does not call Claude. The banner is informational — it does not auto-act. It disappears on its own once the day drops back under threshold (after the user pushes/triages). Only ever shown for Today and Tomorrow (the actionable horizon), never for "No date".

**Tasks within each day** — Date is the primary axis (user's workflow is date-driven). Under each day header, tasks render in two sub-groups:
- **Unscoped** — tasks with no project, flat list first
- **By project** — tasks grouped under a project header (Pillar dot + project name + count + sub-budget), clickable to jump to Project Detail.

Within each sub-group, tasks sort by `day_order ASC NULLS LAST, created_at ASC`. Drag-to-reorder is scoped to a single sub-group (drag won't move a task across sub-groups or across days; use swipe-push or task sheet for that).

### Task row interactions (Tasks Mode)

- **Tap on task title / body area** → if task has a project, jump to Project Detail; if unscoped, open Task Sheet for editing.
- **Tap checkbox** → toggle done, with undo toast (5s).
- **Tap work type chip** (`Deep` / `Admin` / `Scheduled`) → cycles to next in order Deep → Admin → Scheduled → Deep. Persists immediately.
- **Tap effort pill** (`15m` / `30m` / `1h` / `2h+`) → cycles in same way. Persists immediately.
- **Long-press anywhere on the row (~300ms hold)** → picks up the task for drag-reorder. Row gets `scale(1.02)` + shadow. A drop indicator (amber bar) shows where the task will land. Release commits the new `day_order` for all tasks in the sub-group.
- **Swipe right** (>80px) → "Push to tomorrow" (sets `do_date`=tomorrow, clears `day_order`). 3-second undo toast.
- **Swipe left** (>80px) → "Triage" (sets `status='triage'`). 3-second undo toast. Note: marking Done lives on the checkbox + the Task Sheet status picker; swipe-left isn't a second path for it.
- Sub-threshold swipe snaps back. Vertical scroll passes through to the browser. Native click is suppressed for ~350ms after any gesture activates so taps don't double-fire.

### Task Sheet

Bottom-sheet overlay invoked from any task row in either Tasks Mode or Project Detail. Shows:

- **Task title** (display, V1)
- **Project** — typeahead input backed by a `<datalist>` of all projects. Type to filter; pick an option to assign; clear to unassign. Typing an unknown name + Enter/blur → confirms and *creates* a new project (`status='idea'`), retroactively links this task to it, then jumps to the new project's detail page. Also shows an "Open [project] →" chip when one is assigned.
- **Work area** — same typeahead pattern as Project, backed by your imported Areas plus any free-text values already present on projects. No create-new branch; just save the typed value.
- **Status** — chip + tap-to-open picker with all 6 task statuses (Triage / Next / In Progress / Waiting / Done / Dropped). Save writes to Supabase + writes back to Notion's `Task Status` (with `Complete=true` on Done).
- **Do date** — native date picker **with a "Clear" button beside it**. Setting a date or clearing it both save to Supabase + write back to Notion's `Do date` (clear → Notion date set to null). Clear exists because native date inputs have no reliable cross-platform "empty" affordance, and "this task has no scheduled day" is a legitimate, common state (it drops the task into the date-driven backlog rather than a day).
- **Effort** — a row of four chips (`15m` / `30m` / `1h` / `2h+`) plus a "Clear" chip. Tapping a chip sets `course_tasks.effort`; tapping the current one or "Clear" unsets it. Persists immediately. This is the same field the Tasks-mode effort pill cycles, surfaced here so effort can be set from any context where the Task Sheet opens (Project Detail, Monday Open open-tasks, Pulse), not only by cycling in Tasks mode. No Notion writeback (Effort is a Course-side planning field).
- **Meta chips** — type, person dependency (display, V1)
- **Notes** — **inline editable**. Shows the note text (or "Add a note…" when empty) with an Edit/Add control; tapping opens a textarea with Save/Cancel that writes `course_tasks.notes`. Course-only, no Notion writeback (free-form notes have no stable Notion property; Course owns them). Works from every surface the Task Sheet opens (Tasks mode, Project Detail, Monday Open open-tasks, Pulse).

Notion writebacks for project/work_area re-assignment are deferred — relation writebacks need Notion page IDs we don't keep in state. Course is authoritative; Notion drifts on those relations until selective re-import.

Closes via X button, backdrop click, or Esc. V1.1 will add inline editing for title.

### 3. Project Detail

What you see when you tap a project from the dashboard.

**Back nav** — `‹ Projects` left, `Edit` + `Notion ↗` right. The Notion link deeplinks via stored `notion_url`.

**Identity lineage** — Pillar dot + Pillar name + Work Area + Goal in one line, comma-separated by middle-dots.

**Project title** — Large (26px bold).

**Status chip** — Sits between the title and the Definition of Done block. Shows the current status (Active / Idea / Paused / Routine / Under Review / Done / Archived) with a caret. Tap → inline chip picker appears below; tap an option → saves to `course_projects.status` and writes back to Notion's `Status` select. Active gets accent-color; Done gets sage; Paused/Archived are muted.

**Definition of Done block** — Small dedicated card. "DEFINITION OF DONE" label, then the statement in body text. This is the navigation star — what success/completion looks like. Inline editable; saves to `course_projects.outcome` (DB field name preserved) and writes back to Notion's `Outcome` rich_text property.

**Notes block** — A second small card directly below Definition of Done, same anatomy: "NOTES" label + Edit/Add control, body text (or "Add a note…" muted placeholder when empty), tap → textarea with Save/Cancel. Saves to `course_projects.notes`. This is the free-form context layer — links, open questions, scratch thinking — kept separate from the DoD so the finish line stays sharp. Course-only, **no Notion writeback** (notes are freeform and have no stable Notion property; this is the field where Course, not Notion, owns the long-form layer). Because ideas are projects with `status='idea'`, idea projects get the same Notes block — no separate surface needed.

**Meta row** — Three small cells: Due / Progress / Last move. Due is inline editable (opens the native date picker).

**Progress** — In the meta row, Progress shows the value as a tappable display. Default is computed % of tasks done with the label reading "Progress · auto" to flag it as derived. Tap the value to expand a full-width slider beneath the meta row (step 5, tick markers at 25/50/75/100). Drag updates the fill bar + meta-cell value live; release saves to `course_projects.progress_pct` and auto-collapses the slider. Manual override takes priority on subsequent renders. Tasks aren't equal-weight, so manual is the honest default once the user dials it in — but the slider is opt-in tap-to-reveal, not always-visible.

**Next Moves panel (the hero)** — Amber left-accent stripe. "NEXT MOVES" label + ↻ Refresh action. 1-3 Claude-generated suggestions in tight imperative form with parenthetical context. Each has a `+ Task` button to promote it.

**Tasks section** — Header: "Tasks · 6 open" + toggle between **By status** (In Progress / Next / Waiting; Triage/Done collapsed) and **By date** (Today / This week / Later / No date). Same task row anatomy as Tasks mode dashboard. Tapping the row body (not the checkbox) opens the [Task Sheet](#task-sheet).

**Add a task** — Dashed-border button at bottom of task list.

**Done collapsed** — "▸ 4 completed tasks" tap-to-expand.

**Capture** — Same as dashboard but placeholder context-aware: "Capture a note on this project…"

### 4. Morning Pulse expanded view

What opens when the user taps the 7am push notification — or, until web push lands, when they tap the pulse card on the dashboard. The pulse is generated by Claude once per day and cached to `course_pulses` (one row per date). Re-generating overwrites the day's row. The narrative + one question are Claude-authored; the wants-attention / on-pace breakdown is computed client-side from project state and stored in `breakdown_json`.

**Header** — Small `‹ Dashboard` back link + History util.

**Pulse label** — "MORNING PULSE" in amber uppercase.

**Date** — "Wed, May 13" in large display weight. "Week 20 · Day 3" below in muted.

**Narrative** — 4-line status read. Body text size (17px), tight tone register. The "headline" of the day.

**Wants Attention section** — Tappable rows showing at-risk and stalled items with Pillar dots, name, and metadata in risk color. **Each project row nests its open tasks below it** (indented with a left border) so the user sees both the at-risk projects and the actual tasks under them at once. Tasks show title + do-date (today/overdue colored). Tap a task checkbox → toggle done; tap a task row → opens the Task Sheet.

**On Pace section** — Same row + nested-tasks pattern, metadata in good (sage) color for things moving well.

**No project section** — Unscoped tasks (no `project_id`) with `do_date` ≤ tomorrow get their own group at the bottom. Same checkbox + open-sheet interactions.

**One Question card** — Amber left-accent. "ONE QUESTION" label. A single forcing-function question Claude generates from project state.

The card has two interactive layers:
1. **Pre-proposed action** (optional) — Claude can include a constrained bulk action with the question (push tasks to tomorrow / mark done / pause projects / triage). Tap to confirm + execute. IDs are validated against the prompt input — Claude can't invent task or project IDs.
2. **Answer textarea** — the user's response is a *directive to Claude*, not a journal entry. On "Send", Course rebuilds the context (question + user's response + current open tasks/projects with IDs) and asks Claude for a follow-up action that satisfies the response. Claude returns either an action (replaces the pre-proposed one) and/or a one-sentence reply confirming what it understood. Same validation rules apply.

Skip closes the view without acting. IDs never leak into the narrative or reply (defensive scrubbing both at prompt-time and at render-time).

**Mark as read** — Quiet button at the very bottom. Closing is a gesture, not a swipe-away.

### 5. Monday Open

Guided weekly setup flow. Push notification fires Monday morning at user-set time.

**Progress bar** at top showing position in the flow.

**Step meta** — Counts *down*: `"5 projects left"` while walking projects (excludes the current project from the count). Falls through to `"Orphan tasks"` and `"Review"` on the final steps. "Save & exit" link sits on the right.

**Flow header** — "MONDAY OPEN" label + "Set the week" title. No subtitle — the flow is self-explanatory and the user doesn't need a reminder of the format on every screen.

**Current project card** — Pillar lineage strip, **editable project name** (tap → inline input → PATCH `name` + Notion writeback), state row (**editable Due** chip / % done / last move), outcome reminder below a divider.

**Project order** — Active projects are sorted by Pillar (Arrow → Sunny → Life → other) → Work Area (alphabetical) → name. A section banner above each project card shows `PILLAR · Area · N of M` so the user always sees which area they're walking through. **Decisioned-then-revisited projects** (when navigating back) get a sage ✓ chip next to the position counter so the user can see they've already committed a decision for this one.

**Two questions per project** (down from three — see "Per-move scheduling" below):

1. **Still active this week?** — Chips: Yes / Push / Drop
   - **Yes** — project stays active, gets the next-move tasks committed.
   - **Push** — sets `status='idea'`. Project drops off the active walk; resurfaces only via Worth-a-Look (V2) or the user editing it back to active.
   - **Drop** — sets `status='archived'`. Project disappears from Course's surfaces.
2. **What's the next move(s) this week?** — Suggested move from Claude in a small bordered row with "Use ›" (appends to the list). Below that: any moves already added (one row each, with a tiny day chip + 📲 reminders button per row), then a **unified composer** at the bottom: one textarea with two actions — `+ Add` (treats the whole text as one move) and `↻ Parse` (sends the text to Claude to extract multiple moves). The previous separate "Brain Dump" panel is gone.

**Per-move scheduling.** Each next-move row carries its own day chip — defaults to today, picker offers Today / Tue / Wed / Thu / Fri / Sat / Sun + an "Other…" native date input for things further out. The previous Question 3 ("When this week?") is removed; date lives on each move, not on the project decision. The schedule's commit semantic stays the same: each move becomes its own `course_tasks` row with `status='next'`, `project_id=current project`, and `do_date=row's date`.

**Per-move Reminders push.** Each next-move row has a 📲 button. Tap → Course commits *that move's* task immediately (so it has an id, project, and due date), then fires the existing `CourseAddReminder` Apple Shortcuts deeplink with the title/date/project payload. After push, the move row shows "✓ Sent" and the task's `status` flips to `pushed` (mirroring Reminders ownership). This lets the user fire off thin tasks to Reminders mid-flow without leaving Monday Open.

**Open tasks block** — Above the decision chips, Course shows the project's existing open tasks (cached during suggestion fetch). Each row is **editable**: tap the row body → opens the Task Sheet (the same one used everywhere else). Date column always renders ("no date" italic when null). The checkbox on the left still marks done in place.

**Add a new project mid-flow.** Monday Open isn't only a walk of existing active projects — new commitments surface *during* the weekly think. A persistent **"+ New project"** action sits in the flow (above the bottom nav). It opens an inline form: name (required), Definition of Done (optional), and a Pillar/Area picker. On save, Course POSTs the project with `status='active'`, inserts it into the in-flow project list and the step sequence (at the end of its Pillar group, or end of the project walk if no pillar), initializes its decision (default `yes`), and jumps straight to its project step so the user can set next moves immediately. The new project also lands on the dashboard like any other.

**Idea-stage review step.** After the active-project walk (and before the summary), Course inserts a single **Idea review** step listing all `status='idea'` projects (these include anything Pushed in prior weeks). It's deliberately lightweight — no next-move capture, just a triage decision per idea with three chips:

- **Activate** — `status='active'` (+ Notion writeback). The idea becomes a real commitment; it'll appear in next week's active walk. (V1 doesn't retroactively inject it into *this* week's walk — Activate is a declaration, not a same-session task-capture.)
- **Keep idea** — no-op; stays `idea`, resurfaces next Monday.
- **Drop** — `status='archived'` (+ writeback).

This is the V1 seed of the V2 "Worth a Look" idea-resurfacing surface — it gives backburned ideas a guaranteed weekly moment without forcing them into the active view.

**Orphan task review — monthly cadence, capped.** Reviewing every loose unscoped task every single week is noise: many orphan tasks are deliberately thin and belong in Reminders, not in a weekly project triage. So:

- The per-pillar orphan-task review steps are included **only on the first Monday Open of the calendar month** (tracked by checking whether a committed `course_reviews` monday_open row exists for any earlier week in the current month — first run of the month = include).
- Even then, the orphan set is **capped at 12 tasks**, prioritized by oldest `do_date` (nulls last) then highest reschedule count — the ones most likely to be genuinely stuck, not just thin.
- On off-month Mondays the orphan steps are skipped entirely; the summary shows a quiet line: "Orphan task review is monthly — next on <first Monday of next month>."

When included, the review still works per-pillar (interleaved with that pillar's projects): the user reviews orphan tasks in the *pillar context that just got reviewed*. Each row has a project dropdown (pre-filled with Claude's pick, scoped to projects in this pillar) + a Map button. Tasks without a discernible pillar end up in a final catch-all task step before the summary. The single-screen task review at the very end is no longer the pattern — split per pillar so the user reviews in context.

**Undo a just-committed project decision.** Because effects commit incrementally on each Next (tasks created, status flipped to archived/idea), an accidental Drop/Push or a wrong set of moves needs a fast escape hatch. After each project step's Next commits, Course shows a toast: *"Committed <project>. Undo"* (≈6s). Undo reverts that single project's commit — deletes the tasks it created (except any already pushed to Reminders, which stay, since they now live in the user's Reminders), restores the project's prior `status` (+ reverses the Notion writeback), clears the decision's `timestamp`, and steps the flow back to that project. It's the same revert machinery the idempotent re-commit already uses, exposed as an explicit user action.

**Sticky bottom nav** — `‹ Back` + `Next project ›` primary button.

Decisions stored in `reviews` table on completion. Output: defined week, scheduled next moves with do dates set.

**`reviews.decisions_json` schema for Monday Open.** The field is an array of per-project decision records — *not* a final aggregate. This preserves decision history for cross-week pattern detection (the V2 Resurfacing feature reads this to find projects pushed in 3+ consecutive Monday Opens).

```json
{
  "decisions": [
    {
      "project_id": "uuid",
      "decision": "yes" | "push" | "drop",
      "moves": [
        { "title": "short imperative", "do_date": "YYYY-MM-DD" }
      ],
      "timestamp": "ISO 8601 timestamp"
    }
  ]
}
```

Each entry corresponds to one project the user reviewed during the flow. `moves` is an *array* of `{ title, do_date }` pairs — Monday Open supports multiple next moves per project (added one at a time, or via the unified composer's paragraph→Claude extractor). Each entry becomes its own `course_tasks` row on commit with `do_date` taken from the move record. `timestamp` is the moment the user committed that project's decision (when they tapped Next from that project's step). This lets future queries answer questions like "how many consecutive Monday Opens has Project X been pushed?" without having to reconstruct from the full review narrative.

Idea-review decisions are recorded alongside, under a separate `idea_decisions` key so they don't pollute the active-project history used by Resurfacing pattern detection:

```json
{
  "decisions": [ /* …active project records as above… */ ],
  "idea_decisions": [
    { "project_id": "uuid", "decision": "activate" | "keep" | "drop", "timestamp": "ISO 8601" }
  ]
}
```

**Definition of Done — inline editable.** The project card's DoD section is tap-to-edit. Empty DoD shows "No Definition of Done set. Tap to add." Saving PATCHes `course_projects.outcome` and fires the Notion writeback. Editing this from Monday Open is the friction-removing path: when a project lacks a DoD, you can fix it without leaving the flow.

**Auto-save per step.** Every Next, Back, decision change, next-move add/remove, suggestion accept, task-map, and Save & exit writes the in-progress flow to `localStorage` keyed by the current Monday's date (`course_monday_open_draft_<week_of>`). On re-entry, the draft is merged over the freshly-initialized defaults — step, decisions, and task assignments restore exactly where you left off. The draft clears automatically on successful commit. Closing the tab, refreshing, or tapping Save & exit all preserve progress.

**Incremental commits.** Each Next click and Save & exit pushes *that step's* effects to Supabase immediately — not at the final summary. For a project step: tasks are created from the move rows, project status is flipped per the decision (Drop→archived, Push→idea), the `course_reviews` row is upserted with the latest `decisions_json`. For the idea-review step: each idea's status change is PATCHed (+ writeback). For the task-review step: orphan-task → project assignments are PATCHed. Going Back to a previously-committed project step and tapping Next again is idempotent — the prior commit's tasks are deleted (and status reverted if applicable) before re-applying. The final summary step is now confirmation-only; effects are already in place. The per-step Undo toast (above) is the user-facing handle on this same revert path.

### 6. Friday Close

Guided weekly closeout. Push notification fires Friday afternoon at user-set time. Different shape than Monday — by Friday you've lived the week, so it's reflective, not transactional.

**Step meta** — "Week 19 · May 5 – May 11" + Save & exit.

**Flow header** — "FRIDAY CLOSE" + "Close the week" + subtitle.

**The Read** — Amber-accented narrative card. Claude's week-in-review tying back to Monday's commitments. The most evocative writing in the app: "Strong week on Morocco — three milestones moved, hiring on schedule. ECS slipped further than planned despite Monday's commitment."

**Stats** — Tasks done / Pushed / Dropped (tabular numbers).

**Moved section** — Projects that progressed, with +% gains in good color.

**Slipped section** — Projects that stalled or fell short of Monday's plan, in risk color.

**Didn't get done section** — The honest accountability view: what was *committed Monday and remains undone*. Course reads this week's `course_reviews` monday_open `decisions_json`, takes every project with `decision='yes'`, and checks each committed move's task. A move "didn't get done" if its `course_tasks` row is still open (not `done`, not `dropped`) or was pushed past `weekEnd`. The section lists each such project with its specific unfinished move titles ("Confirm Casablanca lease terms — still open"), plus any active project that had **zero task completion all week** (the pure no-movement case the old Slipped heuristic approximated). This is distinct from Slipped: Slipped is "stale by idle-days"; Didn't-get-done is "you said you would, and didn't." Both feed The Read so Claude's narrative can be specific about broken commitments rather than vague.

**Three closing questions** (textareas, longer-form than Monday's chips):
1. **What to drop?** — placeholder: "Be honest — what's not yours this season…"
2. **What to push forward?** — placeholder: "What carries into next week…"
3. **What surprised you?** — placeholder: "A reflection — easier than expected, harder than expected, unexpected energy…"

**Save reflection to Still** — Pre-checked checkbox option. Question 3's answer pushes to Still as a weekly entry.

**Close the week** — Full-width amber primary button.

---

## Adding Things — Capture and Contextual Add

Course has two entry points for creating content:

### 1. Floating `+` FAB (bottom-right of the viewport)

For anything that doesn't fit a current section context. Tap the FAB → small menu pops up with three options. Tap one → opens a creation sheet:

- **Thought** → multi-line textarea → Save to inbox. Lands in `course_captures` with `status='pending'`. The Capture Inbox triages it later (Claude classifies, user accepts/dismisses).
- **Task** → title + project (typeahead, creates the project if name doesn't match) + do_date. Saves to `course_tasks` with `status='next'`.
- **Project** → name + Definition of Done. Saves to `course_projects` with `status='idea'`, then jumps you to the new project's detail page so you can fill in the rest.

The FAB is hidden during the Setup Flow. The menu and sheet close on view changes.

Note on the simplified type set: previous spec had 5 chip types (Project / Task / Goal / Idea / Thought). The Goal flow happens via Inbox triage when Claude classifies a thought as a goal; Idea is folded into Thought (anything in the Inbox is an "idea" until you accept it). Three FAB types keeps the menu honest about the user's actual moment-of-capture intent.

### 2. Contextual Add (per-section)

For when the user knows exactly what they're adding and where.

- **Dashboard Projects mode**: small `+` next to the "Active Projects" section label → adds a project directly (skip type selection)
- **Dashboard Tasks mode**: small `+` next to the "Today" day header → adds a task with do_date=today and project_id=null, user can assign project after
- **Project Detail**: existing "Add a task" dashed button at the bottom of the task list adds a task scoped to that project (project_id pre-filled)
- **Goals strip**: small `+` at the end of the horizontal scroll → adds a goal
- **Capture inbox view** (when it exists): `+` to add an idea/thought directly without going through quick capture

All contextual adds skip the type selector since context declares the type. They use inline input rather than a modal where possible — less interruption.

### Visual treatment

- Top-right `+` button matches the header utility links in size and tone (text color, no background). On tap, scales briefly.
- Section-level `+` icons are 16px, in `--text-muted` color, sit inline with section labels
- The bottom Quick Capture field stays prominent (amber `+` icon) — it's the universal fallback

### Why two paths

The bottom field optimizes for *speed of capture*. The top `+` button optimizes for *intentional routing*. Contextual adds optimize for *zero friction when context is clear*. All three exist because they serve different moments in how you actually use the app.

---

## Setup Flow

Course's first-run flow is a staged, review-driven import — not an automatic dump. The goal is for Course to launch in a *clean* state, not inherit Notion's accumulated clutter.

### Step 1 — Connect Notion
- User generates a Notion internal integration token, shares Projects/Tasks/Goals/Work Areas/Pillars databases with it, pastes token into Course
- Token stored as Supabase Edge Function env var (`NOTION_TOKEN`)
- Edge function (`notion-fetch`) verifies access by fetching DB schemas

### Step 2 — Review Pillars and Work Areas
- Course fetches Pillars and Work Areas from Notion. The data model is hierarchical: each Area belongs to one Pillar (via a `Pillar` relation on the Area in Notion).
- **Pillars** render as a checkboxed list with a slot picker (arrow/sunny/side/d/e). Default: all checked (top-level).
- **Areas** render as a checkboxed list with a per-Area Pillar dropdown. The dropdown is pre-filled from each Area's Notion `Pillar` relation; user can override. Default: all unchecked (force a deliberate pick).
- Skipped Areas stay in Notion but aren't pulled into Course — useful when Areas are used at both project and note level and only project-level ones belong here.
- Output: tag vocabulary + Area→Pillar mapping for Course's `projects` table. When importing a project (Step 4), its `pillar` and `work_area` strings are derived from the project's Area and that Area's mapped Pillar — Notion's project-level Pillar rollup is *not* read directly.

### Step 3 — Review Goals
- Course fetches all goals
- Lists them with their current state from Notion (target date, related projects count)
- User checkboxes: import, skip, or archive in Notion
- Default: all goals unchecked — force a deliberate choice
- "We found 12 goals. Which still reflect what you care about?" framing

### Step 4 — Review Projects
- Course fetches all projects with `status IN [Active, Idea, Routine, Paused, Under Review]` OR `status is empty`. All "alive" statuses are included so Step 5 can resolve tasks to their parent project — Done/Archived are excluded as intentionally retired.
- Groups by status: **Active → Idea → Routine → Paused → Under Review → Unstatused**. Shows: name, outcome, last activity, current Pillar/Work Area.
- Per-project checkbox.
- Default: Active checked. Everything else unchecked (force a deliberate pick).
- Bulk action: "Archive all unchecked Idea projects in Notion" (yes, writes back). Other status groups stay in Notion untouched.
- "We found X projects. Which are actually moving?" framing.

**Caveat — tasks tied to Done/Archived projects.** Tasks whose parent project is Done or Archived will appear under "Unscoped" in Step 5 (since their project wasn't pulled in). Acceptable tradeoff for V1; pulling the full project history would slow setup and bloat state.

### Step 5 — Review Tasks
- Course fetches **all open tasks** by filtering `Complete = false` — *not* by Task Status. Most of the user's tasks have no Task Status set (workflow is date-driven, tracked via Complete checkbox + do-date). Filtering by status would silently drop the majority.
- Tasks are organized into three top-level groups:
  1. **No project** — tasks with no project relation at all. Rendered *first*, since the user's workflow is date-driven and orphan tasks are often the most important to capture.
  2. **Under imported projects** — grouped per project, ordered Active → Idea → Routine → Paused → Under Review → Unstatused (mirrors Step 4).
  3. **Under projects you didn't import** — tasks whose parent project exists in Notion but the user chose not to import. Sub-grouped by project name with a status badge (e.g., "Paused"). Surfaces *why* a task is in this section rather than hiding it under "Unscoped." User can either skip these tasks or go back to Step 4 and check the project.
- Within each project sub-group, sorted by `do_date` ascending (nulls last).
- Each row shows task name, meta line: status (if set) · do-date · effort · person-dependency · last-edited.
- Per-task checkbox.
- Default: imported unless Task Status is `Triage`, `Done`, or `Dropped`. (`Done` and `Dropped` with `Complete=false` are inconsistent state — usually status got set but the checkbox was forgotten; user can opt in if they care.)
- Bulk action: "Mark unimported Triage tasks as Dropped in Notion at end of setup."

### Step 6 — Confirm and Import
- Final summary: "Importing X projects, Y tasks, Z goals. Skipping N items. Archiving M items in Notion."
- User confirms; Course writes to its Supabase tables and pushes archive writes back to Notion via the same Edge Function
- Each Course project retains a `notion_url` pointer back to Notion

### After Setup
- Notion stays as notes/reference for everything not imported
- Notion stays as the historical record for everything that was imported (Course doesn't delete from Notion)
- Selective Import (paste-URL flow) is the ongoing path for new things crystallizing from Notion ideation → Course execution

### Why staged

An auto-dump import would land Course in Notion's current state — accumulated, partially-stale, overwhelming. The setup flow is the moment to be honest about what's actually active. Notion gets cleaned up as a side effect. Course launches lean.

### Writing back to Notion

Despite "Course owns active data, Notion stays reference" being the steady-state rule, the setup flow is the *one exception* where Course writes to Notion — specifically to mark unimported items as Archived/Dropped. This is opt-in per item, surfaced clearly, and only happens once (during setup). After setup, Course never writes to Notion again.

---

## Other Features

### Selective Import (ongoing)

User pastes a Notion page URL into Course's import field. Course fetches the page, classifies it (project / task / goal), shows a preview, user confirms or edits. Item lands with `notion_url` pointer preserved. Original Notion page is left in place.

### Push to Reminders

Apple Shortcuts deeplinks (`shortcuts://run-shortcut?name=CourseAddReminder&input=...`). User installs a one-time Shortcut that takes `title|YYYY-MM-DD` as input. Course generates the deeplink, iOS handles the rest. Reminders land in the default Reminders list — lean, just title and date. Course stores `reminders_uuid` on the task and shows "✓ Sent" pill after push.

### Stall Detection

A project flags as stalled when: status is active, no task has moved in N days (default 7), due date is within 30 days. Stalled projects show `!` marker in dashboard and "Stalled Xd" in the due field. Surfaces in Morning Pulse "Wants Attention" section.

### Capture Inbox Processing

Items in the `captures` table (raw text from the bottom field or Idea-typed entries from Quick Capture) accumulate over time. The **Inbox** link in the dashboard header shows the pending count and opens the inbox view.

On entry: Claude batch-classifies all pending items in a single call, returning a `type` (project/task/goal/note), a cleaned-up `title`, and (for tasks) a suggested `project_id` if one in the user's list clearly fits. Validation: invented UUIDs are dropped silently.

Each card is editable:
- Type dropdown (project / task / goal / note)
- Title input
- Project dropdown (shown only when type=task)
- Accept → commits the entity (`course_projects`/`course_tasks`/`course_goals`) and marks the capture `processed`
- Dismiss → marks the capture `dismissed`, no entity created

Notes (`type=note`) don't create a separate row; they just close out the capture. V2 may route them as cross-app pushes to Still or similar.

Entry points for capture itself are defined in [Adding Things](#adding-things--capture-and-contextual-add).

---

## Cross-App Integration

**Pushes to Still** — Friday Close question 3 ("What surprised you?") can be pushed to Still as a weekly reflection entry. Pre-checked by default.

**Reads from Still** — Recent Still entries can inform Morning Pulse generation (Claude has light context on what's on the user's mind, not just what's on the project list). Activates after V1 stable.

**Reads from Tick** — Habit streak status can color pulse tone (acknowledging momentum on the personal side). Deferred.

V1 launches standalone. Cross-app reads activate as those apps' Supabase tables stabilize.

---

## Tech Notes

**Notion read strategy:** Staged 6-step Setup Flow (review-driven, not bulk dump) + paste-URL selective imports via Supabase Edge Function proxy. No continuous sync. Course owns data after import.

**Notion write strategy:** Course writes to Notion in two scopes:

1. **Setup Flow** (one-time): opt-in archive/drop writebacks per item via bulk-archive toggles.
2. **Ongoing field writebacks** (Course → Notion, one-way, best-effort): when the user edits certain fields on a project or task in Course, the change propagates back to Notion. Course is the source of truth; Notion is the readable archive. Currently writeback-supported fields:
   - **Project status** → Notion Projects DB `Status` select (active→Active, idea→Idea, paused→Paused, done→Done, archived→Archived, routine→Routine, under_review→Under Review). Monday Open's Push flips status to `idea`; Drop flips to `archived`. Both fire writebacks.
   - **Project name** → Notion Projects DB title property. Inline editable from Monday Open's project card (tap the project name → input).
   - **Project outcome** → Notion Projects DB `Outcome` rich_text. Inline editable from Project Detail (UI labeled "Definition of Done") and Monday Open.
   - **Project due date** → Notion Projects DB `Due` date. Inline editable from Project Detail's meta-row Due cell *and* Monday Open's state row Due chip (both use the native date picker).
   - **Task status** → Notion Tasks DB `Task Status` select (triage→Triage, next→Next, in_progress→In Progress, waiting→Waiting, done→Done, dropped→Dropped). When status flips to `done`, Course also sets `Complete=true` on the Notion page (keeps Notion's existing Complete-checkbox-driven workflow consistent).
   - Goals have no editable Status/Outcome properties in the user's Notion Core Goals DB — writebacks skip goals.
   - **Project notes** and **Task notes** are Course-only — deliberately *not* written back. Notes are the free-form layer Course owns outright; there's no stable Notion property to target and round-tripping freeform text invites drift. (Effort is also Course-only, for the same "Course-side field" reason.)

The writeback scope expands as more inline editors are added in Course (project name, due date, task do-date, etc.). New writebacks should always be Course → Notion one-way, best-effort, and listed here.

Failure handling is best-effort: writebacks log to console on failure but don't block Course's local state change. Divergence is acceptable; Course is authoritative.

**Direction:** The long-term shape is *Course owns everything operational; Notion becomes a passive notes/reference layer.* Each new inline editor in Course is a step toward this. Reads from Notion stay one-time (Setup) + paste-URL (selective import) — no continuous polling, no two-way merge.

Both projects and tasks need a `notion_url` column to support writebacks; `course_projects.notion_url` and `course_tasks.notion_url` are populated during Setup Flow import.

**Reminders write strategy:** Apple Shortcuts deeplinks. User installs `CourseAddReminder` Shortcut once. Course generates the URL.

**Push notifications:** Web Push for PWAs. Three scheduled triggers:
- Morning Pulse (daily, user-configured time, default 7am)
- Monday Open (weekly, Monday morning, user-configured time)
- Friday Close (weekly, Friday afternoon, user-configured time)

Requires Course installed to home screen on iOS.

**Claude API:** Direct browser calls (same as other apps). Used for:
- Morning Pulse narrative + One Question generation
- Next Moves suggestions on Project Detail
- Monday Open: per-project next-move suggestions
- Friday Close: weekly narrative ("The Read")
- Stall question generation
- Capture classification

All prompts should enforce the tone register: tight, imperative, parenthetical context. Bake in: "Use short declarative sentences. Use parentheticals for metadata. Never narrate or explain."

---

## Build Order

1. Supabase schema + Edge Function + staged Setup Flow (6-step Notion review with opt-in archive writeback)
2. Dashboard shell (Projects mode) + Active Projects list + Pillar color system
3. Project Detail view with Next Moves panel (Claude integration)
4. Quick Capture + inbox processing
5. Tasks mode + day grouping
6. Push-to-Reminders via Shortcuts
7. Morning Pulse generation + web push + expanded view
8. Monday Open flow
9. Friday Close flow + Still integration
10. Stall detection logic
11. Selective Notion import (paste-URL flow)
12. Goals strip refinement + Pillar color settings
13. Cross-app reads (Still, Tick) — after V1 stable

---

## V2 Future Considerations

Notes on enhancements deliberately deferred from V1. Revisit after V1 launches and a few weeks of real use clarifies what's actually missing.

**Calendar integration (read-only).** Course reads Google Calendar to give Claude-generated content awareness of the user's actual day. Use cases:
- Morning Pulse references real availability ("ECS deck is at-risk and you've got 4 hours of meetings — protect the 2–4pm window for deep work")
- Monday Open asks honest scheduling questions ("Do you actually have time this week?")
- Task scheduling avoids days already booked solid

Implementation: Google Calendar API via OAuth, proxied through a Supabase Edge Function (same pattern as the Notion proxy). Sync cadence: fetch today's events on app open, fetch the week on Monday morning. Read-only only — Course should not write to the calendar. Writing would blur the "Reminders owns dated tasks" discipline.

**Calendar write / task-as-time-block.** Explicitly *not* planned. Reminders owns dated thin tasks. Adding calendar blocks introduces a third "where does this live" decision per task.

**Pull-back Reminders sync.** When a reminder pushed from Course is checked off in Apple Reminders, the corresponding task in Course auto-marks done. Requires CalDAV or a more involved Shortcut, deferred until the simpler one-way push proves out.

**Activity log / project history.** "Last move 2d ago" line in Project Detail expands into a full timeline of what moved when. Defer until the user actually wants more than the one-line summary.

**Balance view.** Aggregation by Pillar tag — bar chart of active projects per Pillar, trend over time, flags when one Pillar is starved. Defer until there's enough data to make it meaningful.

**Cross-app reads.** Pulse uses Still entries + Tick streaks for richer context. Activates as those apps' Supabase tables stabilize.

**Project hierarchy (parent/child).** Projects can nest under a parent project — e.g., "Pickling" lives under "Cooking" rather than as a flat sibling. Course renders the hierarchy in Project Detail (breadcrumb up to the parent) and the dashboard can collapse children under their parent. Claude assists during Setup Flow and ongoing capture: when a new project is created whose name/outcome/area is semantically close to an existing project, prompt "Looks like this nests under '[parent]' — want to make that the parent?" Requires a new `parent_project_id` column on `course_projects` and a Claude prompt for suggestions. Deferred because V1 needs the flat model working first; nesting is an organizational nicety, not a blocker.

**Idea resurfacing — "you have space for a backburned idea."** Ideas (projects with `status='idea'` in Course) shouldn't be forgotten when life makes room for them. When the user has capacity — low active project count, a quiet Friday Close, or a detected lull in Pulse — surface one: "You have space for a backburned idea. *Pickling* has been quiet for 8 weeks. Wake it up or let it rest?" This is the V2 counterweight to V1's lean-import discipline: Course doesn't force Ideas into the active view, but it also doesn't pretend they don't exist. Requires Course to keep Ideas (not bulk-archive them via Setup Flow's optional cleanup), plus a Pulse heuristic for "user has space" and a resurfacing-cadence rule per Idea so the same one doesn't re-pop weekly. V1 setup already supports importing Ideas as `status='idea'` — V2 just adds the resurfacing pass.

**Tidy mode (system housekeeping via agent loop).** A periodic (monthly) sweep where Claude analyzes the project portfolio for patterns of system drift and proposes cleanup actions. Uses the same agent primitive as the V1 One Question card (propose action → user confirm → execute via Supabase PATCH + Notion writeback) but scaled to portfolio-wide pattern detection.

Patterns to detect (initial candidates — refine after V1 data exists):
- Stalled active projects (no task moved in N days)
- Tasks rescheduled 3+ times (uses Notion's Reschedules counter)
- Phantom Active projects (marked Active, zero movement in 30+ days)
- Triage backlog (tasks in Triage for 14+ days)
- Waiting tasks with no person_dependency set (likely mislabeled)
- Goals with no active projects underneath
- Projects with no outcome field filled in
- Pillar imbalance (>80% active projects in one Pillar)
- Tasks stuck In Progress for 7+ days (likely blocked or mislabeled)
- Recurring missed pulses (Course drifting from usefulness)

UX: A "Tidy" or "Sweep" surface accessed from header. Each finding gets a card with pattern name, affected items list, suggested action, one-tap execute with confirm prompt. Same validation as One Question agent — Claude can't invent IDs, all referenced items must exist in input.

Cadence: monthly (not weekly — Tidy is system maintenance, not weekly rhythm).

Why V2: The agent loop itself is V1 territory. Let the One Question pattern prove out before scaling to portfolio housekeeping. Also: specific failure modes worth detecting only become clear after a few months of real Course usage — the pattern list above is hypothetical until then.

**Resurfacing — surface chronically ignored items.** Catches the inverse of stall detection: items that are quiet *by user choice* and may need either revival or burial. Three signals worth detecting:

- Captures (in `captures` table) with status='pending' for 30+ days
- Tasks with high reschedule count (4+) or sitting in Triage for 30+ days
- Projects pushed (decision='push') in 3+ consecutive Monday Opens — functionally inactive, declaratively active

Lives as a step inserted at the beginning of Monday Open called "Worth a Look" — before the regular per-project walk. Each surfaced item gets three chip options: Keep · Drop · Promote.
- Keep: leaves it alone (resets the consecutive-push counter for projects)
- Drop: archives project / dismisses capture / marks task as Dropped
- Promote: forces the item into active commitment for this week (project gets a next-move requirement, capture becomes a project/task, task moves out of Triage)

Why Monday: it's the weekly commitment moment. Forcing a decision on chronic-ignore items there means they either get acted on or buried — they stop being passive clutter.

Depends on data that only exists after 8-12 weeks of Monday Opens and active Capture inbox use. V2-appropriate. But the underlying decision-history tracking should be in V1 schema (see Monday Open `decisions_json` structure above) so the data is there when ready.

**Notion-enriched Claude context.** Claude-generated content (Next Moves, Morning Pulse, Monday Open suggestions, capture classification) becomes context-aware by reading relevant Notion notes alongside the project's structural data. Stops giving generic suggestions; starts giving informed ones.

Approach: Tag-based retrieval. User tags Notion pages with project name (or related keywords). Course fetches tagged pages via the existing Notion Edge Function proxy when generating Claude content for that project. Tagging discipline rewards itself — well-tagged projects get sharper suggestions.

Implementation phases:
1. **V2.1 — Top-N retrieval.** Pull the 3-5 most recently edited pages tagged with the project name. Pass full page text as context to Claude. Cheap and crude, but proves the loop.
2. **V2.2 — Snippet extraction (if context costs get high).** Instead of full pages, extract paragraphs that match the project name or current task context. Lower token cost per call.
3. **V2.3 — Summarization layer (if snippets miss too much).** A periodic sync job has Claude read each tagged page and store a 2-sentence summary in a new `notion_summaries` table. Claude calls use summaries at runtime.

Future Path B (semantic search via pgvector) is on the table if tag-based retrieval misses things in practice — but tag-based is the V2 starting point.

Surfaces enriched (priority order):
- Project Detail Next Moves panel (biggest unlock)
- Morning Pulse narrative + One Question
- Monday Open per-project next-move suggestions
- Capture inbox classification (boost confidence when a capture matches an existing project's tagged content)

Schema notes for V1 readiness: when Course imports from Notion in V1, store the original Notion page IDs not just URLs. This enables tag-querying via the Notion API later without needing to re-resolve URLs to IDs. Specifically: add `notion_page_id TEXT` alongside `notion_url` on projects, goals, and (if applicable) tasks.

Depends on: Notion API tag-query support (already exists), plus the Notion proxy Edge Function (already in V1).

**The Course Bar — conversational task editing via the capture field.**

The bottom capture field becomes a universal command line. User types natural language; Course classifies the intent and routes to the right action with confirm-gated execution.

Four input types Course should recognize:

1. **Capture** (default) — "thought about the Moroccan EP arrangement" → lands in `captures` table for processing
2. **Command** — "move ECS summary to tomorrow", "drop my UK trip prep tasks", "mark all music tasks as Side Gigs" → proposes a confirm card with the parsed action; on confirm, executes via Supabase PATCH + Notion writeback
3. **Question** — "what did I commit to last Monday?", "what's stalled?" → Claude reads relevant data and answers in a small inline response
4. **Slash command** (explicit) — "/add task draft onboarding doc" → skips classification, executes directly with the explicit intent

Classification approach: **cautious by default**. Anything ambiguous classifies as capture (the safe default — lands in inbox, no destructive action). Clear commands ("move", "drop", "push", "mark as", "add task") get parsed as commands. Questions get routed to Q&A. Slash syntax bypasses classification.

Validation: Same agent-loop safety rails as V1's One Question card. Claude proposes; user confirms; execution validates that referenced task/project IDs actually exist before any writes happen. No invented IDs, ever.

UX details:
- Placeholder text becomes context-aware to teach the feature: "Capture, or 'move ECS to Thu'…"
- Confirm card appears inline below the field — not a modal, not a navigation
- Confirmed actions show "✓ Done" briefly and the affected UI updates in place
- Failed parses ("I'm not sure what you meant — capture this instead?") default to capture

Depends on:
- V1 One Question agent loop (proves the propose → confirm → execute pattern)
- V1 capture inbox pipeline (already exists)
- Claude classifier prompt that reliably distinguishes the four input types

Why V2: needs the V1 patterns to be battle-tested first. Also: trust must be established — users won't trust Course to act on typed input until they've seen the One Question card act safely on its own proposals over weeks. Building this in V1 risks surprising the user with unexpected actions before they've calibrated trust.

This pattern is potentially Course's most differentiated long-term feature. Most project apps require users to learn the UI. The Course Bar lets the user just say what they want.

---

## Mockups Reference

The chat conversation includes HTML mockups for each screen — these are the visual source of truth and should be referenced during build for exact spacing, sizing, and component anatomy:

- `course-dashboard-pillars.html` — Projects mode with Pillar color system
- `course-dashboard-tasks.html` — Tasks mode
- `course-project-detail.html` — Project Detail view
- `course-morning-pulse.html` — Morning Pulse expanded
- `course-monday-open.html` — Monday Open flow (one project step)
- `course-friday-close.html` — Friday Close

---

## What Course Is Not

- Not a task list (Reminders owns dated thin tasks)
- Not a notes app (Notion stays the reference layer)
- Not a calendar or time blocker
- Not a habit tracker (Tick owns that)
- Not a reflection journal (Still owns that)

Course is the cockpit for active execution — projects in motion, the rhythm of starting and closing each week, and the bridge from idea to action.
