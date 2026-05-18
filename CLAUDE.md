# Course

The fifth app in Nate's personal PWA suite (alongside Tick, Still, Tide, Break). A project execution app — the cockpit between Notion (notes/reference) and Apple Reminders (thin dated tasks).

## Read these first

- `course-spec.md` — full app spec, data model, screens, tech notes, V2 considerations
- `suite-context.md` — broader suite context (shared stack, design grammar, all five apps)

## Mockups (visual source of truth)

Reference these for spacing, sizing, component anatomy:

- `course-dashboard-pillars.html` — Projects mode (default home)
- `course-dashboard-tasks.html` — Today tab, **V1 build target**
- `course-proposed-day.html` — Today tab, V2 target (don't build yet, but keep V1 structurally compatible)
- `course-project-detail.html` — Project Detail view
- `course-morning-pulse.html` — Morning Pulse expanded
- `course-monday-open.html` — Monday Open flow
- `course-friday-close.html` — Friday Close flow

## Stack

- Single-file PWA (one `index.html`) — match the pattern of Nate's other apps
- Supabase REST for data (shared Supabase project)
- Direct Claude API browser calls (no build step, no Node server)
- Notion API via Supabase Edge Function proxy (read-only after initial setup, except setup-time writeback for archiving unimported items)
- Apple Reminders via Shortcuts deeplinks
- Web Push notifications for Morning Pulse / Monday Open / Friday Close
- Mobile-first (~440px max-width column), centered on desktop — V2-ready for desktop multi-column

## Build order

See the build order section of `course-spec.md`. Start with Supabase schema + Notion import flow. Don't skip to advanced features.

## Workflow

Before writing code: walk through your plan, confirm understanding of the spec, flag any ambiguities. Don't execute first and ask questions later. Nate prefers peer-level directness with no hand-holding; raise issues you see rather than working around them.

When making design choices not covered in the spec, follow the suite design grammar in `suite-context.md` and match the warm-dark palette + tight tone register established in `course-spec.md`.

## Tone of voice for Claude-generated content

All in-app Claude text (Morning Pulse, Next Moves, Monday/Friday review prompts, stall questions) follows a tight register:

- Short declarative sentences
- Parentheticals for metadata, not narrative explanation
- Imperative when proposing actions ("Confirm Casablanca lease terms with Cedric (sitting 6d)" not "It looks like the lease conversation has been sitting for a while, you might want to follow up")
- Never narrate or explain unless asked

Bake this register into every prompt that generates user-facing text.
