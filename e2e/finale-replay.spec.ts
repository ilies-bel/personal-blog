/**
 * EXP-008 — Proof-rich finale: Replay control E2E
 *
 * Verifies that:
 *   1. The finale section (proof paths + directory + Replay button) exists
 *      in the home-page DOM.
 *   2. When the visitor scrolls to the very bottom (the pale-blue-dot finale),
 *      the Replay button becomes interactive and visible.
 *   3. Clicking Replay scrolls back to the top of the page (window.scrollY → 0)
 *      without triggering a full-page reload.
 *
 * The test exercises the scroll-driven visibility gate: `.bh-finale-section`
 * is `visibility: hidden` / `pointer-events: none` outside the finale band
 * and becomes visible when the scroll reaches the bottom.
 */

import { test, expect } from '@playwright/test'

test('EXP-008 — finale Replay button is present in the DOM', async ({ page }) => {
  await page.goto('/')

  // The Replay button must be in the DOM on the home page regardless of
  // scroll position (it is always rendered, just invisible outside the band).
  const replayBtn = page.getByRole('button', { name: /replay/i })
  await expect(
    replayBtn,
    'Expected a Replay button in the home-page DOM',
  ).toBeAttached()

  // The button must carry data-replay so Playwright tests and CSS can target it.
  const hasAttr = await replayBtn.getAttribute('data-replay')
  expect(hasAttr, 'Replay button must have data-replay attribute').not.toBeNull()
})

test('EXP-008 — finale section contains three proof path cards', async ({ page }) => {
  await page.goto('/')

  // Three proof path cards must be present (Fleet, memory-leak, Graveyard).
  const proofCards = page.locator('.bh-finale-proof-card')
  await expect(
    proofCards,
    'Expected exactly 3 proof path cards in the finale',
  ).toHaveCount(3)
})

test('EXP-008 — finale proof paths link to correct destinations', async ({ page }) => {
  await page.goto('/')

  const proofCards = page.locator('.bh-finale-proof-card')
  const hrefs = await proofCards.evaluateAll((cards) =>
    cards.map((c) => c.getAttribute('href') ?? ''),
  )

  // Expect Fleet, memory-leak investigation, and Graveyard links.
  expect(hrefs.some((h) => h.includes('projects')), 'Expected a link to /projects').toBe(true)
  expect(
    hrefs.some((h) => h.includes('memory-leak')),
    'Expected a link to the memory-leak investigation',
  ).toBe(true)
  expect(hrefs.some((h) => h.includes('graveyard')), 'Expected a link to /graveyard').toBe(true)
})

test('EXP-008 — Replay scrolls to page top without reload', async ({ page }) => {
  // Track whether a full reload fires during the test.
  let reloadDetected = false
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) reloadDetected = true
  })

  await page.goto('/')
  // Reset the flag: the initial navigation counts as framenavigated.
  reloadDetected = false

  // Scroll to the very bottom so the finale beat's band activates
  // (lifecycle progress → 0, raw scroll → 1).
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }),
  )

  // Wait for the Replay button to become visible (data-visible='true' on the
  // wrapper propagates visibility to the button via CSS inheritance).
  const replayBtn = page.getByRole('button', { name: /replay/i })
  await replayBtn.waitFor({ state: 'visible', timeout: 6_000 })

  // Verify we are actually at the bottom before clicking.
  const scrollAtBottom = await page.evaluate(
    () => window.scrollY >= document.body.scrollHeight - window.innerHeight - 50,
  )
  expect(scrollAtBottom, 'Page should be scrolled near the bottom before replay').toBe(true)

  // Click Replay and wait for the scroll to return to the top.
  await replayBtn.click()
  await page.waitForFunction(() => window.scrollY === 0, { timeout: 3_000 })

  const scrollY = await page.evaluate(() => window.scrollY)
  expect(scrollY, 'Replay must scroll the page back to the top').toBe(0)

  // No full-page reload should have occurred.
  expect(reloadDetected, 'Replay must not trigger a full-page reload').toBe(false)
})
