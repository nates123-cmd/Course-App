// Boot / auth-gate smoke. Course is React-in-HTML (Babel CDN). These guard that
// the whole .jsx compile chain runs, React mounts, and the OTP gate logic gates
// correctly — the cheapest "did a change blow up boot?" tripwire.
import { test, expect } from '@playwright/test';
import { boot, seedSession, stubFetchEmpty } from './helper.js';

test('boots: every .jsx compiles and the app globals exist', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seedSession(page);
  await stubFetchEmpty(page);
  await boot(page);

  // The risky-logic functions named in the QA brief are all live globals.
  const present = await page.evaluate(() =>
    ['surfaceActions', 'bucketFor', 'sunTimes', 'resolveSolar', 'clockFallback',
     'getCourseTheme', 'setCourseTheme', 'loadCourseData']
      .every((n) => typeof window[n] === 'function') &&
    typeof window.notionWriteback === 'object' && typeof window.db === 'object');
  expect(present).toBe(true);

  // No uncaught errors during the babel compile + first render.
  expect(errors).toEqual([]);
});

test('with a session, the OTP gate stays hidden and #root mounts', async ({ page }) => {
  await seedSession(page);
  await stubFetchEmpty(page);
  await boot(page);
  // index.html's DOMContentLoaded handler only shows the gate when !hasSession().
  const gateDisplay = await page.evaluate(() =>
    getComputedStyle(document.getElementById('otp-gate')).display);
  expect(gateDisplay).toBe('none');
  // React mounted something into #root (loading shim or triage).
  const rootChildren = await page.evaluate(() => document.getElementById('root').childElementCount);
  expect(rootChildren).toBeGreaterThan(0);
});

test('without a session, hasSession() is false (gate would show)', async ({ page }) => {
  // No seedSession — clear any prior token. Still stub fetch so nothing leaks.
  await stubFetchEmpty(page);
  await page.addInitScript((key) => localStorage.removeItem(key),
    'sb-xsmnfcmtbpeaccnyinkr-auth-token');
  await boot(page);
  const has = await page.evaluate(() => window.hasSession());
  expect(has).toBe(false);
});
