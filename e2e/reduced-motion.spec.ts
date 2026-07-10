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
