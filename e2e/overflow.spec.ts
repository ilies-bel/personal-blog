/**
 * Overflow guard — ENG-004 responsive-wrapping regression suite
 *
 * Visits every post route at the narrow viewport widths where long technical
 * identifiers historically caused page-level horizontal overflow, and asserts
 * that document.scrollingElement.scrollWidth never exceeds window.innerWidth.
 *
 * Strategy:
 *   • overflow-x: auto is intentionally set on .prose pre so code blocks can
 *     scroll horizontally — that is expected and correct.
 *   • The DOCUMENT must never scroll horizontally: only inner scroll containers
 *     (pre blocks) may overflow.  The test targets document.scrollingElement,
 *     which is the html element in standard browsers, so a pre block that
 *     scrolls internally does not trip the assertion.
 *
 * Viewports tested match the 320–430 px "danger band" from ENG-004:
 *   320 px — absolute minimum (WCAG SC 1.4.10 reference width)
 *   360 px — common small Android
 *   375 px — iPhone SE / 8
 *   390 px — iPhone 14 / 15
 *   412 px — Pixel 6 / 7
 *   430 px — iPhone 14 Plus / 15 Plus
 */

import { test, expect } from '@playwright/test'

/** Published post slugs derived from src/content/posts/. */
const POST_ROUTES = [
  { path: '/posts/memory-leak-search-and-destroy',     name: 'post: memory-leak' },
  { path: '/posts/thanks-for-scrolling-to-the-bottom', name: 'post: thanks-for-scrolling' },
] as const

/** Narrow viewport widths to test (px). */
const VIEWPORT_WIDTHS = [320, 360, 375, 390, 412, 430] as const

for (const { path, name } of POST_ROUTES) {
  for (const width of VIEWPORT_WIDTHS) {
    test(`${name} — no document overflow at ${width}px`, async ({ page }) => {
      // Set viewport before navigation so the layout is computed at target width.
      await page.setViewportSize({ width, height: 812 })
      await page.goto(path)

      // Wait for the page to settle (fonts, deferred hydration islands).
      await page.waitForLoadState('networkidle')

      const scrollWidth = await page.evaluate(
        () => (document.scrollingElement ?? document.documentElement).scrollWidth,
      )

      expect(
        scrollWidth,
        `Horizontal document overflow at ${width}px on ${path}: ` +
          `scrollWidth=${scrollWidth} > innerWidth=${width}`,
      ).toBeLessThanOrEqual(width)
    })
  }
}
