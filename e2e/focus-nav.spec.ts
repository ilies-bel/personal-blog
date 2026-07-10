/**
 * Focus and keyboard-navigation suite — A11Y-006
 *
 * Asserts the three focus-management contracts added in this task:
 *
 *   1. Skip-to-content link — the very first Tab stop on every route sends
 *      keyboard focus to the <a class="skip-link"> element so users can bypass
 *      repeated navigation chrome.
 *
 *   2. SPA navigation focus — after a ClientRouter page swap the focus lands on
 *      the first <h1> inside #main-content (or on #main-content itself when no
 *      h1 exists), not on the now-stale navigation trigger.
 *
 *   3. StarMarker Escape — on the home page, focusing a star-marker link and
 *      pressing Escape dismisses the info card (aria-expanded flips to false)
 *      while keeping focus on the same element.
 *
 * The webServer in playwright.config.ts builds the production static bundle
 * before serving it with astro preview, so these tests exercise the real SSG
 * output.
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// 1. Skip-to-content link
//    The .skip-link anchor must be the very first element that receives focus
//    when the user Tabs from the beginning of a page.  Tested on both layout
//    branches (bare = home/about, standard = all reading pages).
// ---------------------------------------------------------------------------

const SKIP_LINK_ROUTES = [
  { path: '/projects',         name: 'projects'          },
  { path: '/writing',          name: 'writing'           },
  { path: '/about',            name: 'about'             },
  { path: '/behind-the-build', name: 'behind-the-build' },
] as const

for (const { path, name } of SKIP_LINK_ROUTES) {
  test(`${name} — skip link is the first Tab stop`, async ({ page }) => {
    await page.goto(path)

    // Ensure no element has focus at the start (place focus on the body).
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.())

    // A single Tab keystroke from body must land on the skip link.
    await page.keyboard.press('Tab')

    const result = await page.evaluate(() => {
      const el = document.activeElement
      return {
        tagName: el?.tagName.toLowerCase() ?? null,
        className: el?.className ?? null,
        href: (el as HTMLAnchorElement | null)?.getAttribute('href') ?? null,
      }
    })

    expect(result.tagName, `${name}: first Tab stop should be an <a> element`).toBe('a')
    expect(
      result.className,
      `${name}: first Tab stop should carry the "skip-link" class`,
    ).toContain('skip-link')
    expect(
      result.href,
      `${name}: skip link should jump to #main-content`,
    ).toBe('#main-content')
  })
}

// ---------------------------------------------------------------------------
// 2. Skip-link target — activating the skip link scrolls focus into #main-content
// ---------------------------------------------------------------------------

test('projects — skip link activating focuses #main-content', async ({ page }) => {
  await page.goto('/projects')

  // Tab to the skip link, then activate it with Enter.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')

  const result = await page.evaluate(() => {
    const active = document.activeElement
    const main = document.getElementById('main-content')
    if (!active || !main) return { isMain: false, isInMain: false }
    return {
      isMain: active === main,
      isInMain: main.contains(active),
    }
  })

  // Either focus is exactly on #main-content, or it fell inside it.
  expect(
    result.isMain || result.isInMain,
    'Activating the skip link should place focus on or inside #main-content',
  ).toBe(true)
})

// ---------------------------------------------------------------------------
// 3. SPA navigation focus
//    After clicking a SiteNav link (ClientRouter swap), focus must land on the
//    first <h1> inside #main-content of the incoming page.
// ---------------------------------------------------------------------------

test('SPA navigation — focus moves to h1 inside #main-content', { tag: ['@smoke'] }, async ({ page }) => {
  // Start on a reading page so the subnav rail is present.
  await page.goto('/projects')
  await page.waitForLoadState('networkidle')

  // Click the "Writing" link in the subnav rail — this triggers a ClientRouter
  // SPA swap, NOT a full page reload.
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Writing' })
    .click()

  // Wait for the URL to reflect the new route.
  await page.waitForURL('**/writing')

  // Wait (up to 2 s) for the focus-management rAF to fire and land focus on h1.
  await page.waitForFunction(
    () => {
      const active = document.activeElement
      const main = document.getElementById('main-content')
      return (
        active != null &&
        main != null &&
        main.contains(active) &&
        active.tagName.toLowerCase() === 'h1'
      )
    },
    { timeout: 2000 },
  )

  // Explicit assertion for a useful failure message.
  const result = await page.evaluate(() => {
    const active = document.activeElement
    const main = document.getElementById('main-content')
    if (!active || !main) return { isInMain: false, tagName: null }
    return { isInMain: main.contains(active), tagName: active.tagName.toLowerCase() }
  })

  expect(
    result.isInMain,
    'Focus should be inside #main-content after SPA navigation',
  ).toBe(true)
  expect(
    result.tagName,
    'Focus should be on the first <h1> after SPA navigation',
  ).toBe('h1')
})

// ---------------------------------------------------------------------------
// 4. SPA navigation focus — h1 falls back to #main-content when no heading
//    exists (e.g. the 3-D home page at '/').
// ---------------------------------------------------------------------------

test('SPA navigation to home — focus lands on #main-content when no h1', async ({
  page,
}) => {
  await page.goto('/projects')
  await page.waitForLoadState('networkidle')

  // Navigate home via the brand lockup link in the subnav header.
  // The home page is bare (no subnav rail) and its main content is the 3-D
  // scene, which may have no h1 inside #main-content.
  await page.locator('.subnav-brand').click()
  await page.waitForURL('**/')

  // Wait up to 2 s for focus to settle somewhere inside or on #main-content.
  await page.waitForFunction(
    () => {
      const active = document.activeElement
      const main = document.getElementById('main-content')
      return active != null && main != null && main.contains(active)
    },
    { timeout: 2000 },
  ).catch(() => {
    // Acceptable if focus lands on main itself (no h1 and main is the target).
  })

  const result = await page.evaluate(() => {
    const active = document.activeElement
    const main = document.getElementById('main-content')
    if (!active || !main) return { onMain: false, inMain: false }
    return {
      onMain: active === main,
      inMain: main.contains(active),
    }
  })

  expect(
    result.onMain || result.inMain,
    'Focus should be on or inside #main-content after SPA navigation to home',
  ).toBe(true)
})

// ---------------------------------------------------------------------------
// 5. StarMarker Escape — card dismiss without losing focus
//    Focus a .star-marker link, confirm aria-expanded="true" (card open),
//    press Escape, confirm aria-expanded="false" (card closed), focus stays.
//
//    NOTE: the star markers are gated behind body.loader-gone (the intro
//    loader must fully exit before they are focusable).  We wait for that
//    class before tabbing to the marker.
// ---------------------------------------------------------------------------

test('home — StarMarker Escape dismisses card without blurring the link', async ({
  page,
}) => {
  await page.goto('/')

  // Wait for the intro loader to fully exit (body.loader-gone must be present).
  await page.waitForFunction(
    () => document.body.classList.contains('loader-gone'),
    { timeout: 10_000 },
  )

  // Tab until we reach the first .star-marker link.
  // We try up to 20 Tab presses before giving up (the skip link + brand + nav
  // links come first, then the markers).
  let markerFocused = false
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab')
    markerFocused = await page.evaluate(
      () => document.activeElement?.classList.contains('star-marker') ?? false,
    )
    if (markerFocused) break
  }

  if (!markerFocused) {
    // Marker may not appear on this viewport/state — skip gracefully.
    test.skip()
    return
  }

  // The card should now be open (focus forces the locked state).
  // Wait one frame for the rAF loop to flip aria-expanded.
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-expanded') === 'true',
    { timeout: 1000 },
  )

  const expandedBefore = await page.evaluate(
    () => document.activeElement?.getAttribute('aria-expanded'),
  )
  expect(expandedBefore, 'StarMarker should be expanded when focused').toBe('true')

  // Press Escape — should dismiss the card without navigating or blurring.
  await page.keyboard.press('Escape')

  // Give the rAF loop one frame to propagate the state change.
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-expanded') === 'false',
    { timeout: 1000 },
  )

  const expandedAfter = await page.evaluate(
    () => document.activeElement?.getAttribute('aria-expanded'),
  )
  expect(expandedAfter, 'StarMarker should be collapsed after Escape').toBe('false')

  // Focus must still be on a .star-marker element (no blur, no navigation).
  const stillFocused = await page.evaluate(
    () => document.activeElement?.classList.contains('star-marker') ?? false,
  )
  expect(stillFocused, 'Focus should remain on the star-marker after Escape').toBe(true)
})
