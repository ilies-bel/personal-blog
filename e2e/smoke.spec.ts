/**
 * Smoke suite — QA-001 E2E foundation
 *
 * Visits every public route of the production-built site and asserts:
 *   • HTTP 200 (correct status code)
 *   • Zero browser console errors
 *   • Zero network-level request failures
 *
 * A separate test asserts that an unknown path returns HTTP 404.
 *
 * The `webServer` in playwright.config.ts builds the static bundle with
 * `astro build` before serving it via `astro preview`, so these tests always
 * exercise the real SSG output — not the dev server.
 */

import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Route manifest
//
// Paths are absolute (relative to the server origin) so they are readable and
// match exactly what https://ilies-bel.dev/ serves.  When BASE_PATH is set,
// playwright.config.ts adjusts the server root; these paths are still correct
// because the Astro build and the astro preview server are both configured with
// the same base path.
// ---------------------------------------------------------------------------

/** Top-level navigation routes. */
const NAV_ROUTES = [
  { path: '/',                 name: 'home' },
  { path: '/projects',         name: 'projects' },
  { path: '/writing',          name: 'writing' },
  { path: '/about',            name: 'about' },
  { path: '/graveyard',        name: 'graveyard' },
  { path: '/behind-the-build', name: 'behind-the-build' },
] as const

/** Published post slugs derived from src/content/posts/. */
const POST_ROUTES = [
  { path: '/posts/memory-leak-search-and-destroy',      name: 'post: memory-leak' },
  { path: '/posts/thanks-for-scrolling-to-the-bottom',  name: 'post: thanks-for-scrolling' },
] as const

const ALL_ROUTES = [...NAV_ROUTES, ...POST_ROUTES]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PageMonitor {
  consoleErrors: string[]
  failedRequests: string[]
}

/**
 * Attach console-error and request-failure listeners to `page` before
 * navigation so events fired during the initial load are captured.
 *
 * Returns the mutable arrays so the caller can assert against them after
 * navigation completes.
 */
function attachMonitor(page: Page): PageMonitor {
  const consoleErrors: string[] = []
  const failedRequests: string[] = []

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })

  page.on('requestfailed', req => {
    failedRequests.push(
      `${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'unknown error'}`
    )
  })

  return { consoleErrors, failedRequests }
}

// ---------------------------------------------------------------------------
// Smoke tests — one per public route
// ---------------------------------------------------------------------------

for (const { path, name } of ALL_ROUTES) {
  test(`${name} — HTTP 200, no console errors, no network failures`, async ({ page }) => {
    const { consoleErrors, failedRequests } = attachMonitor(page)

    const response = await page.goto(path)

    expect(
      response?.status(),
      `Expected HTTP 200 navigating to ${path}`
    ).toBe(200)

    expect(
      consoleErrors,
      `Browser console errors detected on ${path}`
    ).toHaveLength(0)

    expect(
      failedRequests,
      `Network request failures detected on ${path}`
    ).toHaveLength(0)
  })
}

// ---------------------------------------------------------------------------
// 404 guard — unknown paths must return HTTP 404, not a silent 200
// ---------------------------------------------------------------------------

test('unknown path — HTTP 404 with branded page and recovery links', async ({ page }) => {
  // Use a path that can never collide with a real route.
  const response = await page.goto('/no-such-route-xyzzy-e2e-probe')

  // Correct status code — the host must never serve a 200 for unknown paths.
  expect(
    response?.status(),
    'Expected HTTP 404 for an unknown path'
  ).toBe(404)

  // Branded chrome — the standard reading-page subnav header must be present
  // (this is the .subnav header rendered by BaseLayout in non-bare mode).
  await expect(
    page.locator('.subnav'),
    'Expected branded subnav header on the 404 page'
  ).toBeVisible()

  // Recovery links — the 404 page must offer a path back to each main section.
  // Covers: Home (/), Work / Projects (/projects), Writing (/writing),
  //         About (/about), and Contact (mailto:).
  const recoverySections = [
    { label: 'Home',     href: '/'         },
    { label: 'Work',     href: '/projects' },
    { label: 'Writing',  href: '/writing'  },
    { label: 'About',    href: '/about'    },
  ] as const

  for (const { label, href } of recoverySections) {
    await expect(
      page.locator(`#not-found-recovery a[href="${href}"]`),
      `Expected a recovery link to ${label} (${href}) on the 404 page`
    ).toBeVisible()
  }

  // Contact link — email link in the recovery section.
  await expect(
    page.locator('#not-found-recovery a[href^="mailto:"]'),
    'Expected a Contact mailto link on the 404 page'
  ).toBeVisible()

  // noindex — crawlers must be told to skip the 404 page.
  const robots = await page.locator('meta[name="robots"]').getAttribute('content')
  expect(robots, 'Expected noindex on the 404 page').toContain('noindex')

  // Authored heading — the 404 must carry the stellar-world copy (EXP-011).
  await expect(
    page.locator('#not-found-title'),
    'Expected authored heading "Signal lost." on the 404 page'
  ).toHaveText('Signal lost.')

  // Lost-signal illustration — decorative SVG beacon must be present in the DOM.
  await expect(
    page.locator('.not-found-signal'),
    'Expected lost-signal illustration (.not-found-signal) on the 404 page'
  ).toBeAttached()
})

// ---------------------------------------------------------------------------
// ENG-003: dev-only route guard
//
// /dev-blueprint is a dev measuring bench that must never appear in the
// production build output.  The page lives in src/_dev-pages/ (outside
// src/pages/) and is injected as a route only during `astro dev`.
// This test exercises the production preview server (built by `astro build`)
// and asserts the route is structurally absent — not just hidden behind a
// host-level redirect.
// ---------------------------------------------------------------------------

test('dev-blueprint — absent from production build (HTTP 404)', async ({ page }) => {
  const response = await page.goto('/dev-blueprint')
  expect(
    response?.status(),
    '/dev-blueprint must not exist in the production build'
  ).toBe(404)
})

// ---------------------------------------------------------------------------
// ENG-002: Icon and resource URL resolution on nested routes
//
// When the site is served from a subpath (e.g. /personal-blog/) or from the
// domain root (/), icon hrefs must never be protocol-relative (//favicon.svg).
// A protocol-relative URL on a file: origin or a custom-domain deploy resolves
// to the wrong host and produces a 404.
//
// We exercise a nested post route (/posts/<slug>) because relative URLs that
// would work from / break when the depth increases — the browser would resolve
// favicon.svg against /posts/ instead of the site root.
// ---------------------------------------------------------------------------

test('nested post route — icon hrefs are root-relative, not protocol-relative (ENG-002)', async ({ page }) => {
  const { failedRequests } = attachMonitor(page)

  await page.goto('/posts/memory-leak-search-and-destroy')

  // Read raw href attributes (not browser-resolved .href property) so we catch
  // protocol-relative strings like "//favicon.svg" before the browser "fixes" them.
  const iconHrefs = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')
    ).map(el => el.getAttribute('href') ?? '')
  )

  expect(iconHrefs.length, 'Expected at least one icon <link> element').toBeGreaterThan(0)

  for (const href of iconHrefs) {
    expect(
      href,
      `Icon href "${href}" is protocol-relative — must start with / not //`
    ).not.toMatch(/^\/\//)
  }

  expect(
    failedRequests,
    `Network request failures detected on nested post route`
  ).toHaveLength(0)
})

// ---------------------------------------------------------------------------
// PERF-001 — WebGL context cap (≤ 2 live renderers site-wide)
//
// Navigates home ↔ behind-the-build five times via SPA (ClientRouter) and
// asserts that the site-wide registry count never exceeds CONTEXT_CAP = 2.
// The count is published on window.__webgl_context_count__ by contextRegistry
// so we can read it from Playwright without any DOM proxy.
//
// If WebGL is unavailable in the headless browser the count stays 0, which
// satisfies the ≤ 2 invariant automatically.
// ---------------------------------------------------------------------------

test('PERF-001 — WebGL context count never exceeds 2 across home↔behind-the-build navigation', async ({ page }) => {
  const getCount = (): Promise<number> =>
    page.evaluate(() => (window as unknown as { __webgl_context_count__?: number }).__webgl_context_count__ ?? 0)

  const assertCap = async (label: string): Promise<void> => {
    const count = await getCount()
    expect(
      count,
      `Context count exceeded cap at "${label}" (got ${count}, cap = 2)`
    ).toBeLessThanOrEqual(2)
  }

  // Start on the home page.
  await page.goto('/')
  await assertCap('home (initial load)')

  // Navigate home ↔ behind-the-build 5 times via in-page links (SPA navigation)
  // so ClientRouter's mount/unmount lifecycle is exercised on every trip.
  for (let i = 1; i <= 5; i++) {
    // Navigate to behind-the-build via the SPA router.
    await page.evaluate(() => {
      const link: HTMLAnchorElement | null = document.querySelector('a[href="/behind-the-build"]')
      link?.click()
    })
    await page.waitForURL('**/behind-the-build', { timeout: 10_000 })
    // Allow scenes to initialise (they are deferred via setTimeout 0 + dynamic import).
    await page.waitForTimeout(2_000)
    await assertCap(`behind-the-build (trip ${i})`)

    // Navigate back home.
    await page.evaluate(() => {
      const link: HTMLAnchorElement | null = document.querySelector('a[href="/"]')
      link?.click()
    })
    await page.waitForURL('**/', { timeout: 10_000 })
    await page.waitForTimeout(1_000)
    await assertCap(`home (return ${i})`)
  }
})

// ---------------------------------------------------------------------------
// EXP-009 — Canonical IA: Work, Writing, About, Contact on every route
//
// Every primary destination must be reachable in one interaction from every
// page, in every edition (JS, no-JS, reduced-motion, mobile). The nav is
// server-rendered by SiteNav.astro, so these labels are present in the HTML
// regardless of JS or motion preference.
//
// We assert DOM presence and a valid href (operability), not CSS visibility —
// the home page boot-gate dims labels visually but they remain in the markup
// and are always keyboard-accessible.
// ---------------------------------------------------------------------------

/** The four canonical primary destinations defined by EXP-009. */
const PRIMARY_IA = ['Work', 'Writing', 'About', 'Contact'] as const

for (const { path, name } of ALL_ROUTES) {
  test(`${name} — primary nav has Work, Writing, About, Contact`, async ({ page }) => {
    await page.goto(path)

    // The nav is present on every page (both scene and page surfaces use
    // aria-label="Sections" — same accessible name, different CSS skins).
    const nav = page.locator('nav[aria-label="Sections"]')
    await expect(nav, `Expected nav[aria-label="Sections"] on ${path}`).toBeAttached()

    for (const label of PRIMARY_IA) {
      // Locate by accessible role + name: the lock-tick spans are aria-hidden,
      // so the link's accessible name is exactly the visible label text.
      const link = nav.getByRole('link', { name: label, exact: true })
      await expect(
        link,
        `Expected "${label}" link in nav on ${path}`
      ).toBeAttached()

      // The link must have a non-empty href — proving it is a real destination.
      const dest = await link.getAttribute('href')
      expect(dest, `"${label}" link must have an href on ${path}`).toBeTruthy()
    }
  })
}
