// Values mirrored from the app so tests can reference storage keys etc.
// (Stable identifiers, not logic — the logic itself is always called live via
//  page.evaluate against the real window globals, never re-implemented here.)
export const SB_AUTH_KEY = 'sb-xsmnfcmtbpeaccnyinkr-auth-token'; // supabase-client.js
export const THEME_KEY = 'course_theme';      // app.jsx
export const SOLAR_DARK_KEY = 'course_solar_dark'; // app.jsx
export const GEO_KEY = 'course_geo';          // app.jsx getGeo()
export const SB_HOST = 'xsmnfcmtbpeaccnyinkr.supabase.co';
