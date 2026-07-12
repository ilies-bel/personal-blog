import { test, expect } from './test-base';

// PRD-002 Speck-to-event-horizon handoff.
//
// The loader speck (.scene-loader-dot) resolves into a centred lensing/photon-ring
// cue as it hands off to the real black-hole frame. The bridge is a pure CSS
// transition that rides the EXISTING body.scene-ready flip (the PRD-001 release
// authorization) — it introduces no new class, timer, reveal condition, or fixed
// wait, and must not advance loader-gone early. Under reduced motion it collapses
// to a calm fade with no spatial travel.
//
// These tests are deterministic: they HOLD the engine at the network edge so no
// real scene:ready competes, then dispatch scene:ready themselves to open the
// bridge on demand, and read COMPUTED styles of the speck to assert the optical
// state. Chromium runs the real first-frame path (webkit is shimmed to no-WebGL
// in test-base, which takes the 8s backstop and never exercises the bridge).
test.describe('speck→event-horizon bridge (PRD-002)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'bridge needs the chromium first-frame path');

  async function gotoWithHeldEngine(page: import('./test-base').Page): Promise<void> {
    await page.route(/three-core|three-post|createScene|BlackHole/i, () => new Promise(() => {}));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.scene-loader')).toBeVisible();
  }

  function dotTransform(page: import('./test-base').Page): Promise<string> {
    return page.locator('.scene-loader-dot').evaluate((el) => getComputedStyle(el).transform);
  }

  test('bridge does NOT begin before the loader is authorised to release', async ({ page }) => {
    await gotoWithHeldEngine(page);
    // No scene:ready yet → the loader is still pending; the speck must still be in
    // its breathing (animated) waiting state, NOT the contracted lensing state.
    const animationName = await page
      .locator('.scene-loader-dot')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName, 'speck breathes while pending').toBe('scene-loader-pulse');
    await expect(page.locator('body')).not.toHaveClass(/scene-ready/);
  });

  test('on normal release the speck contracts into the lensing cue', async ({ page }) => {
    await gotoWithHeldEngine(page);
    const before = await dotTransform(page);
    // Authorise the release exactly as the loader's own reveal path does.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('scene:ready')));
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 3_000 });
    // The bridge engages: the pulse is released and the speck contracts (a scaled
    // transform matrix distinct from its pre-release breathing transform).
    await expect
      .poll(async () => page.locator('.scene-loader-dot').evaluate((el) => getComputedStyle(el).animationName))
      .toBe('none');
    const after = await dotTransform(page);
    // A contract is a scale <1: the matrix's a-component (x-scale) is below 1.
    const scaleX = (m: string) => {
      const parts = m.match(/matrix\(([^)]+)\)/);
      return parts ? parseFloat(parts[1].split(',')[0]) : NaN;
    };
    expect(scaleX(after), `contracted transform ${after} (was ${before})`).toBeLessThan(0.9);
  });

  test('bridge does not advance loader-gone early (final-cover contract intact)', async ({ page }) => {
    await gotoWithHeldEngine(page);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('scene:ready')));
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 3_000 });
    // The moment the bridge starts (scene-ready), loader-gone must NOT already be
    // set — it is gated on the dark cover's later fade, not on the speck bridge.
    await expect(page.locator('body')).not.toHaveClass(/loader-gone/, { timeout: 300 });
    // It still completes eventually (the existing final-cover contract / backstop).
    await expect(page.locator('body')).toHaveClass(/loader-gone/, { timeout: 5_000 });
  });
});

// Reduced motion: the bridge must have NO spatial travel — the speck simply fades.
test.describe('speck bridge under reduced motion (PRD-002)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'bridge needs the chromium first-frame path');
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('reduced motion collapses the bridge to a calm fade (no contract)', async ({ page }) => {
    await page.route(/three-core|three-post|createScene|BlackHole/i, () => new Promise(() => {}));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    await expect(page.locator('.scene-loader')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('scene:ready')));
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 3_000 });
    // No lensing contract: the speck's transform stays identity (no scale travel),
    // and its transition is suppressed. It fades with the mark instead.
    const transform = await page
      .locator('.scene-loader-dot')
      .evaluate((el) => getComputedStyle(el).transform);
    expect(transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
  });
});
