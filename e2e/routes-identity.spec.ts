import { test, expect } from './test-base';

// P9 ROUTE IDENTITY — every route carries its authored world:
//   • body[data-route] (BaseLayout) — the scoping attribute the per-route
//     tokens/treatments hang off. If this ever goes missing the whole route
//     art direction silently degrades to the base look.
//   • a route-specific STRUCTURAL marker — the static bone of that route's
//     physical law (backdrop variant / specimen records / anatomy gallery),
//     asserted on server HTML so no hydration is needed.
//   • the contextual ROUTE ENDING (RouteEnding.astro) on every section page;
//     posts keep their richer .article-next continuation instead.

interface RouteIdentity {
  route: string;
  id: string;
  /** CSS selector for the route's own structural marker (server-rendered). */
  marker: string;
  /** 'ending' → .route-ending; 'article-next' → posts' continuation; null → none. */
  ending: 'ending' | 'article-next' | null;
}

const IDENTITIES: RouteIdentity[] = [
  // Home: the live hero owns the page; the finale ledger is its decision
  // surface, so no RouteEnding. The scroll track is the structural marker.
  { route: '/', id: 'home', marker: '.scene-track, .scene-stage', ending: null },
  // Work — sustained orbit: the star capture backdrop.
  { route: '/projects', id: 'work', marker: '.ambient-backdrop[data-variant="star"]', ending: 'ending' },
  // Writing — coalescing nebula.
  { route: '/writing', id: 'writing', marker: '.ambient-backdrop[data-variant="nebula"]', ending: 'ending' },
  // Graveyard — cooling residue: the mono specimen records (the drawer labels).
  { route: '/graveyard', id: 'graveyard', marker: '.graveyard-entry-specimen', ending: 'ending' },
  // Behind the Build — exposed anatomy: the shader gallery.
  { route: '/behind-the-build', id: 'behind-the-build', marker: '.btb-shader-gallery', ending: 'ending' },
  // About — human scale: the nebula re-graded warm behind the overlay panel.
  { route: '/about', id: 'about', marker: '.ambient-backdrop[data-variant="nebula"]', ending: 'ending' },
  // Contact — transmission: the dedicated pale-blue-dot signal variant.
  { route: '/contact', id: 'contact', marker: '.ambient-backdrop[data-variant="transmission"]', ending: 'ending' },
  // Posts: calm reading surface, article-next continuation.
  {
    route: '/posts/memory-leak-search-and-destroy',
    id: 'post',
    marker: 'article.prose .article-header',
    ending: 'article-next',
  },
];

for (const { route, id, marker, ending } of IDENTITIES) {
  test(`route identity ${route}: data-route="${id}" + structural marker`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'load' });
    await expect(page.locator('body')).toHaveAttribute('data-route', id);
    expect(
      await page.locator(marker).count(),
      `expected the route marker "${marker}" on ${route}`,
    ).toBeGreaterThan(0);

    if (ending === 'ending') {
      // Exactly one closing block, and it links onward (a real href).
      await expect(page.locator('.route-ending')).toHaveCount(1);
      const href = await page.locator('.route-ending-link').getAttribute('href');
      expect(href, `route ending on ${route} must link onward`).toBeTruthy();
    } else if (ending === 'article-next') {
      await expect(page.locator('.article-next')).toHaveCount(1);
    } else {
      await expect(page.locator('.route-ending')).toHaveCount(0);
    }
  });
}

test('route identity 404: unknown paths carry data-route="404"', async ({ page }) => {
  await page.goto('/definitely-not-a-page', { waitUntil: 'load' });
  await expect(page.locator('body')).toHaveAttribute('data-route', '404');
});
