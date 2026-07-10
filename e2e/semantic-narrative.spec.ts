/**
 * Semantic narrative and status model suite — A11Y-003
 *
 * Verifies four invariants on the home-page hero:
 *
 *   1. A sequential, screen-reader-accessible narrative of the reverse
 *      stellar lifecycle exists in the document as a sr-only section (an
 *      ordered set of <h2> headings inside a labelled <section>).
 *
 *   2. All visual manifesto beat h2 elements (`.bh-beat-big`) are
 *      statically aria-hidden, so dynamic aria-hidden toggling on scroll
 *      never generates AT chatter.
 *
 *   3. No aria-live attributes appear on the beat containers that would
 *      cause screen readers to announce content continuously as scroll
 *      progress changes.
 *
 *   4. The accessible heading tree never contains duplicate <h2> text —
 *      neither between the sr-only narrative and the visual beats (which are
 *      aria-hidden), nor between the hydrated overlay and the <noscript>
 *      fallback (which is suppressed by the browser when JS is on).
 *
 * The webServer in playwright.config.ts builds the full static bundle before
 * serving it, so these tests exercise the real SSG + hydration output.
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Walk up the ancestor chain; return true if any ancestor has aria-hidden="true". */
async function isAriaHiddenViaAncestor(page: import('@playwright/test').Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    function hidden(el: Element | null): boolean {
      if (!el) return false
      if (el.getAttribute('aria-hidden') === 'true') return true
      return hidden(el.parentElement)
    }
    const el = document.querySelector(sel)
    return el ? hidden(el) : false
  }, selector)
}

// ---------------------------------------------------------------------------
// 1. sr-only narrative section exists
// ---------------------------------------------------------------------------

test('home — sr-only lifecycle narrative section is in the accessibility tree', async ({ page }) => {
  await page.goto('/')

  // The section must exist in the DOM and carry the expected aria-label.
  const section = page.locator('section[aria-label="Stellar lifecycle narrative"]')
  await expect(section, 'Expected sr-only lifecycle narrative section').toHaveCount(1)

  // It must contain at least one h2 — the beats.
  const headings = section.locator('h2')
  const count = await headings.count()
  expect(
    count,
    `Expected at least one h2 inside the lifecycle narrative section, found ${count}`,
  ).toBeGreaterThan(0)

  // The section itself must NOT be aria-hidden (it's the AT narrative source).
  const hidden = await isAriaHiddenViaAncestor(page, 'section[aria-label="Stellar lifecycle narrative"]')
  expect(
    hidden,
    'Expected the sr-only narrative section to be visible in the accessibility tree',
  ).toBe(false)
})

// ---------------------------------------------------------------------------
// 2. Visual beat h2s are statically aria-hidden (no scroll-driven chatter)
// ---------------------------------------------------------------------------

test('home — all visual manifesto beat h2s are aria-hidden (static, not scroll-driven)', async ({ page }) => {
  await page.goto('/')

  // All .bh-beat-big h2 elements must carry aria-hidden="true" so that
  // dynamic opacity / visibility changes on scroll never flip them into the
  // accessibility tree and generate continuous AT announcements.
  const beatH2s = await page.locator('.bh-beat-big').all()
  expect(
    beatH2s.length,
    'Expected at least one .bh-beat-big element on the home page',
  ).toBeGreaterThan(0)

  for (const el of beatH2s) {
    const ariaHidden = await el.getAttribute('aria-hidden')
    expect(
      ariaHidden,
      `Expected .bh-beat-big to have aria-hidden="true" (found "${ariaHidden}")`,
    ).toBe('true')
  }

  // Scroll to 50 % and verify the attribute hasn't been dynamically removed.
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight * 0.5 }))
  // Allow a rAF cycle for any scroll-driven DOM updates to settle.
  await page.waitForTimeout(100)

  const beatH2sAfterScroll = await page.locator('.bh-beat-big').all()
  for (const el of beatH2sAfterScroll) {
    const ariaHidden = await el.getAttribute('aria-hidden')
    expect(
      ariaHidden,
      'Expected .bh-beat-big to remain aria-hidden="true" after scrolling (no scroll-driven AT chatter)',
    ).toBe('true')
  }
})

// ---------------------------------------------------------------------------
// 3. No aria-live on scroll-reactive beat containers
// ---------------------------------------------------------------------------

test('home — no aria-live attributes on manifesto beat containers', async ({ page }) => {
  await page.goto('/')

  // aria-live on a .bh-beat would announce content each time the beat's
  // visibility changes (which happens on every scroll tick). None must exist.
  const liveBeats = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bh-beat, .bh-overlay'))
      .filter(el => el.hasAttribute('aria-live'))
      .map(el => `<${el.tagName.toLowerCase()} class="${el.className.trim()}" aria-live="${el.getAttribute('aria-live')}">`)
  )

  expect(
    liveBeats,
    `Expected no aria-live on .bh-beat or .bh-overlay elements, found: ${liveBeats.join(', ')}`,
  ).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// 4. No duplicate h2 text in the accessible heading tree
// ---------------------------------------------------------------------------

test('home — no duplicate h2 content in the accessible heading tree', async ({ page }) => {
  await page.goto('/')

  const duplicates = await page.evaluate(() => {
    function ariaHidden(el: Element): boolean {
      let node: Element | null = el
      while (node) {
        if (node.getAttribute('aria-hidden') === 'true') return true
        node = node.parentElement
      }
      return false
    }

    const h2s = Array.from(document.querySelectorAll('h2'))
      .filter(h => !ariaHidden(h))
      .map(h => h.textContent?.trim() ?? '')

    const seen = new Map<string, number>()
    for (const text of h2s) {
      seen.set(text, (seen.get(text) ?? 0) + 1)
    }

    return Array.from(seen.entries())
      .filter(([, count]) => count > 1)
      .map(([text, count]) => `"${text}" (×${count})`)
  })

  expect(
    duplicates,
    `Duplicate h2 content found in accessible tree: ${duplicates.join('; ')}`,
  ).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// 5. FinaleLedger nav is accessible when scrolled to the finale beat
// ---------------------------------------------------------------------------

test('home — site-index FinaleLedger nav is accessible at the bottom of the page', async ({ page }) => {
  await page.goto('/')

  // Scroll to the very bottom where the finale (pale blue dot) beat is active.
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight }))
  await page.waitForTimeout(200) // allow scroll-driven opacity + data-visible to update

  // The site-index nav must exist (it's always in the DOM via the finale beat).
  const ledger = page.locator('nav[aria-label="Site index"]')
  await expect(ledger, 'Expected .bh-finale-ledger nav[aria-label="Site index"] at the bottom').toHaveCount(1)

  // It must not be aria-hidden through any ancestor.
  const hiddenViaAncestor = await isAriaHiddenViaAncestor(
    page,
    'nav[aria-label="Site index"]',
  )
  expect(
    hiddenViaAncestor,
    'Expected the site-index nav to be reachable in the accessibility tree at the finale',
  ).toBe(false)
})
