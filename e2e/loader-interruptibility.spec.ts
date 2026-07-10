/**
 * EXP-006 — Truthful, interruptible loader contract
 *
 * The intro loader must never block navigation. These tests intercept (stall)
 * the engine chunks so the loader remains visible, then assert:
 *
 *   1. Primary nav links (Work, Writing, About, Contact) are the topmost
 *      element at their screen position — not covered by the loader overlay —
 *      so pointer and keyboard users can reach them immediately.
 *
 *   2. The skip button is in the accessibility tree from the first frame
 *      (not display:none / visibility:hidden) so keyboard users can Tab to it
 *      and dismiss the loader without waiting for the engine.
 *
 *   3. When a loader:timeout event fires (simulating the 8 s hard backstop),
 *      the page resolves to the usable no-WebGL edition: body.webgl-unavailable
 *      is set, the branded fallback note is visible, and body.loader-gone is set
 *      so star markers and nav links are unblocked.
 *
 * Implementation note — engine chunk interception
 * The production build emits two large engine chunks whose names include
 * "three-core" (three.js core ~500 KB gzip) and "createScene" (scene code
 * ~295 KB gzip).  Route interception stalls both so the loader stays visible
 * throughout the assertions.  The chunks are identified by their stable name
 * prefix, not the content-hash suffix (which changes on every rebuild).
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helper — stall the engine chunks so the loader remains on screen
// ---------------------------------------------------------------------------

/**
 * Register route interceptors that permanently stall the three.js engine
 * chunks.  The interceptors never call route.fulfill() / route.continue() /
 * route.abort(), so the requests hang open and the loader never dissolves.
 *
 * Call BEFORE page.goto() so the intercepts are in place for the initial load.
 */
async function stallEngineChunks(page: import('@playwright/test').Page): Promise<void> {
  // The warmThree chunk (three.js core — imports first, alone in its own task).
  await page.route('**/*three-core*.js', () => { /* stall — never respond */ })
  // The createScene chunk (scene code + addons — imports after warmThree resolves).
  await page.route('**/*createScene*.js', () => { /* stall — never respond */ })
}

// ---------------------------------------------------------------------------
// Test 1 — Nav links are clickable (topmost) while the engine chunk is stalled
// ---------------------------------------------------------------------------

test(
  'EXP-006: primary nav links are topmost (not covered by loader) while engine chunk is stalled',
  async ({ page }) => {
    await stallEngineChunks(page)

    await page.goto('/')
    // DOM is ready; other resources (React bundle, CSS) have loaded.
    await page.waitForLoadState('domcontentloaded')

    // Give the engine kickoff (setTimeout 0 + dynamic import) enough time to
    // fire and make the chunk request (which is now stalled).  The loader should
    // be showing because the chunk never resolves.
    await page.waitForTimeout(400)

    // The loader element must be present in the DOM (it is server-rendered).
    await expect(
      page.locator('.scene-loader'),
      'scene-loader must be in the DOM while engine chunk is stalled',
    ).toBeAttached()

    // For each primary destination: the nav link must be the topmost element at
    // its own screen position.  document.elementFromPoint() returns the highest
    // z-index element at a given coordinate; if the loader were covering the nav
    // (z-index 60 > nav z-index 21), it would be returned instead of the link.
    // With the EXP-006 fix (.overlay-blog raised to z-index 62), the link is on
    // top and elementFromPoint() returns it (or a child span inside it).
    const primaryNav = [
      { label: 'Work',    textMatch: 'Work'    },
      { label: 'Writing', textMatch: 'Writing' },
      { label: 'About',   textMatch: 'About'   },
      { label: 'Contact', textMatch: 'Contact' },
    ] as const

    for (const { label, textMatch } of primaryNav) {
      const isTopmost = await page.evaluate((text) => {
        // Find the nav link whose visible label matches.  The link text may include
        // decorative children (aria-hidden lock ticks), so we match on textContent
        // trimmed and startsWith.
        const links = Array.from(
          document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Sections"] a'),
        )
        const link = links.find((el) => el.textContent?.trim().startsWith(text))
        if (!link) return { found: false, reason: 'link not found' }

        const rect = link.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) {
          return { found: true, topmost: false, reason: 'zero-size bounding box' }
        }

        // Sample the centre of the link's bounding box.
        const x = rect.left + rect.width / 2
        const y = rect.top + rect.height / 2
        const top = document.elementFromPoint(x, y)

        // Accept the link itself OR any descendant (e.g. the inner label span).
        const isTop = top !== null && (link === top || link.contains(top))
        return {
          found: true,
          topmost: isTop,
          reason: isTop ? 'ok' : `covered by <${top?.tagName}> class="${top?.className}"`,
        }
      }, textMatch)

      expect(
        isTopmost.found,
        `"${label}" nav link must be present in the nav`,
      ).toBe(true)

      expect(
        (isTopmost as { topmost: boolean }).topmost,
        `"${label}" nav link must be the topmost element at its position while loader is showing (not covered by the loader overlay). Reason: ${(isTopmost as { reason: string }).reason}`,
      ).toBe(true)
    }
  },
)

// ---------------------------------------------------------------------------
// Test 2 — Skip button is in the accessibility tree from the first frame
// ---------------------------------------------------------------------------

test(
  'EXP-006: skip button is in accessibility tree (not display:none / visibility:hidden) while loading',
  async ({ page }) => {
    await stallEngineChunks(page)

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(200)

    // The skip button must exist in the DOM.
    const skipBtn = page.locator('.scene-loader-skip-btn')
    await expect(
      skipBtn,
      'Skip button must be attached to the DOM while loading',
    ).toBeAttached()

    // The button must NOT be removed from the tab order via display:none or
    // visibility:hidden.  opacity:0 is acceptable (the button animates in after
    // 1.5 s on non-reduced-motion paths, but keyboard users can Tab to it
    // immediately because opacity-zero elements remain focusable).
    const isFocusable = await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>('.scene-loader-skip-btn')
      if (!btn) return { focusable: false, reason: 'not in DOM' }
      const style = window.getComputedStyle(btn)
      if (style.display === 'none') return { focusable: false, reason: 'display:none' }
      if (style.visibility === 'hidden') {
        return { focusable: false, reason: 'visibility:hidden' }
      }
      return { focusable: true, reason: 'ok' }
    })

    expect(
      isFocusable.focusable,
      `Skip button must be keyboard-focusable while loading. Reason: ${isFocusable.reason}`,
    ).toBe(true)

    // The button must have pointer-events auto while the loader is present
    // (body does NOT have .scene-ready yet) so mouse users can click it too.
    const hasPointerEvents = await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>('.scene-loader-skip-btn')
      if (!btn) return false
      const style = window.getComputedStyle(btn)
      return style.pointerEvents !== 'none'
    })
    expect(
      hasPointerEvents,
      'Skip button must have pointer-events != none while loader is visible',
    ).toBe(true)
  },
)

// ---------------------------------------------------------------------------
// Test 3 — loader:timeout produces a usable no-WebGL edition
// ---------------------------------------------------------------------------

test(
  'EXP-006: dispatching loader:timeout resolves page to usable no-WebGL edition',
  async ({ page }) => {
    await stallEngineChunks(page)

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Wait for HeroIsland to hydrate and register its LOADER_TIMEOUT_EVENT
    // listener (useEffect runs after React reconciliation; 500 ms is generous
    // for the island's client:visible hydration + effect queue).
    await page.waitForTimeout(500)

    // Simulate the 8 s hard safety timeout firing: dispatch loader:timeout
    // (handled by HeroIsland → revealWithoutWebgl()) and then scene:ready
    // (handled by initLoader() → reveal()).  Both are idempotent, so the order
    // is not important; dispatching both ensures the full state-machine path
    // exercises regardless of which handler runs first.
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('loader:timeout'))
      // scene:ready is what initLoader's reveal() normally waits for; dispatch
      // it here too so the initLoader listener (if still active) fires its
      // reveal() path, exercising both sides of the state machine.
      window.dispatchEvent(new CustomEvent('scene:ready'))
    })

    // After revealWithoutWebgl():
    //   body.webgl-unavailable  — HeroIsland adds this on timeout
    //   body.scene-ready        — starts the loader dissolve
    //   body.loader-gone        — navigation fully unblocked
    await page.waitForFunction(
      () => document.body.classList.contains('webgl-unavailable'),
      { timeout: 3000 },
    )

    expect(
      await page.evaluate(() => document.body.classList.contains('webgl-unavailable')),
      'body.webgl-unavailable must be set after loader:timeout',
    ).toBe(true)

    expect(
      await page.evaluate(() => document.body.classList.contains('loader-gone')),
      'body.loader-gone must be set so nav/markers are unblocked after timeout',
    ).toBe(true)

    expect(
      await page.evaluate(() => document.body.classList.contains('scene-ready')),
      'body.scene-ready must be set (loader dissolve started) after timeout',
    ).toBe(true)

    // The branded no-WebGL fallback note must be visible (revealed by the body class).
    await expect(
      page.locator('.webgl-fallback'),
      'Branded WebGL-unavailable fallback note must be visible after timeout',
    ).toBeVisible()

    // Primary nav links must remain present and usable after the timeout path.
    const nav = page.locator('nav[aria-label="Sections"]')
    await expect(nav, 'Primary nav must be present after timeout').toBeAttached()
    for (const label of ['Work', 'Writing', 'About', 'Contact']) {
      await expect(
        nav.getByRole('link', { name: label, exact: true }),
        `"${label}" nav link must be present in the usable edition after timeout`,
      ).toBeAttached()
    }
  },
)
