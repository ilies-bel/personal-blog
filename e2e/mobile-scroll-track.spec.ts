/**
 * ENG-007 — Mobile scroll-track height verification.
 *
 * Navigates the home page at 390 × 844 px (iPhone 14 form factor) and
 * asserts that the .scene-track total height is between 7 and 9 viewport-
 * heights, per docs/specs/mobile-cut.md §2.
 *
 * Target: 6 stages × calc(8/6 × 100svh) ≈ 8 × 100svh = 800px at this viewport.
 * The test allows 7–9 viewport-heights (700–900 px at 100px svh) to survive minor
 * measurement variation across browser engines.
 *
 * This test exercises the production build (built by playwright.config.ts's
 * webServer) so the CSS rule in scene.css is fully compiled and applied.
 */

import { test, expect } from '@playwright/test'

// iPhone 14 / iPhone Pro form factor — the primary mobile target in mobile-cut.md.
const MOBILE_VIEWPORT = { width: 390, height: 844 }

// Acceptable total track height as a multiple of viewport heights (spec: 7–9).
const MIN_VIEWPORTS = 7
const MAX_VIEWPORTS = 9

test('mobile scroll track: total height is 7–9 viewport-heights at 390 px', async ({ page }) => {
  // Set the viewport BEFORE navigation so the layout is computed at mobile width.
  await page.setViewportSize(MOBILE_VIEWPORT)
  await page.goto('/')

  // Measure the .scene-track total scroll height and the viewport height so we
  // can express the track as a viewport multiple.
  const { trackHeight, viewportHeight } = await page.evaluate(() => {
    const track = document.querySelector('.scene-track')
    if (!track) return { trackHeight: 0, viewportHeight: window.innerHeight }
    return {
      trackHeight: track.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
    }
  })

  expect(trackHeight, 'scene-track height should be non-zero').toBeGreaterThan(0)
  expect(viewportHeight, 'viewport height should be non-zero').toBeGreaterThan(0)

  const viewportMultiple = trackHeight / viewportHeight

  expect(
    viewportMultiple,
    `scene-track is ${viewportMultiple.toFixed(2)} × viewport (expected ${MIN_VIEWPORTS}–${MAX_VIEWPORTS} × at 390 px); trackHeight=${trackHeight}px viewportHeight=${viewportHeight}px`,
  ).toBeGreaterThanOrEqual(MIN_VIEWPORTS)

  expect(
    viewportMultiple,
    `scene-track is ${viewportMultiple.toFixed(2)} × viewport (expected ${MIN_VIEWPORTS}–${MAX_VIEWPORTS} × at 390 px); trackHeight=${trackHeight}px viewportHeight=${viewportHeight}px`,
  ).toBeLessThanOrEqual(MAX_VIEWPORTS)
})

test('desktop scroll track: total height is unchanged (> 9 viewport-heights at 1280 px)', async ({ page }) => {
  // At desktop width the @media (max-width: 767px) rule does NOT apply.
  // The desktop track (6 × 300svh = 1800svh) is ~18 viewports, well above 9.
  // This asserts the mobile rule doesn't accidentally affect desktop.
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')

  const { trackHeight, viewportHeight } = await page.evaluate(() => {
    const track = document.querySelector('.scene-track')
    if (!track) return { trackHeight: 0, viewportHeight: window.innerHeight }
    return {
      trackHeight: track.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
    }
  })

  expect(trackHeight, 'scene-track height should be non-zero').toBeGreaterThan(0)

  const viewportMultiple = trackHeight / viewportHeight

  expect(
    viewportMultiple,
    `desktop scene-track should be > 9 viewports but got ${viewportMultiple.toFixed(2)}× (trackHeight=${trackHeight}px)`,
  ).toBeGreaterThan(MAX_VIEWPORTS)
})
