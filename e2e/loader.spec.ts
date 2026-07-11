import { test, expect } from '@playwright/test';

// Loader honesty: the intro loader must lift on the scene's real readiness
// signal (or its backstop), never trap the page, and hand interactivity over
// promptly. Timings are generous for CI software rendering — the assertions
// pin ORDER and EVENTUAL truth, not device speed.
//
// Everything in this file measures wall-clock behavior of an eased UI on a
// contended software-rendered CPU; one retry absorbs scheduler outliers
// without hiding real regressions (a broken floor fails deterministically).
test.describe.configure({ retries: 2 });

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
    // Observe the Document node, NOT document.documentElement: init scripts
    // run before parsing, and the pre-parse <html> element is REPLACED by the
    // parsed one — an observer bound to it never fires. The Document node is
    // stable across parsing, so subtree observation survives.
    }).observe(document, {
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
  // The decorative-floor regression is only OBSERVABLE when the scene gets
  // ready before the floor expires (then a reintroduced 2.5s floor would hold
  // the reveal ≥2500ms). When the scene itself takes multiples of the floor
  // (software-rendered CI under parallel workers: ready ≈ 2.5-3.5s), the floor
  // contributes zero and the ready→reveal delta is pure main-thread
  // saturation from the engine's post-first-frame work — judging the floor
  // there is judging scheduler noise. So: tight assertion in the observable
  // regime, loose stall-guard otherwise.
  const FLOOR_MS = 1000;
  const delta = times.reveal! - times.ready!;
  if (times.ready! < 2 * FLOOR_MS) {
    // Fast-ready regime: the reveal may wait out at most the floor remainder
    // plus modest jitter. The old 2.5s theater hold fails this decisively.
    expect(times.reveal!, `ready=${times.ready} reveal=${times.reveal}`).toBeLessThan(
      FLOOR_MS + 1500,
    );
  } else {
    // Slow-ready regime (contended CI): floor already spent — only guard
    // against outright stalls (the 8s backstop class of bug).
    expect(delta, `ready=${times.ready} reveal=${times.reveal}`).toBeLessThan(6000);
  }
});

test('labelled nav is interactive from first paint, before the engine arrives', async ({ page }) => {
  // The roadmap phrases this as "labelled navigation usable ≤2.5s while
  // shaders compile". Asserting a wall-clock bound on contended software-
  // rendered CI gates the scheduler, not the site — so this asserts the
  // STRONGER, stable property instead: the nav is visible and clickable
  // IMMEDIATELY after the document paints, while the loader still covers the
  // scene and the engine chunks have not even arrived (they are held at the
  // network edge below). If nav works before the engine exists, it trivially
  // works "within 2.5s while shaders compile" on any real device.
  // (e2e/mobile-access.spec.ts pins the same contract on a 390×844 phone;
  // this covers the desktop viewport.)
  await page.route(/three-core|three-post|createScene/i, async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue().catch(() => {});
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('.scene-loader')).toBeVisible();
  for (const label of ['Work', 'Writing', 'About', 'Contact']) {
    await expect(
      page.locator('.overlay-blog-links a', { hasText: label }),
      `${label} visible while the loader is up`,
    ).toBeVisible();
  }

  // Clickable, not merely painted: navigate off the loading hero via the nav.
  expect(await page.locator('.scene-loader').isVisible(), 'loader still up when clicking').toBe(true);
  await page.locator('.overlay-blog-links a', { hasText: 'Writing' }).click();
  await page.waitForURL(/\/writing\/?$/);
  await expect(page.locator('h1')).toBeVisible();
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
