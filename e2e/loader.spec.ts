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

test('first-visit floor is honest: reveal lands promptly after scene:ready', async ({ page }) => {
  // P7 loader honesty: the first-visit floor is ≤1s (LOADER_MIN_MS), so once
  // the scene reports its real first frame the reveal may lag by at most the
  // floor's remainder — never the old 2.5s theater hold. Instrument both
  // moments from inside the page: the scene:ready event and the instant the
  // scene-ready class lands on <body>.
  await page.addInitScript(() => {
    const t: { ready?: number; reveal?: number } = {};
    (window as unknown as { __loaderTimes: typeof t }).__loaderTimes = t;
    window.addEventListener(
      'scene:ready',
      () => {
        t.ready = performance.now();
      },
      { once: true },
    );
    new MutationObserver(() => {
      if (!t.reveal && document.body?.classList.contains('scene-ready')) {
        t.reveal = performance.now();
      }
    }).observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ['class'],
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 15_000 });

  const times = await page.evaluate(
    () => (window as unknown as { __loaderTimes: { ready?: number; reveal?: number } }).__loaderTimes,
  );
  // If scene:ready never fired the reveal came from the no-WebGL paths (the 8s
  // backstop / revealWithoutWebgl) — there is no floor to judge there.
  test.skip(times.ready === undefined, 'scene:ready never fired (no usable WebGL) — floor not exercised');
  expect(times.reveal, 'reveal instant recorded').toBeDefined();
  // Generous CI ceiling — the point is "no multi-second decorative hold": the
  // ≤1s floor plus scheduling jitter must land well under 2s.
  expect(times.reveal! - times.ready!).toBeLessThan(2000);
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
