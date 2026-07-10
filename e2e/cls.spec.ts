/**
 * PERF-005 — Lab CLS gate (Cumulative Layout Shift ≤ 0.02 per route)
 *
 * Measures the Layout Instability score on every public route using the
 * browser's PerformanceObserver / `layout-shift` entry type.  A PerformanceObserver
 * is injected via `addInitScript` so it starts collecting before the page
 * navigation fires — meaning every shift from the very first paint is captured.
 *
 * After navigation we:
 *   1. Wait for networkidle so all deferred images / fonts have loaded.
 *   2. Scroll the full page height to trigger any lazy-loaded images or
 *      late-mounting overlays that only appear after the initial viewport.
 *   3. Wait an additional settle window for any scroll-triggered JS.
 *   4. Read the accumulated CLS value and assert it is ≤ 0.02 (lab target
 *      from the PERF-005/PERF-008 budget table).
 *
 * hadRecentInput entries are skipped per spec (shifts caused by a deliberate
 * user gesture are not charged to CLS).  The scroll we perform here is a
 * programmatic `window.scrollTo` sequence — the browser marks those as
 * "not recent input" so they correctly count toward CLS.
 *
 * Evidence artifact: evidence/performance/intrinsic-media-cls-report.json
 */

import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Route manifest — every public route that must meet the CLS budget
// ---------------------------------------------------------------------------

const PUBLIC_ROUTES = [
  { path: '/',                                             name: 'home'              },
  { path: '/projects',                                     name: 'projects'          },
  { path: '/writing',                                      name: 'writing'           },
  { path: '/about',                                        name: 'about'             },
  { path: '/graveyard',                                    name: 'graveyard'         },
  { path: '/behind-the-build',                             name: 'behind-the-build'  },
  { path: '/posts/memory-leak-search-and-destroy',         name: 'post: memory-leak' },
  { path: '/posts/thanks-for-scrolling-to-the-bottom',    name: 'post: thanks-for-scrolling' },
] as const

/** Lab CLS target from PERF-005 / PERF-008 budget table (field budget is 0.10). */
const CLS_LAB_BUDGET = 0.02

// ---------------------------------------------------------------------------
// CLS observer — injected before navigation so zero shifts are missed
// ---------------------------------------------------------------------------

/**
 * Script injected into each page context before navigation via addInitScript.
 * Attaches a PerformanceObserver for `layout-shift` entries and accumulates
 * the hadRecentInput=false scores.  The result is available on `window.__cls`.
 */
const CLS_INIT_SCRIPT = `
  (() => {
    let __clsTotal = 0;
    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            __clsTotal += entry.value;
          }
        }
      });
      po.observe({ type: 'layout-shift', buffered: true });
    } catch (_) {
      // PerformanceObserver / layout-shift unavailable in this browser; leave at 0.
    }
    Object.defineProperty(window, '__cls', { get: () => __clsTotal });
  })();
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read the accumulated CLS value from the injected observer. */
async function readCLS(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as { __cls?: number }
    return w.__cls ?? 0
  })
}

/**
 * Scroll from the top to the bottom of the document in incremental steps to
 * trigger lazy-loading of below-the-fold images and late-mounting overlays.
 * A short pause between steps lets the browser paint and record any shifts
 * before the scroll position changes again.
 */
async function scrollPageFully(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const totalHeight = document.documentElement.scrollHeight
    const step = Math.max(300, Math.floor(window.innerHeight * 0.6))
    let current = 0
    while (current < totalHeight) {
      window.scrollTo(0, current)
      // Yield the microtask queue so the browser can fire IntersectionObserver
      // callbacks and load lazy images before the next step.
      await new Promise<void>((r) => setTimeout(r, 50))
      current += step
    }
    // Scroll back to the top so screenshots look correct on failure.
    window.scrollTo(0, 0)
  })
}

// ---------------------------------------------------------------------------
// PERF-005 CLS assertions — one per public route
// ---------------------------------------------------------------------------

for (const { path, name } of PUBLIC_ROUTES) {
  test(`PERF-005 — ${name} (${path}) — lab CLS ≤ ${CLS_LAB_BUDGET}`, async ({ page }) => {
    // Inject the observer before the page loads so it captures every layout shift
    // from the very first paint, including shifts driven by font-display:swap
    // or images that load before DOMContentLoaded.
    await page.addInitScript(CLS_INIT_SCRIPT)

    // Navigate and wait until network activity has fully settled — this ensures
    // lazy-loaded images and fonts that would otherwise be deferred are resolved
    // before we take our measurement.
    await page.goto(path, { waitUntil: 'networkidle' })

    // Scroll the full page to trigger lazy-loaded below-the-fold images and
    // any IntersectionObserver-driven overlays.
    await scrollPageFully(page)

    // Wait for any JS-driven late-mounting elements (overlays, counters, etc.)
    // to settle after the scroll sequence completes.
    await page.waitForTimeout(1_000)

    const cls = await readCLS(page)

    expect(
      cls,
      [
        `Lab CLS on ${path} exceeded the ${CLS_LAB_BUDGET} budget (got ${cls.toFixed(4)}).`,
        ``,
        `Common causes:`,
        `  • <img> without width/height attributes (browser reserves no height)`,
        `  • Web fonts without font-display:swap (FOIT → text reflow)`,
        `  • Late-mounting fixed/absolute overlays that push flow content`,
        ``,
        `Run with PWDEBUG=1 and inspect the PerformanceObserver entries for details.`,
      ].join('\n'),
    ).toBeLessThanOrEqual(CLS_LAB_BUDGET)
  })
}
