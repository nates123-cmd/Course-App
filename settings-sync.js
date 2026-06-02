// Suite settings sync — ties per-app preferences/tokens to the logged-in user
// instead of a single device's localStorage.
//
// How it works: settings still live in localStorage (so every existing
// `localStorage.getItem(...)` call site keeps working unchanged), but this
// module mirrors a whitelisted set of keys to a per-user `user_settings` row
// in the shared Supabase project. On boot it pulls the cloud values down into
// localStorage; `suiteSettings.set()` writes both places. One sign-in =
// settings follow you across devices.
//
// What it does NOT store: the Anthropic API key. That now lives server-side in
// the `claude` edge function — no app holds it. See claude-shim.js.
//
// Depends on supabase-client.js (window.SB_URL/SB_KEY/sbBearer) being loaded
// first. Load this BEFORE the .jsx modules so cloud values seed localStorage
// before components read it.

(function () {
  // Keys this app syncs to the user's login. Add per app as needed.
  const SYNCED_KEYS = ['notion_projects_db_id', 'notion_tasks_db_id', 'course_theme'];

  const SB_URL = window.SB_URL;
  const SB_KEY = window.SB_KEY;
  const TABLE = `${SB_URL}/rest/v1/user_settings`;

  async function headers(extra) {
    const bearer = (window.sbBearer ? await window.sbBearer() : SB_KEY);
    return { apikey: SB_KEY, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', ...(extra || {}) };
  }

  // Pull all of the user's settings rows into localStorage. For any synced key
  // present locally but absent in the cloud, push it up (one-time backfill so
  // an existing device's values become the cloud baseline).
  async function load() {
    if (!window.hasSession || !window.hasSession()) return; // signed-out: stay local-only
    let rows = [];
    try {
      const res = await fetch(`${TABLE}?select=key,value`, { headers: await headers() });
      if (!res.ok) throw new Error(`${res.status}`);
      rows = await res.json();
    } catch (e) {
      console.warn('settings-sync: load failed, using local values', e);
      return;
    }

    const cloud = {};
    for (const r of rows) cloud[r.key] = r.value;

    const toBackfill = [];
    for (const key of SYNCED_KEYS) {
      if (key in cloud) {
        // Cloud is source of truth on load.
        if (cloud[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, cloud[key]);
      } else {
        const local = localStorage.getItem(key);
        if (local != null && local !== '') toBackfill.push({ key, value: local });
      }
    }
    if (toBackfill.length) {
      try {
        await fetch(TABLE, {
          method: 'POST',
          headers: await headers({ Prefer: 'resolution=merge-duplicates' }),
          body: JSON.stringify(toBackfill),
        });
      } catch (e) {
        console.warn('settings-sync: backfill failed', e);
      }
    }
  }

  // Write a setting to both localStorage and the user's cloud row.
  async function set(key, value) {
    const v = (value == null || value === '') ? null : String(value);
    if (v == null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);

    if (!window.hasSession || !window.hasSession()) return; // local-only when signed out
    try {
      await fetch(TABLE, {
        method: 'POST',
        headers: await headers({ Prefer: 'resolution=merge-duplicates' }),
        body: JSON.stringify([{ key, value: v }]),
      });
    } catch (e) {
      console.warn('settings-sync: set failed (kept locally)', key, e);
    }
  }

  function get(key) { return localStorage.getItem(key); }

  window.suiteSettings = { load, set, get, SYNCED_KEYS };
})();
