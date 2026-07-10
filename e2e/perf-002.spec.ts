/**
 * PERF-002 — Lightweight ambient treatment for inner routes.
 *
 * Reading and content routes must ship zero Three.js bytes.  These tests
 * assert that no JS chunk containing "three" in its URL is fetched when
 * visiting /writing, /posts/*, /projects, or /about.
 *
 * The check tracks every script resource request made during the initial page
 * load (including modulepreload links in <head>) and asserts that none of
 * their URLs contains the string "three" (case-insensitive).  This covers:
 *   • Direct three.js bundle requests (e.g. `three-<hash>.js`)
 *   • Engine chunks that include three.js as a dependency
 *     (e.g. `createScene-<hash>.js`, `warmThree-<hash>.js`, etc.)
 *
 * The homepage and behind-the-build are intentionally excluded from this
 * suite — those routes legitimately load the Three.js engine (PERF-007
 * governs their budget).
 *
 * Evidence artifact: evidence/performance/inner-route-network-comparison.har
 */

import { test, expect, type Page, type Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// Routes that must load zero Three.js bytes
// ---------------------------------------------------------------------------

const INNER_ROUTES = [
  { path: '/writing',                                      name: 'writing'    },
  { path: '/projects',                                     name: 'projects'   },
  { path: '/about',                                        name: 'about'      },
  { path: '/posts/memory-leak-search-and-destroy',         name: 'post (article)' },
  { path: '/posts/thanks-for-scrolling-to-the-bottom',    name: 'post (essay)'   },
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a lower-cased filename/pathname component of a URL string. */
function chunkName(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

/**
 * A URL matches the Three.js budget check when its pathname contains any of
 * the strings that would only appear in a chunk that includes Three.js or
 * the hero engine (createScene, warmThree, the three-core manual chunk, etc.).
 *
 * The check is conservative — it triggers on the literal word "three" in the
 * chunk filename so small renames of internal chunks cannot accidentally slip
 * through.  False negatives (an unexpected bundler rename) are caught by a
 * wider audit; this E2E test specifically guards the explicit chunk names
 * produced by the current Vite `manualChunks` config.
 */
function isThreeJsChunk(url: string): boolean {
  const name = chunkName(url)
  return (
    name.includes('three') ||
    // Also catch the hero engine chunks that embed three.js
    name.includes('createscene') ||
    name.includes('warmthree') ||
    name.includes('buildblackhole') ||
    name.includes('builddisk') ||
    name.includes('buildstarfield')
  )
}

/** Collect all JS resource URLs fetched during a full page load and wait-settle. */
async function collectScriptUrls(page: Page, path: string): Promise<string[]> {
  const fetched: string[] = []

  page.on('request', (req) => {
    const url = req.url()
    // Script fetches: JS files, modulepreload, dynamic imports
    if (
      req.resourceType() === 'script' ||
      (req.resourceType() === 'other' && url.endsWith('.js'))
    ) {
      fetched.push(url)
    }
  })

  await page.goto(path, { waitUntil: 'networkidle' })

  // Wait a beat for any deferred dynamic imports that fire after load.
  await page.waitForTimeout(1_500)

  return fetched
}

// ---------------------------------------------------------------------------
// PERF-002 assertions
// ---------------------------------------------------------------------------

for (const { path, name } of INNER_ROUTES) {
  test(`PERF-002 — ${name} (${path}) fetches zero Three.js bytes`, async ({ page }) => {
    const scripts = await collectScriptUrls(page, path)

    const threeChunks = scripts.filter(isThreeJsChunk)

    expect(
      threeChunks,
      [
        `Three.js chunk(s) were fetched on ${path}.`,
        `Fetched Three.js-related URLs:`,
        ...threeChunks.map((u) => `  • ${u}`),
        ``,
        `All script fetches on this route:`,
        ...scripts.map((u) => `  • ${u}`),
      ].join('\n')
    ).toHaveLength(0)
  })
}
