/**
 * QA-002 — History traversal regression suite
 *
 * ENG-002 / QA-002: Multi-step SPA navigation followed by browser-history
 * traversal (back and forward) must produce:
 *
 *   • Correct URL at each history step.
 *   • Primary nav present and operable after traversal.
 *   • Zero browser console errors throughout.
 *   • Zero network-level request failures throughout.
 *
 * Test 1 — Multi-step chain traversal  (@smoke @gate)
 *   Navigates home → /projects → /writing → /about via SPA links, then
 *   traverses back fully and forward one step, asserting URL and absence of
 *   errors/failures at each stop.
 *
 * Test 2 — Icon URL resolution after history restore  (@gate)
 *   Navigates into a nested post route, goes back to home, then forward again.
 *   Asserts that icon hrefs never become protocol-relative (ENG-002 regression
 *   guard) and that no resource requests fail after the restore.
 */

import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Shared monitor helper
// ---------------------------------------------------------------------------

interface Monitor {
  consoleErrors: string[]
  failedRequests: string[]
}

function attachMonitor(page: Page): Monitor {
  const consoleErrors: string[] = []
  const failedRequests: string[] = []

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })

  page.on('requestfailed', req => {
    failedRequests.push(
      `${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'unknown error'}`,
    )
  })

  return { consoleErrors, failedRequests }
}

// ---------------------------------------------------------------------------
// Test 1 — Multi-step navigation chain then full back/forward traversal
// ---------------------------------------------------------------------------

test(
  'history traversal — correct URL at each step, no errors or failures',
  { tag: ['@smoke'] },
  async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitor(page)

    // ── Step 1: home ─────────────────────────────────────────────────────
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // ── Step 2: home → /projects (SPA click) ─────────────────────────────
    await page
      .locator('nav[aria-label="Sections"]')
      .getByRole('link', { name: 'Work', exact: true })
      .click()
    await page.waitForURL('**/projects', { timeout: 8_000 })
    expect(page.url(), 'Step 2 must arrive at /projects').toMatch(/\/projects/)

    // ── Step 3: /projects → /writing (SPA click) ─────────────────────────
    await page
      .locator('nav[aria-label="Sections"]')
      .getByRole('link', { name: 'Writing', exact: true })
      .click()
    await page.waitForURL('**/writing', { timeout: 8_000 })
    expect(page.url(), 'Step 3 must arrive at /writing').toMatch(/\/writing/)

    // ── Step 4: /writing → /about (SPA click) ────────────────────────────
    await page
      .locator('nav[aria-label="Sections"]')
      .getByRole('link', { name: 'About', exact: true })
      .click()
    await page.waitForURL('**/about', { timeout: 8_000 })
    expect(page.url(), 'Step 4 must arrive at /about').toMatch(/\/about/)

    // ── Back traversal ────────────────────────────────────────────────────

    // /about → /writing
    await page.goBack()
    await page.waitForURL('**/writing', { timeout: 8_000 })
    expect(page.url(), 'Back step 1 must restore /writing').toMatch(/\/writing/)

    // /writing → /projects
    await page.goBack()
    await page.waitForURL('**/projects', { timeout: 8_000 })
    expect(page.url(), 'Back step 2 must restore /projects').toMatch(/\/projects/)

    // /projects → home
    await page.goBack()
    await page.waitForURL('**/', { timeout: 8_000 })
    expect(page.url(), 'Back step 3 must restore home').toMatch(/\/$/)

    // ── Forward traversal ─────────────────────────────────────────────────

    // home → /projects
    await page.goForward()
    await page.waitForURL('**/projects', { timeout: 8_000 })
    expect(page.url(), 'Forward step must restore /projects').toMatch(/\/projects/)

    // ── Post-traversal nav health check ───────────────────────────────────
    await expect(
      page.locator('nav[aria-label="Sections"]'),
      'Primary nav must remain attached after history traversal',
    ).toBeAttached()

    for (const label of ['Work', 'Writing', 'About', 'Contact']) {
      await expect(
        page
          .locator('nav[aria-label="Sections"]')
          .getByRole('link', { name: label, exact: true }),
        `"${label}" nav link must remain present after history traversal`,
      ).toBeAttached()
    }

    // ── Zero errors and failures throughout the full traversal chain ──────
    expect(
      consoleErrors,
      'Console errors detected during history traversal',
    ).toHaveLength(0)

    // Filter out ERR_ABORTED network failures: during SPA navigation (both
    // forward clicks and browser-history traversal), the browser aborts any
    // in-flight requests from the previous page.  These aborts are expected
    // and benign; they are not actual resource-loading failures.  Only truly
    // unexpected failures (connection refused, DNS error, 5xx, etc.) matter.
    const realFailures = failedRequests.filter(
      msg => !msg.includes('ERR_ABORTED'),
    )
    expect(
      realFailures,
      'Unexpected non-aborted network failures during history traversal',
    ).toHaveLength(0)
  },
)

// ---------------------------------------------------------------------------
// Test 2 — Icon URL resolution after history restore  (ENG-002 regression)
// ---------------------------------------------------------------------------

test(
  'icon hrefs remain root-relative after history restore (ENG-002)',
  async ({ page }) => {
    const { failedRequests } = attachMonitor(page)

    // Establish a history entry at home first so there is somewhere to go back to.
    // The home page loads Three.js which can take 10–15 s on a cold runner;
    // use `waitUntil: 'domcontentloaded'` throughout so we never stall on the
    // Three.js `load` event.  Icon <link> elements are in <head> and are
    // available as soon as the HTML is parsed.
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Navigate into a nested route (deeper path depth stresses relative-URL
    // resolution: icon hrefs would resolve against /posts/ if protocol-relative).
    await page.goto('/posts/memory-leak-search-and-destroy', {
      waitUntil: 'domcontentloaded',
    })

    // Go back to home via browser history.
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 20_000 })
    // After goBack with domcontentloaded, the URL is already '/'; waitForURL
    // with the same waitUntil confirms the URL match without re-waiting for load.
    await page.waitForURL('**/', { waitUntil: 'domcontentloaded', timeout: 20_000 })

    // Forward — restore the nested route.
    await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15_000 })
    await page.waitForURL('**/posts/memory-leak-search-and-destroy', {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    })

    // Read raw href attributes (not the browser-resolved .href property) to detect
    // protocol-relative strings like "//favicon.svg" before the browser normalises them.
    const iconHrefs = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLLinkElement>(
          'link[rel~="icon"], link[rel="apple-touch-icon"]',
        ),
      ).map(el => el.getAttribute('href') ?? ''),
    )

    expect(
      iconHrefs.length,
      'At least one icon <link> must be present after history restore',
    ).toBeGreaterThan(0)

    for (const href of iconHrefs) {
      expect(
        href,
        `Icon href "${href}" must not be protocol-relative (//) after history restore`,
      ).not.toMatch(/^\/\//)
    }

    // ERR_ABORTED failures are expected when navigating away from home: the browser
    // aborts in-flight Three.js bundle requests (client.js, BlackHole.js, etc.)
    // as soon as the navigation starts.  These are not true resource failures.
    const realFailures = failedRequests.filter(
      msg => !msg.includes('ERR_ABORTED'),
    )
    expect(
      realFailures,
      'Unexpected non-aborted network failures after history restore',
    ).toHaveLength(0)
  },
)
