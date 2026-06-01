# Course — QA Testing Plan

Course is a **React-in-HTML PWA, no build step**: `index.html` pulls React +
`@babel/standalone` from a CDN and compiles ~12 `text/babel` `.jsx` files in the
browser on boot. Babel-standalone evaluates each script in the **global scope**,
so the app's top-level `function` declarations (`surfaceActions`, `bucketFor`,
`sunTimes`, `resolveSolar`, `clockFallback`, `getCourseTheme`, …) and its
explicit `window.*` exports (`loadCourseData`, `db`, `notionWriteback`,
`setCourseTheme`) are all reachable on `window`. Playwright calls the **real**
shipped functions via `page.evaluate` — **zero re-implementation, zero drift**.
(Verified empirically before writing the suite.)

## Framework

[Playwright](https://playwright.dev) v1.60 (Chromium cached). A throwaway
`python3 -m http.server` serves the app on `:8215` so `fetch`, origin, and
same-origin `localStorage` behave like production. The `tests/` dir is
**additive** — it does not touch `index.html` and adds no build step.

Run: `cd tests && npm test`   (or `npx playwright test`)

## What these tests deliberately do NOT cover (read first)

- **Real Supabase / Notion / Claude network calls.** All `fetch` is stubbed
  (empty, route-fixture, or recorded). We test *our* shaping/payload logic, not
  the backends or the edge function.
- **Real OTP auth round-trip** (needs a live inbox). We seed a fake session
  token to take the has-session boot branch; we never hit `/auth/v1/*`.
- **React rendering / interaction** beyond "the app mounts and the OTP gate
  gates": no clicks, no drag-reorder (Sortable.js), no inline-edit commit, no
  capture-sheet AI classify. These need DOM-driving tests + a fake data backend
  and are out of scope for *logic* QA.
- **Service worker (`sw.js`)** caching — irrelevant under the test origin.
- **`notionSync` pull-sync** (`syncProjects`) — orchestration over ~6 edge calls;
  only its payload-building siblings in `notion-writeback.js` are pinned here.
- **`callClaude` / next-moves prompt building** — only reachable with a key.
- **Visual / layout / safe-area / theme *paint*.** We test the solar *decision*
  math, not that CSS variables produce the right pixels.
- **`projects-data.jsx` seed registry** — dead prototype seed data, not loaded
  onto `window` anymore (the real registry comes from `loadCourseData`).

## Risk ranking (highest value first)

| # | Area | Why it's risky | Coverage |
|---|------|----------------|----------|
| 1 | **`surfaceActions`** (triage.jsx) | Collapses a project to ONE next-action row; powers every Triage card. 4 states (empty/normal/urgent_single/urgent_double) with subtle `≤3d` due + next-candidate interplay; silently wrong = wrong action shown. | `logic.spec.js` |
| 2 | **Null-pillar Triage regression** | A past bug *dropped active projects with a null pillar*. Guarded at two layers: `loadCourseData` shapes `''`/`null` pillar → `null` (never drops the row), and the app's grouping key `p.pillar \|\| 'unfiled'` keeps it visible. | `data.spec.js` |
| 3 | **Notion writeback payloads** (notion-writeback.js) | Enum→Notion-select maps + property names (`Task` vs `Name`, `Do date`, relation arrays) must match Notion's schema exactly; wrong = silent shared-prod write failure. Plus the page-id extraction / no-op-when-Course-native contract. | `writeback.spec.js` |
| 4 | **Solar theme math** (app.jsx) | Ported from Ink. `sunTimes` (NOAA pure-math, polar nulls), `resolveSolar` (cross-day event gathering to dodge the UTC-anchor quirk), `clockFallback`, `getCourseTheme` coercion. Pure math, easy to regress silently. | `logic.spec.js` |
| 5 | **`bucketFor`** (triage.jsx) | status enum → active/onhold/idea/hidden bucket; an unknown status must fall through to *active* (visible), not vanish. | `logic.spec.js` |
| 6 | **`loadCourseData` shaping** | `shapeTask`/`shapeProject`: due → {m,d,y}, lowercased pillar, `waiting` person dependency, project-less pillar-task grouping, done/next flags. | `data.spec.js` |
| 7 | **Boot / auth gate** | The whole babel compile chain must run without throwing; session→app, no-session→gate. Cheapest regression tripwire. | `smoke.spec.js` |

## Invariants pinned

**surfaceActions**
- empty list → `{state:'empty', count:0}`.
- no due/next → first task; `next` flag overrides first-position.
- due `≤ 3` days (incl. overdue/negative, incl. exactly 3) → urgent; `> 3` → normal.
- urgent task == next candidate → `urgent_single` (count = len−1); differ →
  `urgent_double` with both surfaced (count = len−2).

**Null-pillar (the regression guard)**
- `pillar: null` *and* `pillar: ''` both shape to `null` and remain in the
  registry + `projectIds`.
- The app's grouping puts a null-pillar active project under `unfiled.active` —
  it is never filtered out.

**Notion writeback**
- enum maps: `under_review→'Under Review'`, `done→'Done'`, etc.
- `taskStatus` sets both `Task Status` select *and* the `Complete` checkbox;
  blank status → `select:null`, checkbox false.
- date fields send `{date:{start}}` and clear with `{date:null}`.
- titles: project uses `Name`, task uses `Task` (not Name).
- `Project` relation: `[{id}]` when linked, `[]` when cleared.
- **no-op** when `notion_url` is null or has no 32-hex id (Course-native records).

**Solar**
- `sunTimes` returns Dates mid-latitude; `null` at the poles in midsummer.
- `resolveSolar` returns `{dark:boolean, next:number}` and falls back to the
  clock when geo is absent *or* the location is polar.
- `getCourseTheme` coerces missing/unknown values to `'dark'`.

## REAL app bugs found

None. All 36 tests pass against the shipped code. One initial red was a **test
bug** (asserting sunrise<sunset within a single western-longitude `sunTimes`
call — that ordering is intentionally not guaranteed; `resolveSolar` is the layer
that reasons across days). Fixed in the test; documented inline.

This catches *logic* regressions (the silent, dangerous kind). It is not a
substitute for a human running the real Triage / Notion-sync flows after a change.
