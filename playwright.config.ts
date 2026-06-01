import { defineConfig, devices } from '@playwright/test';

// Playwright E2E config for the blog.
//
// `webServer` builds the static site and serves it with `astro preview` before
// the tests run, so E2E always exercises the real production output (the same
// thing GitHub Pages serves) rather than the dev server. The site is served
// under the GitHub Pages base path (/personal-blog), so baseURL includes it.
const PORT = 4321;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',

  use: {
    // Trailing slash matters: with it, relative goto('posts/x/') resolves UNDER
    // the GitHub Pages base path. Without it, goto('/') would hit the server
    // root (404), since the site lives at /personal-blog/.
    baseURL: `http://localhost:${PORT}/personal-blog/`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: `http://localhost:${PORT}/personal-blog/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
