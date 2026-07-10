import { test, expect } from '@playwright/test';

// Visual regression for DETERMINISTIC states only — the static edition and
// the 404 page render identically run-to-run (no WebGL, no animation), so
// they can be pixel-pinned. Live WebGL frames are deliberately excluded
// (non-deterministic across GPUs/drivers).
//
// Baselines are committed from Linux (the CI OS). Regenerate after intended
// visual changes with:  npx playwright test visual --update-snapshots
//
// Chromium-family projects only: one rendering engine is enough to catch
// regressions, and it keeps the baseline set maintainable.

test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'chromium', 'visual baselines are chromium-only');
});

test.describe('static edition (no JS)', () => {
  test.use({ javaScriptEnabled: false });

  test('no-js home', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(300); // fonts settle
    await expect(page).toHaveScreenshot('nojs-home.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
    });
  });
});

test('404 page', async ({ page }) => {
  await page.goto('/this-page-does-not-exist', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot('404.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.03,
  });
});
