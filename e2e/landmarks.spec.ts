/**
 * Landmark structure suite — A11Y-002
 *
 * Asserts that every public route satisfies three structural accessibility
 * invariants:
 *   1. Exactly one <main> landmark in the document.
 *   2. Exactly one <h1> in the accessible tree (not inside aria-hidden).
 *   3. No heading level is skipped when going deeper (h1→h3 without h2 is
 *      invalid; h3→h2 is fine — going up in the outline is always allowed).
 *   4. Every <nav> and <aside> landmark carries an accessible name
 *      (aria-label or aria-labelledby).
 *
 * The checks mirror what an AT user experiences: aria-hidden subtrees are
 * excluded, and the noscript fallback is excluded (Playwright runs JS).
 *
 * The webServer in playwright.config.ts builds the full static bundle before
 * serving it, so these tests exercise the real SSG output.
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Route manifest
// ---------------------------------------------------------------------------

const AUDIT_ROUTES = [
  { path: '/',                                          name: 'home' },
  { path: '/projects',                                  name: 'projects' },
  { path: '/writing',                                   name: 'writing' },
  { path: '/about',                                     name: 'about' },
  { path: '/graveyard',                                 name: 'graveyard' },
  { path: '/behind-the-build',                          name: 'behind-the-build' },
  { path: '/posts/memory-leak-search-and-destroy',      name: 'post: memory-leak' },
  { path: '/posts/thanks-for-scrolling-to-the-bottom',  name: 'post: thanks-for-scrolling' },
  // 404 — any unknown path serves the built 404 page
  { path: '/a11y-probe-no-such-route',                  name: '404' },
] as const

// ---------------------------------------------------------------------------
// Per-route landmark assertions — one test per route
// ---------------------------------------------------------------------------

for (const { path, name } of AUDIT_ROUTES) {
  test(`${name} — landmark structure (main, h1, heading order, named regions)`, async ({ page }) => {
    await page.goto(path)

    // ------------------------------------------------------------------
    // 1. Exactly one <main> landmark
    // ------------------------------------------------------------------
    const mainCount = await page.locator('main').count()
    expect(
      mainCount,
      `${name}: expected exactly 1 <main>, found ${mainCount}`,
    ).toBe(1)

    // ------------------------------------------------------------------
    // 2. Heading outline — one h1 + no skipped levels going deeper
    // ------------------------------------------------------------------
    const headingResult = await page.evaluate(() => {
      function ariaHidden(el: Element): boolean {
        let node: Element | null = el
        while (node) {
          if (node.getAttribute('aria-hidden') === 'true') return true
          node = node.parentElement
        }
        return false
      }

      const headings = Array.from(
        document.querySelectorAll('h1, h2, h3, h4, h5, h6'),
      ).filter(h => !ariaHidden(h))

      const levels = headings.map(h => parseInt(h.tagName[1], 10))
      const h1Count = levels.filter(l => l === 1).length

      // Collect any jumps where a heading goes more than one level deeper
      // than the previous one — e.g. h1 → h3 is a skip.
      const skips: string[] = []
      for (let i = 1; i < levels.length; i++) {
        if (levels[i] > levels[i - 1] + 1) {
          skips.push(`h${levels[i - 1]} → h${levels[i]}`)
        }
      }

      return { h1Count, levels, skips }
    })

    expect(
      headingResult.h1Count,
      `${name}: expected exactly 1 <h1> in accessible tree, found ${headingResult.h1Count}`,
    ).toBe(1)

    expect(
      headingResult.skips,
      `${name}: heading level skips detected: ${headingResult.skips.join(', ')}`,
    ).toHaveLength(0)

    // ------------------------------------------------------------------
    // 3. All <nav> and <aside> landmarks carry an accessible name
    // ------------------------------------------------------------------
    const unnamedLandmarks = await page.evaluate(() => {
      function ariaHidden(el: Element): boolean {
        let node: Element | null = el
        while (node) {
          if (node.getAttribute('aria-hidden') === 'true') return true
          node = node.parentElement
        }
        return false
      }

      return Array.from(document.querySelectorAll('nav, aside'))
        .filter(el => !ariaHidden(el))
        .filter(
          el =>
            !el.getAttribute('aria-label') &&
            !el.getAttribute('aria-labelledby'),
        )
        .map(
          el =>
            `<${el.tagName.toLowerCase()} class="${el.className.trim()}">`,
        )
    })

    expect(
      unnamedLandmarks,
      `${name}: unnamed nav/aside landmarks: ${unnamedLandmarks.join(', ')}`,
    ).toHaveLength(0)
  })
}
