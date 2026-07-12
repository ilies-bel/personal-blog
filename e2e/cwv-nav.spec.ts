// CWV NAV INTERACTIVITY — PERF-008 labelled navigation within 2.5 s.
//
// Asserts that a user can click a labelled navigation link on the homepage and
// complete the navigation within 2.5 s of page-load start, EVEN while the hero
// WebGL engine is still compiling shaders.  This ensures the JS main-thread
// work (shader compilation, hydration) does not block basic navigation.
//
// Measurement:
//   • CPU throttled 4× via Chrome DevTools Protocol (Chromium only) — same
//     multiplier as the Lighthouse mid-range mobile profile in lighthouserc.cjs.
//   • Network uses the Playwright webServer (localhost), so only CPU budget is
//     stressed; network is not throttled (matches how we isolate the CPU
//     contribution from the network contribution in the lab gate).
//   • t0 is captured immediately before page.goto() to bound the full cycle:
//     navigation start → URL change on the target route.
//   • We do NOT wait for scene-ready before clicking — that is the point.
//
// The nav links (Work, Writing, About, Contact) are rendered in SSR HTML, so
// they are in the DOM from the very first byte of the response.  The test
// verifies that JS does not hide, re-render, or steal focus from them during
// the compilation window.

import { test, expect } from '@playwright/test';

/** PERF-008 hard limit for nav interactivity. */
const NAV_BUDGET_MS = 2_500;

/** CPU throttle rate (4× — mid-range mobile profile). */
const CPU_THROTTLE_RATE = 4;

test('labelled nav (Work) is interactive within 2.5 s while hero engine compiles', async ({
  page,
  context,
}, testInfo) => {
  // CDP is only available on Chromium.
  test.skip(
    testInfo.project.name !== 'chromium',
    'CDP CPU throttle requires Chromium; other browsers skip this gate',
  );
  // Generous test timeout — 4× CPU on a heavily loaded CI runner can be slow.
  test.setTimeout(30_000);

  // Apply CPU throttle via CDP before navigation begins.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE });

  // Capture the absolute start time of the navigation cycle.
  const t0 = Date.now();

  // waitUntil: 'domcontentloaded' — we want the nav links to be in the DOM
  // but we explicitly do NOT wait for JS hydration or scene-ready.  The engine
  // compiles its shaders AFTER this point.
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // The 'Work' link (→ /projects) is the representative labelled nav target.
  // It is rendered by SiteNav.astro in the SSR HTML, class .overlay-blog-section,
  // with visible text 'Work'.
  const workLink = page.getByRole('link', { name: 'Work', exact: true });

  // The link must be in the DOM (SSR HTML guarantees this).
  const remainingBefore = NAV_BUDGET_MS - (Date.now() - t0);
  await expect(workLink).toBeAttached({ timeout: remainingBefore });

  // Click the link.  Playwright waits for the navigation to the target URL.
  const remainingBeforeClick = NAV_BUDGET_MS - (Date.now() - t0);
  await workLink.click({ timeout: remainingBeforeClick });

  // The full navigation (click → URL change) must finish within the budget.
  const elapsed = Date.now() - t0;

  expect(
    elapsed,
    `Navigation took ${elapsed} ms — must complete within ${NAV_BUDGET_MS} ms ` +
      `(CPU ${CPU_THROTTLE_RATE}× throttle applied via CDP)`,
  ).toBeLessThanOrEqual(NAV_BUDGET_MS);

  // Verify we actually arrived at the target route.
  await expect(page).toHaveURL(/\/projects\/?$/);
});
