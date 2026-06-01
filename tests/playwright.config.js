// Playwright config for the Course PWA. Serves the React-in-HTML app (Babel CDN,
// no build step) from the parent dir on :8215 so fetch/origin/localStorage behave
// like production. The tests/ dir is additive — it never touches the app.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Babel compiles ~12 .jsx files in-browser on boot, then React mounts and the
  // first reloadData() runs — generous default so slow CI boots don't flake.
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8215',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Serve the app root (parent of tests/) so index.html is at "/".
    command: 'python3 -m http.server 8215 --directory ..',
    port: 8215,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
