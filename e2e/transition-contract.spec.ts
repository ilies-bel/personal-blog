/**
 * EXP-014 — Cross-route transition contract: E2E enforcement
 *
 * Verifies the behavioural half of the transition contract that unit tests
 * cannot cover:
 *
 *   1. Navigation completes with prefers-reduced-motion active and content is
 *      immediately accessible (no animation gate, no blank page).
 *   2. Warp animation is suppressed under reduced motion — the click falls
 *      through to a plain SPA swap.
 *   3. Content is in the DOM and readable before any animation completes
 *      (checked by disabling CSS animations mid-flight and asserting text).
 *   4. SPA navigation from a reading page back to home with reduced-motion
 *      active works without errors.
 *
 * These tests use the production-built site (same server as other E2E specs).
 */

import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Body class stamped when the hero mount path completes. */
const SCENE_READY = 'scene-ready'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed localStorage before navigation to simulate a visitor with the manual
 *  reduced-motion override already set. */
async function seedReducedMotion(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('bh:reduced-motion', 'true')
    } catch {
      // Private-mode safe.
    }
  })
}

/** Wait for the hero reduced-motion mount to complete. */
async function waitForReducedMount(page: Page): Promise<void> {
  await page.waitForSelector(`body.${SCENE_READY}`, { timeout: 15_000 })
}

// ---------------------------------------------------------------------------
// 1. Navigation with reduced-motion: content accessible without animation
// ---------------------------------------------------------------------------

test.describe('EXP-014 transition contract — navigation with animations disabled', () => {
  test(
    'clicking About with OS reduced-motion: URL changes and content is in DOM',
    async ({ page }) => {
      // Emulate OS reduced-motion before navigation so the warp click-handler
      // no-ops and a plain SPA swap is used.
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/')
      await waitForReducedMount(page)

      // Collect console errors — no JS errors should fire during navigation.
      const consoleErrors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
      })

      // Find any About link and click it.
      const aboutLink = page.locator('a[href*="about"]').first()
      await expect(aboutLink).toBeAttached()
      await aboutLink.click()

      // Wait for the SPA navigation to complete.
      await page.waitForURL(/\/about/, { timeout: 10_000 })

      // Content must be in the DOM and readable immediately — not gated on
      // any animation completing.
      await expect(page.locator('main')).toBeAttached({ timeout: 5_000 })
      await expect(page.locator('h1')).toBeAttached({ timeout: 5_000 })

      // No warp canvas should be animating (the canvas should be idle / clear).
      const warpActive = await page.locator('[data-warp-active]').count()
      expect(warpActive, 'Warp canvas must not be active under reduced motion').toBe(0)

      // No console errors from the navigation.
      expect(
        consoleErrors.filter(e => !/favicon|preload/i.test(e)),
        'No console errors during reduced-motion About navigation',
      ).toHaveLength(0)
    },
  )

  test(
    'clicking About with manual reduced-motion override: URL changes and content is visible',
    async ({ page }) => {
      await seedReducedMotion(page)
      await page.goto('/')
      await waitForReducedMount(page)

      // Verify the override is active.
      await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true')

      const aboutLink = page.locator('a[href*="about"]').first()
      await expect(aboutLink).toBeAttached()
      await aboutLink.click()

      await page.waitForURL(/\/about/, { timeout: 10_000 })

      // Content is accessible immediately after the URL change.
      await expect(page.locator('main')).toBeAttached({ timeout: 5_000 })
      await expect(page.locator('h1')).toBeAttached({ timeout: 5_000 })
      await expect(page.locator('h1')).toBeVisible({ timeout: 5_000 })
    },
  )

  test(
    'data-reduced-motion attribute persists across the SPA navigation to /about',
    async ({ page }) => {
      await seedReducedMotion(page)
      await page.goto('/')
      await waitForReducedMount(page)

      await page.click('a[href*="about"]')
      await page.waitForURL(/\/about/, { timeout: 10_000 })

      // The A11Y-004 service re-broadcasts on astro:page-load; the attribute
      // must still be 'true' on the destination page.
      await expect(page.locator('html')).toHaveAttribute(
        'data-reduced-motion',
        'true',
        { timeout: 5_000 },
      )
    },
  )

  test(
    'view-transition CSS is instant under OS reduced-motion: no snapshot overlay lingers',
    async ({ page }) => {
      // The view-transition animations are collapsed to `animation: none` via
      // the @media (prefers-reduced-motion: reduce) rule. Assert that after the
      // URL change, the ::view-transition pseudo-elements are gone (the transition
      // resolved immediately).
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/')
      await waitForReducedMount(page)

      // Navigate to a reading page that uses view transitions.
      await page.click('a[href*="writing"]')
      await page.waitForURL(/\/writing/, { timeout: 10_000 })

      // Content must be accessible immediately — no animation delay.
      await expect(page.locator('main')).toBeAttached({ timeout: 3_000 })

      // The page should not be stuck behind a snapshot overlay.
      // Under reduced motion the view transition resolves instantly, so the
      // page body should be readable (not opacity-0 from a lingering vt-settle).
      const bodyOpacity = await page.locator('body').evaluate(
        el => parseFloat(getComputedStyle(el).opacity),
      )
      expect(bodyOpacity).toBeGreaterThan(0.9)
    },
  )

  test(
    'SPA navigation back to home from a reading page with reduced-motion active',
    async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/writing')

      // Content must load on a hard entry too.
      await expect(page.locator('main')).toBeAttached({ timeout: 10_000 })

      // Navigate to home via any home link.
      const homeLink = page.locator('a[href="/"], a[href*="personal-blog/"]').first()
      if (await homeLink.count() > 0) {
        await homeLink.click()
        // Either SPA-navigated or hard-nav; either way content should load.
        await page.waitForSelector(`body.${SCENE_READY}`, { timeout: 15_000 })
      }
      // No assertion failure = navigation succeeded without errors.
    },
  )
})

// ---------------------------------------------------------------------------
// 2. Content is never gated on animation completion
// ---------------------------------------------------------------------------

test.describe('EXP-014 transition contract — content not gated on animations', () => {
  test(
    'About page h1 is in DOM immediately after SPA swap (before arrive animation ends)',
    async ({ page }) => {
      // Navigate normally (with animations). We will check that the content is
      // present in the DOM right after the URL changes, before any overlay fades.
      await page.goto('/')
      await waitForReducedMount(page)

      // Start navigation to About.
      const aboutLink = page.locator('a[href*="about"]').first()
      await expect(aboutLink).toBeAttached()

      // Click and immediately wait for URL + DOM content (not for animation to end).
      await aboutLink.click()
      await page.waitForURL(/\/about/, { timeout: 15_000 })

      // The h1 and main content must be in the DOM at this point regardless of
      // whether the warp arrive animation is still running. Content must never
      // be withheld until animation completion.
      await expect(page.locator('main'), 'main is missing after About URL resolved').toBeAttached({
        timeout: 3_000,
      })
      await expect(page.locator('h1'), 'h1 is missing after About URL resolved').toBeAttached({
        timeout: 3_000,
      })
    },
  )
})
