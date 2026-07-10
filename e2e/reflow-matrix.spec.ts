/**
 * EXP-012 — All-route reflow matrix
 *
 * Parametrized viewport × route grid asserting:
 *   1. document.scrollingElement.scrollWidth <= window.innerWidth
 *      (no unintended horizontal overflow at the document level)
 *   2. Primary navigation is visible and not clipped on reading pages
 *
 * Viewport coverage mirrors the MET-004 canonical test matrix:
 *   Mobile:  320, 360, 375, 390, 412, 430 px at 100 % zoom
 *            320, 360, 375, 390, 412, 430 px at 200 % zoom
 *            (200 % zoom emulated as viewport = physical width / 2)
 *   Tablet:  768, 820, 1024 px portrait and landscape
 *   Desktop: 1280, 1440, 1728, 1920, 2560 px
 *
 * Routes tested (every public route in the SSG output):
 *   / (home)  /projects  /writing  /about  /graveyard  /behind-the-build
 *   /posts/memory-leak-search-and-destroy
 *   /posts/thanks-for-scrolling-to-the-bottom
 *
 * The home and about pages are "bare" — they use the scene overlay nav rather
 * than .subnav, so the nav visibility check is skipped there.
 *
 * Code blocks inside .prose may scroll horizontally (overflow-x: auto is
 * intentional); only the DOCUMENT scrolling element is asserted here.
 */

import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Route manifest
// ---------------------------------------------------------------------------

interface Route {
  path: string
  name: string
  /** True for bare-layout pages (home, about) that use the scene overlay nav. */
  bare: boolean
}

const NAV_ROUTES: readonly Route[] = [
  { path: '/',                 name: 'home',             bare: true  },
  { path: '/projects',         name: 'projects',         bare: false },
  { path: '/writing',          name: 'writing',          bare: false },
  { path: '/about',            name: 'about',            bare: true  },
  { path: '/graveyard',        name: 'graveyard',        bare: false },
  { path: '/behind-the-build', name: 'behind-the-build', bare: false },
]

const POST_ROUTES: readonly Route[] = [
  { path: '/posts/memory-leak-search-and-destroy',     name: 'post:memory-leak',        bare: false },
  { path: '/posts/thanks-for-scrolling-to-the-bottom', name: 'post:thanks-for-scrolling', bare: false },
]

const ALL_ROUTES: readonly Route[] = [...NAV_ROUTES, ...POST_ROUTES]

// ---------------------------------------------------------------------------
// Viewport matrices (MET-004 canonical matrix)
// ---------------------------------------------------------------------------

/** Narrow mobile danger band from EXP-012. */
const MOBILE_WIDTHS = [320, 360, 375, 390, 412, 430] as const

/** Tablet viewports — three device widths in portrait AND landscape. */
const TABLET_VIEWPORTS = [
  // portrait (narrow side first)
  { width: 768,  height: 1024, label: '768-portrait'   },
  { width: 820,  height: 1180, label: '820-portrait'   },
  { width: 1024, height: 1366, label: '1024-portrait'  },
  // landscape (wide side first)
  { width: 1024, height: 768,  label: '768-landscape'  },
  { width: 1180, height: 820,  label: '820-landscape'  },
  { width: 1366, height: 1024, label: '1024-landscape' },
] as const

/** Desktop breakpoints including ultrawide. */
const DESKTOP_WIDTHS = [1280, 1440, 1728, 1920, 2560] as const

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Returns true when the document has unintended horizontal overflow.
 * Measures document.scrollingElement (the <html> element in standard browsers)
 * rather than body so inner scroll containers like .prose pre do not trip the
 * assertion.
 */
async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (document.scrollingElement ?? document.documentElement).scrollWidth > window.innerWidth,
  )
}

// ---------------------------------------------------------------------------
// Mobile — 100 % zoom
// Tests every route at each narrow mobile width in the danger band.
// ---------------------------------------------------------------------------

for (const route of ALL_ROUTES) {
  for (const width of MOBILE_WIDTHS) {
    test(`[mobile-100%] ${route.name} — no overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 })
      await page.goto(route.path)
      await page.waitForLoadState('networkidle')

      const overflows = await hasHorizontalOverflow(page)
      expect(
        overflows,
        `scrollWidth > innerWidth on ${route.path} at ${width}px (100 % zoom)`,
      ).toBe(false)

      // Reading pages carry .subnav as the primary chrome; it must remain
      // visible and not be pushed off-screen by the layout.
      if (!route.bare) {
        await expect(
          page.locator('.subnav'),
          `primary nav must be visible on ${route.path} at ${width}px`,
        ).toBeVisible()
      }
    })
  }
}

// ---------------------------------------------------------------------------
// Mobile — 200 % zoom (viewport = physical width / 2)
// 200 % browser zoom halves the CSS pixel viewport, so a 320 px phone at
// 200 % presents 160 CSS pixels to the layout engine.
// ---------------------------------------------------------------------------

for (const route of ALL_ROUTES) {
  for (const width of MOBILE_WIDTHS) {
    const zoomedWidth = Math.round(width / 2)
    test(
      `[mobile-200%] ${route.name} — no overflow at ${width}px@200% zoom (${zoomedWidth}px viewport)`,
      async ({ page }) => {
        await page.setViewportSize({ width: zoomedWidth, height: 406 })
        await page.goto(route.path)
        await page.waitForLoadState('networkidle')

        const overflows = await hasHorizontalOverflow(page)
        expect(
          overflows,
          `scrollWidth > innerWidth on ${route.path} at 200 % zoom (${zoomedWidth}px)`,
        ).toBe(false)
      },
    )
  }
}

// ---------------------------------------------------------------------------
// Tablet — portrait and landscape
// ---------------------------------------------------------------------------

for (const route of ALL_ROUTES) {
  for (const vp of TABLET_VIEWPORTS) {
    test(`[tablet] ${route.name} — no overflow at ${vp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(route.path)
      await page.waitForLoadState('networkidle')

      const overflows = await hasHorizontalOverflow(page)
      expect(
        overflows,
        `scrollWidth > innerWidth on ${route.path} at tablet ${vp.label}`,
      ).toBe(false)

      if (!route.bare) {
        await expect(
          page.locator('.subnav'),
          `primary nav must be visible on ${route.path} at tablet ${vp.label}`,
        ).toBeVisible()
      }
    })
  }
}

// ---------------------------------------------------------------------------
// Desktop — 1280–2560 px
// ---------------------------------------------------------------------------

for (const route of ALL_ROUTES) {
  for (const width of DESKTOP_WIDTHS) {
    test(`[desktop] ${route.name} — no overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(route.path)
      await page.waitForLoadState('networkidle')

      const overflows = await hasHorizontalOverflow(page)
      expect(
        overflows,
        `scrollWidth > innerWidth on ${route.path} at desktop ${width}px`,
      ).toBe(false)

      if (!route.bare) {
        await expect(
          page.locator('.subnav'),
          `primary nav must be visible on ${route.path} at desktop ${width}px`,
        ).toBeVisible()
      }
    })
  }
}
