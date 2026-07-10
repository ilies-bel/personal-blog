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

test('unknown path — HTTP 404', async ({ page }) => {
  // Use a path that can never collide with a real route.
  const response = await page.goto('/no-such-route-xyzzy-e2e-probe')
  expect(
    response?.status(),
    'Expected HTTP 404 for an unknown path'
  ).toBe(404)
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
