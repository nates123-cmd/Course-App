// Shared helpers for the Course PWA test suite.
//
// Course is React-in-HTML: index.html pulls React + @babel/standalone from a CDN
// and compiles ~12 `text/babel` .jsx files in the browser on load. Babel-standalone
// evaluates each script in the global scope, so the app's top-level `function`
// declarations (surfaceActions, sunTimes, resolveSolar, clockFallback, …) land on
// `window` and are callable live via page.evaluate — zero re-implementation.
import { SB_AUTH_KEY, SB_HOST } from './constants.js';

// Load the app and wait until the full babel chain has run + React has mounted.
// `window.setCourseTheme` is defined at the very end of app.jsx (the last babel
// script), so its presence means every prior .jsx compiled and executed.
export async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.setCourseTheme === 'function');
}

// Seed a non-expired fake auth session BEFORE the page script runs, so boot
// takes the has-session branch instead of showing the OTP gate. Pairs with a
// stubbed fetch so the fake token never actually goes on the wire.
export async function seedSession(page) {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'test-fake-token',
      refresh_token: 'test-fake-refresh',
      expires_at: 4102444800, // far-future (seconds) so _sessionExpired() is false
      user: { email: 'qa@test.local' },
    }));
  }, SB_AUTH_KEY);
}

// Replace window.fetch with a no-op returning empty JSON, before app script runs.
// Neutralises all network (Supabase REST, Notion edge fn) so boot/render/reloadData
// are deterministic and quiet. Returns [] which satisfies db.select's consumers.
export async function stubFetchEmpty(page) {
  await page.addInitScript(() => {
    window.fetch = async () =>
      new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

// Capture every fetch the app makes (url + parsed JSON body) into window.__calls,
// while still returning a caller-supplied response. Use for asserting the exact
// Notion writeback payload the REAL app builds. `respond` maps a request to the
// JSON it should resolve with (default: empty object, status 200).
export async function recordFetch(page, { status = 200 } = {}) {
  await page.addInitScript((st) => {
    window.__calls = [];
    window.fetch = async (url, opts = {}) => {
      let body = null;
      try { body = opts.body ? JSON.parse(opts.body) : null; } catch (_) { body = opts.body; }
      window.__calls.push({ url: String(url), method: (opts.method || 'GET'), headers: opts.headers || {}, body });
      return new Response('{}', { status: st, headers: { 'Content-Type': 'application/json' } });
    };
  }, status);
}

export { SB_HOST };
