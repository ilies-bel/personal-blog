import { test, expect } from './test-base';
import { posterFallbackActive } from './hero-mode';

// The reduced-motion contract: an OS-level prefers-reduced-motion visitor
// gets the poster edition — and the heavy Three.js engine chunks are never
// even REQUESTED, let alone executed. Also guards the hydration seam: the
// server HTML and the first client render must agree (no React #418-class
// mismatch warnings).

test.describe('OS reduced motion from first paint', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('reduced motion never downloads the engine and mounts the poster hero', async ({ page }) => {
    const engineRequests: string[] = [];
    const hydrationWarnings: string[] = [];
    page.on('request', (req) => {
      if (/three-core|three-post|createScene/i.test(req.url())) engineRequests.push(req.url());
    });
    page.on('console', (msg) => {
      const text = msg.text();
      if (/hydrat|#418|#423|#425/i.test(text)) hydrationWarnings.push(text);
    });

    await page.goto('/', { waitUntil: 'load' });

    // The pre-paint script resolves the preference before first paint.
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');

    // Poster slideshow is the hero; give hydration a beat to mount it.
    await expect(page.locator('.bh-poster-slideshow')).toBeAttached({ timeout: 10_000 });

    // Settle, then assert the engine graph never crossed the network.
    await page.waitForTimeout(2000);
    expect(engineRequests, 'Three.js chunks requested under reduced motion').toEqual([]);
    expect(hydrationWarnings, 'hydration mismatch warnings').toEqual([]);
  });

  test('reduced motion still reveals the page (no loader trap)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    // The reduced-motion path must lift the loader promptly — it never waits on
    // a WebGL first frame.
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 10_000 });
  });
});

// Mid-session OS preference flips: the motion module (src/lib/motion.ts) owns
// one matchMedia listener, re-stamps html[data-motion], and HeroIsland reacts
// live — tearing the engine down for the poster slideshow (and back) with NO
// page reload.
test.describe('mid-session preference flip', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('flipping to reduced swaps the live hero for the poster (and back) without reload', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // This test swaps a LIVE hero to the poster and back. Where the hero already
    // IS a poster because the WebGL probe found a software rasteriser (headless
    // CI, no GPU), there is no live hero to swap and .bh-poster-slideshow is
    // present from the start — the transition under test cannot be exercised.
    test.skip(
      await posterFallbackActive(page),
      'the live↔poster motion swap needs a live hero to begin with (software-GL already serves the poster)',
    );

    // Full-motion session: attribute stamped 'full', no poster hero mounted.
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
    await expect(page.locator('.bh-poster-slideshow')).toHaveCount(0);
    // Wait for the page to reveal so the flip happens on a settled session.
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 15_000 });

    // Mark the window so we can prove no reload happened across the flips.
    await page.evaluate(() => {
      (window as unknown as { __noReloadMarker?: boolean }).__noReloadMarker = true;
    });

    // OS flips to reduced mid-session: the attribute follows and the hero
    // swaps to the poster slideshow (engine torn down) within a few seconds.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced', { timeout: 5_000 });
    await expect(page.locator('.bh-poster-slideshow')).toBeAttached({ timeout: 5_000 });

    // And the reverse: back to full motion, the poster stands down again.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'full', { timeout: 5_000 });
    await expect(page.locator('.bh-poster-slideshow')).toHaveCount(0, { timeout: 5_000 });

    // Same JS realm throughout — the swaps happened live, not via reload.
    const marker = await page.evaluate(
      () => (window as unknown as { __noReloadMarker?: boolean }).__noReloadMarker,
    );
    expect(marker, 'page reloaded during the motion flip').toBe(true);
  });
});
