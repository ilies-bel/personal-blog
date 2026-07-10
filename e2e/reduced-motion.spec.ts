import { test, expect } from '@playwright/test';

// The reduced-motion contract: an OS-level prefers-reduced-motion visitor
// gets the poster edition — and the heavy Three.js engine chunks are never
// even REQUESTED, let alone executed. Also guards the hydration seam: the
// server HTML and the first client render must agree (no React #418-class
// mismatch warnings).

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
