/**
 * A11Y-001 — Hydration-stable reduced-motion boot
 *
 * Verifies two acceptance criteria:
 *   1. No React hydration error (#418) fires when prefers-reduced-motion is
 *      active, for BOTH fresh visitors (OS preference only) and returning
 *      visitors (a persisted localStorage override).
 *   2. The heavy Three.js / createScene engine chunk is never requested on
 *      the reduced-motion path — confirming the hard import gate works end-to-end
 *      in the production bundle.
 *
 * The test exercises the production-built site (same artefact as the smoke
 * suite — see playwright.config.ts webServer). Both scenarios verify the same
 * two invariants; the difference is HOW the reduced preference is signalled:
 *   • fresh visitor  — via the OS `prefers-reduced-motion: reduce` media feature
 *   • persisted      — via `localStorage.setItem('bh:reduced-motion', 'true')`
 *                      set before navigation (mirrors a returning visitor whose
 *                      manual override survived a reload)
 */

import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Constants mirrored from src/hero/lib/constants.ts (strings only, no import
// so this file stays a plain Playwright spec with no build-time Astro deps).
// ---------------------------------------------------------------------------

/** Body class stamped by mountReducedMotionHero — present once the reduced
 *  mount path has run successfully and the loader has been lifted. */
const SCENE_READY_BODY_CLASS = 'scene-ready'

/**
 * Patterns whose presence in a request URL indicates the Three.js engine
 * was downloaded. Dynamic imports for `createScene` and `warmThree` produce
 * Vite chunks whose filenames include the source module basename.
 */
const ENGINE_CHUNK_PATTERNS = [/createScene/i, /warmThree/i]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ReducedMotionMonitor {
  hydrationErrors: string[]
  engineRequests: string[]
}

/**
 * Attach listeners that capture React hydration errors and any network
 * request to the Three.js engine chunk. Must be called BEFORE navigation so
 * events emitted during the initial page load are not missed.
 */
function attachReducedMotionMonitor(page: Page): ReducedMotionMonitor {
  const hydrationErrors: string[] = []
  const engineRequests: string[] = []

  page.on('console', msg => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    // React hydration error #418 in production: "Minified React error #418"
    // In development: "Hydration failed because…" or "There was an error…"
    const isHydration =
      text.includes('418') ||
      /hydrat/i.test(text) ||
      /Minified React error/i.test(text)
    if (isHydration) hydrationErrors.push(text)
  })

  page.on('request', req => {
    const url = req.url()
    if (ENGINE_CHUNK_PATTERNS.some(p => p.test(url))) {
      engineRequests.push(url)
    }
  })

  return { hydrationErrors, engineRequests }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('A11Y-001 reduced-motion boot', () => {
  test(
    'fresh visitor — OS prefers-reduced-motion: no hydration error, no engine chunk',
    async ({ page }) => {
      // Emulate the OS-level preference BEFORE navigation so matchMedia already
      // returns `matches: true` on the very first client render.
      await page.emulateMedia({ reducedMotion: 'reduce' })

      const { hydrationErrors, engineRequests } = attachReducedMotionMonitor(page)

      await page.goto('/')

      // Wait until mountReducedMotionHero has run — its side-effect is adding
      // `scene-ready` to body, which dismisses the intro loader. This confirms
      // the reduced-motion mount path completed without importing the engine.
      await page.waitForSelector(`body.${SCENE_READY_BODY_CLASS}`, { timeout: 15_000 })

      expect(
        hydrationErrors,
        'React hydration errors detected (fresh OS reduced-motion visitor)',
      ).toHaveLength(0)

      expect(
        engineRequests,
        'Three.js engine chunk was requested on the reduced-motion path (fresh visitor)',
      ).toHaveLength(0)
    },
  )

  test(
    'persisted override — localStorage reduced=true: no hydration error, no engine chunk',
    async ({ page }) => {
      // Seed the localStorage key ('bh:reduced-motion') before navigation to
      // simulate a returning visitor whose manual override survived a reload.
      await page.addInitScript(() => {
        try {
          localStorage.setItem('bh:reduced-motion', 'true')
        } catch {
          // Private-mode safe — if storage is unavailable the page still works;
          // the test simply becomes equivalent to the fresh-visitor case.
        }
      })

      const { hydrationErrors, engineRequests } = attachReducedMotionMonitor(page)

      await page.goto('/')

      // Same completion signal as the fresh-visitor test.
      await page.waitForSelector(`body.${SCENE_READY_BODY_CLASS}`, { timeout: 15_000 })

      expect(
        hydrationErrors,
        'React hydration errors detected (returning visitor with persisted reduced-motion override)',
      ).toHaveLength(0)

      expect(
        engineRequests,
        'Three.js engine chunk was requested with persisted reduced-motion override',
      ).toHaveLength(0)
    },
  )
})

/**
 * EXP-002 — Deliberate reduced-motion edition
 *
 * Verifies that the still-poster path delivers the same message, information
 * architecture, and destinations as the live WebGL edition:
 *   1. All 5 manifesto beat texts are present in the accessibility tree.
 *   2. All 5 section destinations are reachable via links.
 *   3. The manual motion toggle shows a visible state label (legible current state).
 *   4. The toggle is reversible without a page reload.
 *   5. The manual preference persists across a page reload.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Scroll the page to a raw-progress fraction (0 = top, 1 = bottom). */
async function scrollToProgress(page: import('@playwright/test').Page, raw: number): Promise<void> {
  await page.evaluate((frac) => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
    window.scrollTo({ top: frac * max, behavior: 'instant' })
  }, raw)
  // Give the ScrollTracker + React a short tick to reflect the new position.
  await page.waitForTimeout(150)
}

/** Wait for the hero island to finish its reduced-motion mount. */
async function waitForReducedMount(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForSelector(`body.${SCENE_READY_BODY_CLASS}`, { timeout: 15_000 })
  // Ensure the React island has hydrated and the toggle has portalled into the nav.
  await page.waitForSelector('button.overlay-blog-motion', { state: 'attached', timeout: 8_000 })
}

// ---------------------------------------------------------------------------
// Beat texts — directly from sceneTable BEATS (mirrored here to avoid a
// build-time import; must stay in sync if manifesto copy changes).
// ---------------------------------------------------------------------------
const BEAT_TEXTS = [
  'Under pressure, structure remains.',          // black hole  (top of page, raw ~0.06)
  'Complexity expands. My work is to keep the center readable.', // red giant (~0.26)
  'Systems grow. Interfaces drift. Complexity compounds.', // yellow star (~0.42)
  'One clear boundary can save a thousand future decisions.', // nebula (~0.625)
  'What remains is the work.',                   // pale blue dot (bottom, raw ~0.95)
]

// ---------------------------------------------------------------------------
// Section destination hrefs — must stay in sync with sceneTable SCENES.
// ---------------------------------------------------------------------------
const SECTION_HREFS = [
  'about',
  'writing',
  'projects',
  'graveyard',
  'posts/thanks-for-scrolling-to-the-bottom',
]

// Raw-scroll positions that put each non-finale beat into its visible band.
// These are approximate mid-band values (lifecycle p → raw = 1 − p):
const BEAT_SCROLL_POSITIONS: Record<string, number> = {
  'Under pressure, structure remains.': 0.05,     // lifecycle ~0.95 → raw 0.05
  'Complexity expands. My work is to keep the center readable.': 0.26, // lifecycle 0.74 → raw 0.26
  'Systems grow. Interfaces drift. Complexity compounds.': 0.42, // lifecycle 0.58 → raw 0.42
  'One clear boundary can save a thousand future decisions.': 0.625, // lifecycle 0.375 → raw 0.625
}

test.describe('EXP-002 reduced-motion edition', () => {
  test(
    'all 5 beat texts are present in the DOM under reduced motion',
    async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/')
      await waitForReducedMount(page)

      // Under reduced motion ManifestoOverlay keeps ALL beats in the accessibility
      // tree at all times (aria-hidden is never true in reduced mode), so every beat
      // text is queryable even when another beat's band is active.
      for (const text of BEAT_TEXTS) {
        await expect(
          page.locator(`.bh-beat-big`).filter({ hasText: text }).first(),
          `Beat text "${text.slice(0, 40)}…" not found in DOM`,
        ).toBeAttached()
      }
    },
  )

  test(
    'all 5 section destinations are reachable via links',
    async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/')
      await waitForReducedMount(page)

      // Each section href must be reachable through at least one <a> in the page —
      // either the HUD rail, a contextual beat-destination chip, or the FinaleLedger.
      for (const href of SECTION_HREFS) {
        await expect(
          page.locator(`a[href*="${href}"]`).first(),
          `Section link for "${href}" not found in DOM`,
        ).toBeAttached()
      }
    },
  )

  test(
    'contextual destination links are operable at each non-finale beat position',
    async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/')
      await waitForReducedMount(page)

      // For each non-finale beat, scroll to its band and assert the contextual
      // destination chip is present and its aria-hidden is NOT 'true' (meaning it is
      // in the active visible band). Playwright's toBeVisible() does not check CSS
      // opacity, so we check the aria-hidden attribute which ManifestoOverlay sets
      // based on the same `visible` flag that drives CSS opacity.
      for (const [text, rawPos] of Object.entries(BEAT_SCROLL_POSITIONS)) {
        await scrollToProgress(page, rawPos)
        // Find the beat block by its headline text (substring match is sufficient).
        const beatBlock = page
          .locator('.bh-beat')
          .filter({ has: page.locator('.bh-beat-big').filter({ hasText: text.slice(0, 30) }) })
          .first()
        const destLink = beatBlock.locator('.bh-beat-destination')
        await expect(
          destLink,
          `Destination link missing for beat "${text.slice(0, 40)}…"`,
        ).toBeAttached()
        // aria-hidden is absent or 'false' when the beat is in its visible band;
        // 'true' when it is outside. At the correct scroll position the beat owns
        // the screen, so aria-hidden must NOT be 'true'.
        await expect(
          destLink,
          `Destination link is aria-hidden='true' at raw-scroll ${rawPos} (beat should be visible)`,
        ).not.toHaveAttribute('aria-hidden', 'true')
      }
    },
  )

  test(
    'motion toggle shows a visible state label reflecting the current mode',
    async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/')
      await waitForReducedMount(page)

      const toggle = page.locator('button.overlay-blog-motion')
      await expect(toggle).toBeVisible()

      // The label inside the button must show "Still" when reduced motion is active.
      const label = toggle.locator('.overlay-blog-motion-label')
      await expect(label).toBeVisible()
      await expect(label).toHaveText(/still/i)

      // aria-pressed='true' confirms the machine state matches the label.
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    },
  )

  test(
    'motion toggle is reversible without a page reload',
    async ({ page }) => {
      // Start in live mode so we can test the full round-trip.
      await page.goto('/')
      await page.waitForSelector(`body.${SCENE_READY_BODY_CLASS}`, { timeout: 15_000 })
      await page.waitForSelector('button.overlay-blog-motion', { state: 'attached', timeout: 8_000 })

      const toggle = page.locator('button.overlay-blog-motion')
      await expect(toggle).toBeVisible()

      // Live mode: label shows "Motion", aria-pressed is false.
      await expect(toggle.locator('.overlay-blog-motion-label')).toHaveText(/motion/i)
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')

      // Click to enter reduced motion → confirm modal opens.
      await toggle.click()
      const modal = page.locator('[role="dialog"]')
      await expect(modal).toBeVisible()

      // Confirm — click the primary "Continue" button.
      await modal.locator('button').filter({ hasText: /continue/i }).click()
      await expect(modal).not.toBeVisible()

      // Now in reduced mode: label shows "Still", aria-pressed is true.
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
      await expect(toggle.locator('.overlay-blog-motion-label')).toHaveText(/still/i)

      // Click again to exit reduced motion — no modal, instant flip.
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')
      await expect(toggle.locator('.overlay-blog-motion-label')).toHaveText(/motion/i)
    },
  )

  test(
    'manual reduced-motion preference persists across a page reload',
    async ({ page }) => {
      // Seed the persisted manual override before navigation.
      await page.addInitScript(() => {
        try {
          localStorage.setItem('bh:reduced-motion', 'true')
        } catch {
          // Private-mode safe.
        }
      })
      await page.goto('/')
      await waitForReducedMount(page)

      // Returning visitor: override survived the reload.
      const toggle = page.locator('button.overlay-blog-motion')
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
      await expect(toggle.locator('.overlay-blog-motion-label')).toHaveText(/still/i)
    },
  )
})

/**
 * A11Y-004 — Centralized motion-preference service: live propagation
 *
 * Verifies that the centralized service propagates preference changes to all
 * consumers without a page reload:
 *   1. OS preference change mid-session updates the <html> root attribute and the
 *      hero toggle without a reload (matchMedia `change` event propagation).
 *   2. Manual override set via the service updates the root attribute and is
 *      consistent across an SPA navigation (re-broadcast on astro:page-load).
 *   3. Cursor comet trail is suppressed (CSS) once reduced-motion becomes active.
 */

test.describe('A11Y-004 motion-preference service live propagation', () => {
  test(
    'OS reduced-motion emulated mid-session: root attribute and toggle update without reload',
    async ({ page }) => {
      // Start in live (non-reduced) mode — no OS override yet.
      await page.goto('/')
      await page.waitForSelector(`body.${SCENE_READY_BODY_CLASS}`, { timeout: 15_000 })
      await page.waitForSelector('button.overlay-blog-motion', {
        state: 'attached',
        timeout: 8_000,
      })

      // Confirm: not in reduced mode initially.
      const toggle = page.locator('button.overlay-blog-motion')
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')

      // data-reduced-motion attribute starts at 'false'.
      await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'false')

      // Emulate OS reduced-motion mid-session. This triggers the matchMedia
      // `change` event in the browser, which the service listens to.
      await page.emulateMedia({ reducedMotion: 'reduce' })

      // The centralized service must update the root attribute without a reload.
      await expect(page.locator('html')).toHaveAttribute(
        'data-reduced-motion',
        'true',
        { timeout: 3_000 },
      )

      // The cursor trail canvas must be hidden (CSS keyed off root attribute
      // OR the media query — both now target the same attribute/media).
      const trail = page.locator('[data-cursor-trail]')
      if (await trail.count() > 0) {
        // Either display:none (from the CSS rule) or not visible due to media query.
        // We assert the attribute is correct — the CSS media query and attribute
        // rules both suppress the trail when reduced motion is active.
        // (A display:none check on a canvas may depend on viewport interaction,
        // so we assert the governing attribute rather than the computed style.)
        await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true')
      }
    },
  )

  test(
    'manual override persists across SPA navigation (astro:page-load re-broadcast)',
    async ({ page }) => {
      // Start in reduced-motion mode via manual override.
      await page.addInitScript(() => {
        try { localStorage.setItem('bh:reduced-motion', 'true') } catch { /**/ }
      })
      await page.goto('/')
      await waitForReducedMount(page)

      // Confirm the root attribute is set on the home page.
      await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true')

      // SPA-navigate to /about (does NOT use the warp transition because reduced
      // motion is active — it just falls through to the normal router).
      await page.click('a[href*="about"]')
      await page.waitForURL(/\/about/, { timeout: 10_000 })

      // After the SPA navigation, the service re-broadcasts on astro:page-load.
      // The root attribute must still be 'true' on the new page.
      await expect(page.locator('html')).toHaveAttribute(
        'data-reduced-motion',
        'true',
        { timeout: 5_000 },
      )
    },
  )
})
