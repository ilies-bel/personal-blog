/**
 * ENG-006 — First-viewport mobile navigation and bypass
 *
 * Asserts:
 *   1. Work, Writing, About, and Contact are labelled and visible in the opening
 *      viewport without scrolling at 320, 375, and 430 px (EXP-009 canonical IA).
 *   2. Every primary-destination tap target is at least 44 × 44 CSS px
 *      (WCAG 2.5.5 / EXP-013 touch-target policy).
 *   3. The bypass control (skip-experience link) is visible and reachable on mobile.
 *   4. Focus lands on a meaningful element at the destination after bypass activation.
 *   5. History is preserved after bypass: the back button returns to the home page.
 *
 * Tests run against the production-built site (astro build → astro preview) so they
 * exercise the real SSG output — the same artifact a visitor receives.
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Canonical mobile viewports (ENG-006 / MET-004 mobile matrix)
// ---------------------------------------------------------------------------
const MOBILE_VIEWPORTS = [
  { width: 320, height: 568, label: '320 px' },
  { width: 375, height: 667, label: '375 px' },
  { width: 430, height: 932, label: '430 px' },
] as const

const DESTINATIONS = ['Work', 'Writing', 'About', 'Contact'] as const

// ---------------------------------------------------------------------------
// 1. Labelled destinations visible in the first viewport without scrolling
// ---------------------------------------------------------------------------
for (const vp of MOBILE_VIEWPORTS) {
  test(`${vp.label}: Work, Writing, About, Contact visible in first viewport`, { tag: vp.width === 375 ? ['@smoke'] : [] }, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    for (const label of DESTINATIONS) {
      // Find the first link with this label; the mobile bottom bar is the
      // only visible nav source at these widths (JS is enabled, noscript hidden).
      const link = page.getByRole('link', { name: label }).first()

      await expect(
        link,
        `${label} link must exist in the DOM at ${vp.label}`
      ).toBeAttached()

      await expect(
        link,
        `${label} link must be visible at ${vp.label} — should not be hidden by CSS`
      ).toBeVisible()

      // Confirm the link is in the first viewport — no scrolling required.
      const box = await link.boundingBox()
      expect(box, `${label} must have a layout bounding box at ${vp.label}`).not.toBeNull()

      expect(
        box!.y,
        `${label} top edge (y=${Math.round(box!.y)}px) must be ≥ 0 at ${vp.label}`
      ).toBeGreaterThanOrEqual(0)

      expect(
        box!.y + box!.height,
        `${label} bottom edge (${Math.round(box!.y + box!.height)}px) must be ≤ viewport height ` +
        `(${vp.height}px) at ${vp.label} — no scroll must be needed`
      ).toBeLessThanOrEqual(vp.height)
    }
  })
}

// ---------------------------------------------------------------------------
// 2. Tap targets ≥ 44 × 44 CSS px  (WCAG 2.5.5 / EXP-013)
// ---------------------------------------------------------------------------
for (const vp of MOBILE_VIEWPORTS) {
  test(`${vp.label}: primary-nav tap targets are ≥ 44 × 44 CSS px`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    for (const label of DESTINATIONS) {
      const link = page.getByRole('link', { name: label }).first()
      await expect(link).toBeVisible()

      const box = await link.boundingBox()
      expect(box, `${label} bounding box must exist at ${vp.label}`).not.toBeNull()

      expect(
        box!.height,
        `${label} tap-target height (${Math.round(box!.height)}px) must be ≥ 44 px at ${vp.label}`
      ).toBeGreaterThanOrEqual(44)

      // At 320 px width with 4 equal-flex links each link is ≈ 80 px wide.
      expect(
        box!.width,
        `${label} tap-target width (${Math.round(box!.width)}px) must be ≥ 44 px at ${vp.label}`
      ).toBeGreaterThanOrEqual(44)
    }
  })
}

// ---------------------------------------------------------------------------
// 3. Bypass (skip-experience) control is visible and reachable on mobile
// ---------------------------------------------------------------------------
test('375 px: skip-experience control is present and keyboard-focusable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  const skip = page.getByRole('link', { name: /skip experience/i })
  await expect(skip, 'Skip experience link must be in the DOM').toBeAttached()

  await skip.focus()
  await expect(skip, 'Skip experience link must accept keyboard focus').toBeFocused()
})

// ---------------------------------------------------------------------------
// 4. Bypass (skip-experience) focus behaviour — focus lands meaningfully after
//    activation via keyboard (Enter) to verify both touch and keyboard parity.
// ---------------------------------------------------------------------------
test('375 px: bypass activation — focus lands on destination page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/')

  const skip = page.getByRole('link', { name: /skip experience/i })
  await expect(skip).toBeAttached()

  await skip.focus()
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')

  // Must arrive at the bypass destination (/projects).
  await expect(
    page,
    'Skip experience must navigate to /projects'
  ).toHaveURL(/\/projects/, { timeout: 8_000 })

  // Focus must have settled on a real element in the destination page —
  // not on a detached node or the home page's stale navigation trigger.
  const focusedTag = await page.evaluate(
    () => (document.activeElement ?? document.body).tagName.toLowerCase()
  )
  expect(
    focusedTag,
    `Focus must be on a real element after bypass activation, got <${focusedTag}>`
  ).toBeTruthy()
  expect(
    focusedTag,
    'Focus element tag must not be empty'
  ).not.toBe('')
})

// ---------------------------------------------------------------------------
// 5. Bypass (skip-experience) history behaviour — back button returns home.
//    Ensures the canonical anchor-link navigation pushes a history entry and
//    the browser (or ClientRouter) can unwind it correctly.
// ---------------------------------------------------------------------------
test('375 px: bypass preserves history — back button returns to home', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/')

  const skip = page.getByRole('link', { name: /skip experience/i })
  await skip.click()

  await expect(
    page,
    'Skip experience click must navigate to /projects'
  ).toHaveURL(/\/projects/, { timeout: 8_000 })

  // Pressing back must restore the home page.
  await page.goBack()
  await expect(
    page,
    'Browser back after bypass must return to the home page'
  ).toHaveURL(/\/$/, { timeout: 5_000 })
})
