import { test, expect } from '@playwright/test';

// Loader honesty: the intro loader must lift on the scene's real readiness
// signal (or its backstop), never trap the page, and hand interactivity over
// promptly. Timings are generous for CI software rendering — the assertions
// pin ORDER and EVENTUAL truth, not device speed.

test('loader reveals on scene readiness and fully hands off', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // The loader paints immediately (server-rendered, pre-hydration).
  await expect(page.locator('.scene-loader')).toBeVisible();

  // scene-ready lands when the engine paints its first frame; the 8s backstop
  // guarantees it even with no usable WebGL. 15s covers slow CI + margin.
  await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 15_000 });

  // The dissolve completes and interactivity is released.
  await expect(page.locator('body')).toHaveClass(/loader-gone/, { timeout: 8_000 });

  // After the loader is gone its cover must not catch pointer events.
  const pointerEvents = await page
    .locator('.scene-loader')
    .evaluate((el) => getComputedStyle(el).pointerEvents);
  expect(pointerEvents).toBe('none');
});

test('warm return (same session) reveals without the first-visit floor', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 15_000 });

  // Navigate away and back within the session: the reveal must be fast.
  await page.goto('/writing', { waitUntil: 'load' });
  const t0 = Date.now();
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 10_000 });
  // Generous ceiling: the point is "no re-imposed decorative floor", measured
  // from navigation start.
  expect(Date.now() - t0).toBeLessThan(8_000);
});
