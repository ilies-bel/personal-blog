import { defineConfig, devices } from '@playwright/test';

// Playwright E2E config for the blog.
//
// `webServer` builds the static site and serves it with `astro preview` before
// the tests run, so E2E always exercises the real production output (the same
// thing GitHub Pages serves) rather than the dev server. The site lives at the
// root of the custom domain (base '/'), so baseURL has no path prefix.
//
// Local sandboxes that can't download browsers can point the chromium-based
// projects at a preinstalled binary via PW_CHROMIUM_EXECUTABLE; CI installs
// the full browser set with `npx playwright install --with-deps` and leaves
// the variable unset.
const PORT = 4321;

const chromiumExecutable = process.env.PW_CHROMIUM_EXECUTABLE;
const chromiumLaunch = chromiumExecutable
  ? { launchOptions: { executablePath: chromiumExecutable } }
  : {};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',

  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...chromiumLaunch } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // Real device profiles for the mobile matrix. Pixel 7 runs on chromium
    // (usable in the local sandbox); iPhone runs on webkit (CI only).
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'], ...chromiumLaunch } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],

  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
