import { defineConfig, devices } from '@playwright/test';

// ---------------------------------------------------------------------------
// Base-path parametrisation
//
// Production serves https://ilies-bel.dev/ at the domain root, so the default
// BASE_PATH is empty (i.e. the site lives at '/').  Set BASE_PATH=/personal-blog
// (no trailing slash) to test a subpath deployment such as the legacy GitHub
// Pages project-site shape.
//
// The webServer command builds the static output first, then serves it via
// `astro preview`, so every E2E run exercises the same production artifact that
// GitHub Pages deploys — never the dev server.
// ---------------------------------------------------------------------------
const BASE_PATH = process.env.BASE_PATH ?? '';
const PORT = 4321;

// Normalise to a single trailing slash so Playwright's relative-URL resolution
// works correctly and the webServer health-check URL is unambiguous.
const normalizedBase = BASE_PATH
  ? `/${BASE_PATH.replace(/^\/|\/$/g, '')}/`
  : '/';

const baseURL = `http://localhost:${PORT}${normalizedBase}`;

// Key every artifact directory by the first 10 characters of the commit SHA so
// each CI run keeps its own evidence slot (QA-001 artifact-retention requirement).
// Falls back to 'local' during developer runs.
const SHA = (process.env.GITHUB_SHA ?? 'local').slice(0, 10);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  // In CI, emit an HTML report under a SHA-keyed subdirectory and a plain list
  // to stdout.  Locally, only the list reporter is used for faster feedback.
  reporter: process.env.CI
    ? [['html', { open: 'never', outputFolder: `playwright-report/${SHA}` }], ['list']]
    : [['list']],

  // Artifact output dir is also SHA-keyed so screenshots, videos, and traces
  // from different commits never overwrite each other.
  outputDir: `test-results/${SHA}`,

  use: {
    baseURL,
    // Capture a full trace on the first retry so failures are diagnosable.
    trace: 'on-first-retry',
    // Screenshots and video are retained only when a test fails, keeping
    // artifact storage small for green runs.
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // ---------------------------------------------------------------------------
  // Playwright projects — tagged for tiered CI execution (QA-002)
  //
  // smoke  — Tests tagged @smoke only.  Fast subset; runs on every push and PR
  //          to catch the most common regressions (HTTP status, console, network,
  //          canonical nav, no-JS homepage, WebGL fallback, history traversal).
  //          Invoked via `npm run test:e2e:smoke`.
  //
  // chromium (full gate) — All tests with no grep filter.  Comprehensive release
  //          gate; runs only on release-candidate deploys (version tags).
  //          Invoked via `npm run test:e2e`.  Covers no-WebGL context loss,
  //          reduced motion, mobile-width overflow matrix, keyboard walks,
  //          landmarks, semantic narrative, reflow matrix, and all other
  //          per-route and per-feature checks.
  // ---------------------------------------------------------------------------
  projects: [
    {
      name: 'smoke',
      use: { ...devices['Desktop Chrome'] },
      // Filter to tests that carry the @smoke tag (matched against the full test
      // title including tags set via the `{ tag: ['@smoke'] }` option).
      grep: /@smoke/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // No grep — runs every test in the e2e/ directory.
    },
  ],

  webServer: {
    // Build the production static bundle first, then serve it with astro preview.
    // This ensures every E2E run exercises the exact artifact that would be
    // deployed, not the Vite dev server (which skips SSG and asset optimisation).
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: baseURL,
    // Reuse a running preview server during local development to skip repeated
    // rebuilds.  In CI every run starts fresh so results are reproducible.
    reuseExistingServer: !process.env.CI,
    // 3 minutes is generous but realistic: the Three.js/MDX build can take
    // 90–120 seconds on a cold CI runner.
    timeout: 180_000,
  },
});
