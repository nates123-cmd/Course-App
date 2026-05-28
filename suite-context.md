# Nate's Personal App Suite — Context Doc

Paste this into any future chat (Claude.ai or Claude Code) where you want to discuss, design, modify, or extend any of your apps. It gives the conversation a running start so you don't have to re-establish context from scratch.

---

## The Suite

A personal OS of five small, single-purpose PWAs. Each app owns one job, named with a short word that has double meaning. Distinct palettes, shared structural grammar — they feel like a family without being clones.

| App | Owns | Color Weather |
|---|---|---|
| **Tick** | Behavioral tracking — focus sessions (Pomodoro), habit reduction (BFRB, distractions, posture, slouching) | Near-black bg + electric indigo accent. Discipline, night focus. |
| **Break** | Mind enrichment — mantras, queues, listen list, stoic passages, look-up-later, history rabbit holes | Warm cream bg + black accent. Daylight, openness. |
| **Tide** | Intake tracking — drinks, water, food, supplements. Drinks gets pace awareness + intention setting | Cool blue-gray bg + blue accent. Hydration, calm. |
| **Still** | Reflection — habits, journal, stoic reflections, prompted entries, insight flagging, pattern analysis | Off-white bg + sage/khaki accent. Contemplative, edge-labeled nav. |
| **Course** | Project execution — projects, tasks, goals, weekly rhythm, morning pulse, Monday Open / Friday Close | Warm dark espresso bg + amber accent. Cockpit, terrain, course-ground. |

---

## Per-App Detail

### Tick — Behavioral Tracking
The focus + habit-reduction app. Pomodoro timer at the top with focus-session intention. Below: counter cards for compulsive/reducible behaviors (BFRB, distractions, posture, slouching). Tap a card → increment count for today. Daily reset. Streak history per category.

**Vibe:** Serious, disciplined. The app you open during work hours.

---

### Break — Mind Enrichment
The "give my mind something good" app. Top of screen: a big black `+` button for capturing things. Below: rotating tabs (Reflection / Informational / Activity / Random) and a stack of content cards:
- **Review Due** — items returning from your spaced-repetition queue
- **Mantras** — personal collection of principles
- **Look Up Later** — questions queued for Claude to research
- **Listen** — podcast episode queue
- **History Rabbit Hole / Cooking / Stoic Passage / Stoic Reminder** — discovery surfaces

Claude generates the discovery content. Stoic passages are *factual quotes from Stoic philosophers*, not invented.

**Vibe:** Warm, inviting, curious. The app you open on a coffee break.

---

### Tide — Intake Tracking
Tabbed home: **Water / Food / Supps / Drinks**. Each tab owns its own logging mechanic:
- **Water** — running daily total, tap to log a glass (Small / Big / Quart / Liter), goal vs actual
- **Food** — light meal logging, not calorie tracking
- **Supps** — daily checklist for morning/evening stacks
- **Drinks** — intention setting before sessions, pace awareness during, optional morning-after reflection

Rotating presence quote on home screen. Drinks tab has a mindfulness lean (Stoic-adjacent, not AA-style). Connects to Oura ring on the backend via `health_snapshots` table.

**Vibe:** Clean, hydrated, awareness over restriction.

---

### Still — Reflection
Whitespace-forward, edge-labeled navigation. Center of screen shows "Still" + the date + an active challenge or daily prompt. The screen edges label four sections:
- **HABITS** (top) — daily habit log + streaks (gym, meditation, etc.)
- **STOIC** (left) — stoic reflections and reminders
- **THOUGHTS** (right) — open journal
- **REFLECT** (bottom) — prompted reflection entries

Insight flagging, pattern analysis (Claude reads across Still + Tide + Tick + Oura `health_snapshots` and surfaces correlations like "on days you took supplements + logged gym, Oura readiness averaged 84").

Friday Close from Course can push reflections into Still.

**Vibe:** Contemplative, spacious, monastic. The app for being with thoughts rather than acting on them.

---

### Course — Project Execution
**The cockpit.** Reads from Notion (Projects/Tasks/Goals/Pillars/Work Areas via Edge Function proxy), writes to Apple Reminders (via Shortcuts deeplinks). Rebuilt 2026-05-25 from a multi-surface ritual app (Dashboard / Morning Pulse / Monday Open / Friday Close) to a tighter **Triage + Project** model. Three surfaces:
1. **Triage** (primary) — Pillar-by-pillar board. Each pillar shows Active projects (long-press-drag to reorder, persisted as `sort_order`), On hold, and Ideas. Project cards show name + first few open tasks (with due dates). FAB `+` opens the Capture sheet (project / task / note, Claude auto-classify).
2. **Project** — Full project record. Status + DoD (Outcome) + due-date all inline-editable with Notion writeback. Tasks split into open (always shown) and completed (collapsed behind a "Completed (N)" toggle). Riff → AI proposal pipeline turns a free-form status note into extracted tasks + milestones + a summary in one shot. Claude-powered **Next Moves** suggestions below the task list.
3. **Today** — Single-column day list of tasks with `do_date = today` across all projects.

The pre-redesign ritual surfaces (Morning Pulse, Monday Open, Friday Close, Dashboard) are archived in `_old_ui/` and not in the new design. Open question whether any return in V2.

**Tone for Claude content:** Tight, imperative, parenthetical context only when it adds signal. "Confirm Casablanca lease terms with Cedric (sitting 6d)" not narrative explanation. Claude is the steady second voice in the cockpit, not a chatty assistant.

**Pillars (top-level life domains):** Arrow (work), Slow Down Sunny (personal/wellness), Side Projects (creative/income). Stored as tag strings on projects with color-coded dots in the UI. Pillar colors are muted to fit the warm-dark palette.

**Setup is a staged review flow, not an auto-dump:** Connect Notion → Review Pillars/Work Areas → Review Goals → Review Projects → Review Tasks → Confirm. Course writes Archived/Dropped back to Notion for unimported items (the one and only exception to "Course doesn't write to Notion"). After setup, Notion is read-only reference.

**The Course Bar (V2):** The bottom capture field evolves into a conversational command line. User types natural language; Course classifies the intent into one of four buckets — **Capture** (default, safest — lands in inbox), **Command** (e.g., "move ECS summary to tomorrow" — proposes a confirm card, executes via Supabase PATCH + Notion writeback), **Question** (e.g., "what did I commit to last Monday?" — Claude reads data and answers inline), or **Slash command** (explicit "/add task..." syntax, bypasses classification). All commands are confirm-gated and validate referenced IDs exist before writing. Cautious-by-default classification: ambiguous input always falls back to capture. Slash syntax is the deterministic escape hatch when the classifier is wrong. Potentially Course's most differentiated long-term feature — most project apps require users to learn the UI; the Course Bar lets the user just say what they want.

**Vibe:** Grounded, considered, terrain at dusk.

---

## Shared Stack

- Single-file PWA (one `index.html` per app) on GitHub Pages
- Supabase REST for data — **one Supabase project shared across all apps**
- Direct Claude API browser calls (no build step, no server-side Node)
- Each app has its own GitHub repo + GitHub Pages URL
- Installable to home screen on iOS for native-feeling experience
- System-following light/dark mode where appropriate
- Mobile-first (~440px max-width column), centered on desktop

**Supabase Edge Functions** are used only where needed (Notion API proxy for Course, Google Calendar OAuth in future). Most data flow is direct browser → Supabase REST.

---

## Shared Design Grammar

Different palettes per app, but consistent structural rules across all five:

- **Layout** — Single-column, generous gutters, top-of-screen bold app name + minimal utility links top-right, stack of large rounded cards (~14-22px radius)
- **Typography** — App title large + heavy, card titles bold + medium, body lighter + slightly muted, numbers when they appear are outsized and tabular
- **Spacing** — Cards spaced with ~16-20px gaps, roomy internal padding, visual rhythm of scan-breathe-scan
- **Three-layer depth** — background → card → nested element, each a tonal step from the previous
- **Microcopy tone** — Short, direct, often slightly poetic. "All caught up!" not "No items to review." "1678 ml ahead" not "You exceeded your goal."

Two dialects within the suite:
- **Functional** (Tick, Break, Tide, Course) — Card-stack architecture, information dense, scannable. For *doing*.
- **Contemplative** (Still) — Whitespace-forward, single focal point, edge-labeled nav. For *being with*.

---

## Cross-App Integration

Apps work standalone. Cross-app reads/writes activate selectively. No app *depends* on another to function.

Current/planned connections:
- **Course → Still** — Friday Close question 3 ("What surprised you?") can push to Still as a weekly reflection
- **Course ← Still** — Future: recent Still entries inform Morning Pulse generation
- **Course ← Tick** — Future: habit streak status colors Course's pulse tone
- **Tide → Still** — Morning-after reflections push to Still
- **Still ← Tide / Tick / Oura** — Pattern analysis reads across all of them via `health_snapshots` shared table

---

## External Integrations Per App

- **Course** — Reads Notion (Edge Function proxy), writes Apple Reminders (Shortcuts deeplinks)
- **Break** — Claude API for content generation only
- **Still** — Claude API for reflection prompts + pattern analysis; reads Oura via `health_snapshots`
- **Tide** — Reads Oura via `health_snapshots`
- **Tick** — Self-contained, no external integrations

---

## Workflow

- **Ideation, design, schema decisions, mockups** → claude.ai (chat)
- **Implementation, debugging, file editing** → Claude Code in the project directory
- **Always**: chat-built spec + HTML mockups committed to the repo *before* Claude Code touches code

The boundary: divergent thinking happens in chat, single-threaded execution happens in Claude Code. Chat is great at "what should this be." Claude Code is great at "build the thing we decided on."

Each app's directory should contain:
- `index.html` (the app)
- `<app>-spec.md` (the spec)
- HTML mockups for each screen
- `CLAUDE.md` (short brief telling Claude Code where to start)

---

## How to Use This Doc

**For a new feature or redesign of an existing app:** Paste this doc + the relevant app spec at the top of a new chat. Conversation can start at "what should we change" instead of "what is this."

**For a new app idea:** Paste this doc alone. The suite context tells Claude what family the new app needs to join, what design grammar to inherit, what name pattern to honor.

**For Claude Code sessions:** Add this as a top-level file in the project directory (or reference it from `CLAUDE.md`). Claude Code will load it as context and stay consistent with the suite's patterns.

---

*Last updated: May 2026.*
