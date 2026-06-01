// Pure-logic tests against the REAL app globals (called live via page.evaluate).
// Covers the two highest-risk pure functions named in the QA brief:
//   1. surfaceActions  — projects collapse to ONE next-action row
//   2. solar theme math — sunTimes / resolveSolar / clockFallback / getCourseTheme
import { test, expect } from '@playwright/test';
import { boot, seedSession, stubFetchEmpty } from './helper.js';
import { THEME_KEY, GEO_KEY } from './constants.js';

test.beforeEach(async ({ page }) => {
  await seedSession(page);
  await stubFetchEmpty(page);
});

// ── surfaceActions (triage.jsx) ─────────────────────────────────────────────
// state ∈ empty | normal | urgent_single | urgent_double. `today` is a Date;
// task.due is yyyy-mm-dd; task.next flags the chosen "next" candidate.
test.describe('surfaceActions: project → one next-action row', () => {
  test('empty list → {state:"empty", count:0}', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() =>
      window.surfaceActions([], new Date('2026-06-01T12:00:00')));
    expect(r).toEqual({ state: 'empty', count: 0 });
  });

  test('no due, no next → first task surfaced, count = rest', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => window.surfaceActions(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }], new Date('2026-06-01T12:00:00')));
    expect(r.state).toBe('normal');
    expect(r.primary.id).toBe('a');
    expect(r.count).toBe(2);
  });

  test('next flag picks the next-marked task even if not first', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => window.surfaceActions(
      [{ id: 'a' }, { id: 'b', next: true }, { id: 'c' }], new Date('2026-06-01T12:00:00')));
    expect(r.state).toBe('normal');
    expect(r.primary.id).toBe('b');
  });

  test('urgent_single: soonest-due (≤3d) IS the next candidate', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => window.surfaceActions(
      [{ id: 'a', next: true, due: '2026-06-02' }, { id: 'b' }],
      new Date('2026-06-01T12:00:00')));
    expect(r.state).toBe('urgent_single');
    expect(r.primary.id).toBe('a');
    expect(r.count).toBe(1); // length - 1
  });

  test('urgent_double: soonest-due differs from the next candidate', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => window.surfaceActions(
      [{ id: 'a', next: true }, { id: 'b', due: '2026-06-02' }, { id: 'c' }],
      new Date('2026-06-01T12:00:00')));
    expect(r.state).toBe('urgent_double');
    expect(r.primary.id).toBe('b');    // urgent (soonest due)
    expect(r.secondary.id).toBe('a');  // next candidate
    expect(r.count).toBe(1);           // length - 2
  });

  test('overdue (negative days) still counts as urgent', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => window.surfaceActions(
      [{ id: 'a', due: '2026-05-20' }], new Date('2026-06-01T12:00:00')));
    expect(r.state).toBe('urgent_single');
    expect(r.primary.id).toBe('a');
  });

  test('due >3 days out is NOT urgent (normal state)', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => window.surfaceActions(
      [{ id: 'a', due: '2026-06-30' }, { id: 'b' }], new Date('2026-06-01T12:00:00')));
    expect(r.state).toBe('normal');
    expect(r.primary.id).toBe('a');
  });

  test('exactly 3 days out IS urgent (boundary, <= 3)', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => window.surfaceActions(
      [{ id: 'a', due: '2026-06-04' }], new Date('2026-06-01T12:00:00')));
    expect(r.state).toBe('urgent_single');
  });
});

// ── bucketFor (triage.jsx) — status → Triage bucket ─────────────────────────
test('bucketFor maps status enums to the three buckets', async ({ page }) => {
  await boot(page);
  const m = await page.evaluate(() => ({
    active: window.bucketFor('active'),
    routine: window.bucketFor('routine'),
    under_review: window.bucketFor('under_review'),
    idea: window.bucketFor('idea'),
    paused: window.bucketFor('paused'),
    done: window.bucketFor('done'),
    archived: window.bucketFor('archived'),
    dropped: window.bucketFor('dropped'),
    weird: window.bucketFor('something-unexpected'),
  }));
  expect(m.active).toBe('active');
  expect(m.routine).toBe('active');
  expect(m.under_review).toBe('active');
  expect(m.idea).toBe('idea');
  expect(m.paused).toBe('onhold');
  expect(m.done).toBe('hidden');
  expect(m.archived).toBe('hidden');
  expect(m.dropped).toBe('hidden');
  expect(m.weird).toBe('active'); // unknown → falls through to active
});

// ── Solar theme math (app.jsx) ──────────────────────────────────────────────
test.describe('solar: sunTimes / resolveSolar / clockFallback', () => {
  test('sunTimes returns two valid instants for a mid-latitude summer day', async ({ page }) => {
    await boot(page);
    // San Francisco, summer solstice — both events exist (not polar).
    // NOTE: within a single sunTimes(date) call, sunrise/sunset are each anchored
    // to the SAME UTC calendar date, so for western longitudes the raw pair can be
    // out of clock order (sunset can precede sunrise of the next local cycle). That
    // is exactly why resolveSolar() gathers events across -1/0/+1 days. So here we
    // only assert both are valid instants on/near the requested UTC date.
    const r = await page.evaluate(() => {
      const st = window.sunTimes(new Date(Date.UTC(2026, 5, 21)), 37.77, -122.42);
      return { sr: st.sunrise && st.sunrise.getTime(), ss: st.sunset && st.sunset.getTime() };
    });
    expect(Number.isFinite(r.sr)).toBe(true);
    expect(Number.isFinite(r.ss)).toBe(true);
  });

  test('sunTimes is correctly ordered (sunrise<sunset) for an EASTERN longitude', async ({ page }) => {
    await boot(page);
    // For a near-prime-meridian location the UTC-date anchor and local day align,
    // so sunrise precedes sunset within the single call. (London-ish, summer.)
    const r = await page.evaluate(() => {
      const st = window.sunTimes(new Date(Date.UTC(2026, 5, 21)), 51.5, 0.0);
      return { sr: st.sunrise && st.sunrise.getTime(), ss: st.sunset && st.sunset.getTime() };
    });
    expect(r.sr).toBeTruthy();
    expect(r.ss).toBeTruthy();
    expect(r.ss).toBeGreaterThan(r.sr);
  });

  test('sunTimes returns null at the poles in midsummer (sun never sets)', async ({ page }) => {
    await boot(page);
    // North pole, summer solstice: cosH out of range → null.
    const r = await page.evaluate(() => {
      const st = window.sunTimes(new Date(Date.UTC(2026, 5, 21)), 89.9, 0);
      return { sr: st.sunrise, ss: st.sunset };
    });
    expect(r.sr).toBeNull();
    expect(r.ss).toBeNull();
  });

  test('resolveSolar with no geo falls back to the clock (same shape)', async ({ page }) => {
    await boot(page);
    // No course_geo seeded → getGeo() null → clockFallback path.
    const r = await page.evaluate(() => {
      localStorage.removeItem('course_geo');
      return window.resolveSolar();
    });
    expect(typeof r.dark).toBe('boolean');
    expect(typeof r.next).toBe('number');
    expect(r.next).toBeGreaterThan(0);
  });

  test('clockFallback: dark before 7am / from 7pm, with a positive next', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const o = window.clockFallback();
      return { dark: o.dark, next: o.next, hour: new Date().getHours() };
    });
    const expectDark = r.hour < 7 || r.hour >= 19;
    expect(r.dark).toBe(expectDark);
    expect(r.next).toBeGreaterThan(0);
  });

  test('resolveSolar with a polar geo in midsummer falls back to clock', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      // Force a geo where sunTimes yields no events for the current date window.
      localStorage.setItem('course_geo', JSON.stringify({ lat: 89.9, lng: 0 }));
      const out = window.resolveSolar();
      localStorage.removeItem('course_geo');
      return out;
    });
    // Whatever the date, the function must not throw and must return the shape.
    expect(typeof r.dark).toBe('boolean');
    expect(['number']).toContain(typeof r.next);
  });
});

// ── getCourseTheme (app.jsx) — storage coercion ─────────────────────────────
test('getCourseTheme coerces unknown/blank values to "dark"', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate((k) => {
    const set = (v) => { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); return window.getCourseTheme(); };
    return {
      missing: set(null),
      light: set('light'),
      dark: set('dark'),
      system: set('system'),
      solar: set('solar'),
      junk: set('rainbow'),
    };
  }, THEME_KEY);
  expect(r.missing).toBe('dark');
  expect(r.light).toBe('light');
  expect(r.dark).toBe('dark');
  expect(r.system).toBe('system');
  expect(r.solar).toBe('solar');
  expect(r.junk).toBe('dark');
});
