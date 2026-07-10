/**
 * ENG-005 — Budget table overflow assertions
 *
 * The BUDGETS table on /behind-the-build must never widen the document beyond
 * the viewport. We assert this at two representative viewport sizes:
 *
 *   1. 320 × 568 px  — the narrowest phone in the canonical test matrix
 *      (MET-004 / EXP-012).
 *
 *   2. 640 × 900 px  — represents a 1280 px screen at 200 % browser zoom,
 *      which halves the effective CSS viewport to 640 px.
 *
 * The assertion: document.documentElement.scrollWidth must not exceed
 * window.innerWidth (i.e. no horizontal overflow pushed the document wider than
 * the viewport). A local scroll container on the wrapper div absorbs any excess
 * width the table may need, so neither the document nor the body scrolls.
 *
 * Table semantics (real <table> element, <th scope> headers) are verified by
 * asserting the element itself is present — Playwright will fail if the selector
 * does not match.
 */

import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helper — measure horizontal overflow
// ---------------------------------------------------------------------------

/** Returns true when the document does NOT overflow its viewport horizontally. */
async function noHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('/behind-the-build budget table — overflow containment', () => {
  /**
   * Viewport 1 — 320 px wide (narrowest phone, MET-004 canonical matrix).
   */
  test('document width does not exceed viewport at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/behind-the-build')

    // Confirm the real <table> element (and its screen-reader semantics) exists.
    const table = page.locator('table.btb-budget-table')
    await expect(table).toBeVisible()

    // Confirm the scroll wrapper is present.
    const wrap = page.locator('.btb-budget-table-wrap')
    await expect(wrap).toBeVisible()

    // Primary assertion: no horizontal document overflow.
    const ok = await noHorizontalOverflow(page)
    expect(ok, 'document.documentElement.scrollWidth > window.innerWidth at 320 px').toBe(true)
  })

  /**
   * Viewport 2 — 640 px wide, representing a 1280 px desktop at 200 % zoom.
   * At 200 % zoom the effective CSS viewport is half the physical width, so
   * a 1280 px screen presents a 640 px CSS viewport to the layout engine.
   */
  test('document width does not exceed viewport at 640 px (200 % zoom emulation)', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 900 })
    await page.goto('/behind-the-build')

    const table = page.locator('table.btb-budget-table')
    await expect(table).toBeVisible()

    const wrap = page.locator('.btb-budget-table-wrap')
    await expect(wrap).toBeVisible()

    const ok = await noHorizontalOverflow(page)
    expect(ok, 'document.documentElement.scrollWidth > window.innerWidth at 640 px').toBe(true)
  })

  /**
   * Screen-reader semantics — real <table> with scoped headers must be present
   * so AT table-navigation commands work. This is a basic presence check; a
   * full AT walkthrough is covered by the manual evidence in A11Y-005.
   */
  test('table has correct semantic markup for screen readers', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/behind-the-build')

    // Column headers
    await expect(page.locator('table.btb-budget-table thead th[scope="col"]')).toHaveCount(4)

    // Row headers (th[scope=row] inside tbody)
    const rowHeaders = page.locator('table.btb-budget-table tbody th[scope="row"]')
    await expect(rowHeaders).toHaveCount(6) // one per BUDGETS entry
  })
})
