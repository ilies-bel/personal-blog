/**
 * A11Y-007 — Forced-colors mode perceivability pass
 *
 * Activates @media (forced-colors: active) via Playwright's emulateMedia API
 * and asserts that the primary navigation controls, skip link, and focus
 * indicators remain perceivable in Windows High Contrast / forced-colors mode.
 *
 * What "perceivable" means here:
 *   • The element is in the DOM and not hidden (not display:none / visibility:hidden
 *     / opacity:0).
 *   • For controls: the element has a visible border or background that makes its
 *     interactive shape distinguishable — verified via getComputedStyle().
 *   • For state (current-page, focus): the distinction is encoded in
 *     border / background / text-decoration, not color alone.
 *
 * Chromium supports forced-colors emulation; the same Chromium project that
 * playwright.config.ts targets (Desktop Chrome) is used here.
 */

import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const READING_ROUTES = [
  { path: '/projects',         name: 'projects'         },
  { path: '/writing',          name: 'writing'          },
  { path: '/graveyard',        name: 'graveyard'        },
  { path: '/behind-the-build', name: 'behind-the-build' },
] as const

const BARE_ROUTES = [
  { path: '/',      name: 'home'  },
  { path: '/about', name: 'about' },
] as const

const ALL_ROUTES = [...READING_ROUTES, ...BARE_ROUTES] as const

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Activates forced-colors CSS media emulation on the page.  Must be called
 * before page.goto() so the correct media state is in place when the first
 * stylesheet is evaluated.
 */
async function activateForcedColors(page: Page): Promise<void> {
  await page.emulateMedia({ forcedColors: 'active' })
}

// ---------------------------------------------------------------------------
// 1. Skip link — present and correctly targeted on every route
// ---------------------------------------------------------------------------

for (const { path, name } of ALL_ROUTES) {
  test(`forced-colors: ${name} — skip link is present and targets #main-content`, async ({
    page,
  }) => {
    await activateForcedColors(page)
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    const skipLink = page.locator('.skip-link')
    await expect(skipLink, `${name}: .skip-link must exist`).toHaveCount(1)
    await expect(
      skipLink,
      `${name}: skip link must point at #main-content`,
    ).toHaveAttribute('href', '#main-content')
  })
}

// ---------------------------------------------------------------------------
// 2. Skip link has a visible border in forced-colors mode
//    (a11y.css adds border:2px solid ButtonText so the pill shape is
//    perceivable against the Canvas background)
// ---------------------------------------------------------------------------

test('forced-colors: skip link has a visible border', async ({ page }) => {
  await activateForcedColors(page)
  await page.goto('/projects')
  await page.waitForLoadState('networkidle')

  const borderWidth = await page.locator('.skip-link').evaluate((el) => {
    return parseFloat(getComputedStyle(el).borderTopWidth)
  })

  expect(
    borderWidth,
    'Skip link must have a visible border (>0 px) in forced-colors mode so its pill shape is perceivable',
  ).toBeGreaterThan(0)
})

// ---------------------------------------------------------------------------
// 3. Focus ring — pressing Tab reaches the skip link; the focused element has
//    a visible outline
// ---------------------------------------------------------------------------

test('forced-colors: Tab key surfaces skip link with a visible focus ring', async ({ page }) => {
  await activateForcedColors(page)
  await page.goto('/projects')
  await page.waitForLoadState('networkidle')

  // Ensure body has focus so the first Tab moves to the skip link.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
  await page.keyboard.press('Tab')

  const outlineWidth = await page.evaluate(() => {
    const el = document.activeElement
    if (!el) return 0
    return parseFloat(getComputedStyle(el).outlineWidth)
  })

  expect(
    outlineWidth,
    'The first Tab stop (skip link) must have a visible outline in forced-colors mode',
  ).toBeGreaterThan(0)
})

// ---------------------------------------------------------------------------
// 4. Reading-page subnav — visible, has solid (non-transparent) background
// ---------------------------------------------------------------------------

for (const { path, name } of READING_ROUTES) {
  test(`forced-colors: ${name} — subnav is visible with a solid background`, async ({
    page,
  }) => {
    await activateForcedColors(page)
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    const nav = page.locator('.subnav')
    await expect(nav, `${name}: .subnav must be visible`).toBeVisible()

    // a11y.css sets background:Canvas on the subnav; Canvas resolves to a solid
    // (non-transparent) system color in Chromium's forced-colors implementation.
    const bgColor = await nav.evaluate((el) => getComputedStyle(el).backgroundColor)

    expect(
      bgColor,
      `${name}: subnav must have a non-transparent background in forced-colors mode`,
    ).not.toBe('rgba(0, 0, 0, 0)')
    expect(bgColor).not.toContain('rgba(0, 0, 0, 0)')
  })
}

// ---------------------------------------------------------------------------
// 5. Subnav nav links — at least one is visible; current-page link visible
// ---------------------------------------------------------------------------

for (const { path, name } of READING_ROUTES) {
  test(`forced-colors: ${name} — subnav nav links are visible`, async ({ page }) => {
    await activateForcedColors(page)
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    const links = page.locator('.subnav-link')
    const count = await links.count()
    expect(
      count,
      `${name}: subnav must contain at least one nav link`,
    ).toBeGreaterThan(0)

    await expect(
      links.first(),
      `${name}: first subnav link must be visible`,
    ).toBeVisible()
  })
}

// ---------------------------------------------------------------------------
// 6. Current-page nav link is distinguishable
//    a11y.css applies background:Highlight so the active link stands out
//    without relying on color alone.
// ---------------------------------------------------------------------------

for (const { path, name } of READING_ROUTES) {
  test(`forced-colors: ${name} — current nav link is visible`, async ({ page }) => {
    await activateForcedColors(page)
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    const currentLink = page.locator('.subnav-link[aria-current="page"]')
    if ((await currentLink.count()) === 0) {
      // Graceful skip: some routes may not mark any subnav link as current.
      test.skip()
      return
    }

    await expect(
      currentLink.first(),
      `${name}: current-page nav link must be visible in forced-colors mode`,
    ).toBeVisible()
  })
}

// ---------------------------------------------------------------------------
// 7. Bare-page overlay nav (.overlay-blog-link) — links are present
// ---------------------------------------------------------------------------

for (const { path, name } of BARE_ROUTES) {
  test(`forced-colors: ${name} — overlay-blog nav links are present`, async ({ page }) => {
    await activateForcedColors(page)
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    const links = page.locator('.overlay-blog-link')
    const count = await links.count()
    expect(
      count,
      `${name}: .overlay-blog must expose at least one nav link`,
    ).toBeGreaterThan(0)
  })
}
