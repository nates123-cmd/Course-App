# Course

The fifth app in Nate's personal PWA suite (alongside Tick, Still, Tide, Break). A project execution app — the cockpit between Notion (notes/reference) and Apple Reminders (thin dated tasks).

## UX redesign in progress (2026-05-25)

Course was rebuilt from a multi-surface ritual app (Dashboard / Today / Morning Pulse / Monday Open / Friday Close) to a tighter **Triage + Project** model. The new design lives in the root `*.jsx` files (React-in-HTML loaded by `index.html` via Babel CDN). The pre-redesign single-file PWA is archived in `_old_ui/` and will be deleted once the Notion + Claude wiring is ported across. The ritual surfaces are not in the new design — open question whether any return in V2.

## Read these first

- `course-spec.md` — full app spec, data model, tech notes. **Stale in places** w.r.t. the new UX; treat as historical until updated.
- `suite-context.md` — broader suite context (shared stack, design grammar, all five apps)
- `index.html` + `app.jsx` + `triage.jsx` + `project.jsx` — current visual + interaction source of truth (replaces the old mockups)

## Stack

- React-in-HTML PWA (Babel CDN, no build step) — one `index.html` + per-screen `.jsx` files
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
