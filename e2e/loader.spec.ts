import { test, expect } from './test-base';

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
    const t: { ready?: number; reveal?: number; longTasks: Array<{ start: number; duration: number }> } = {
      longTasks: [],
    };
    (window as unknown as { __loaderTimes: typeof t }).__loaderTimes = t;
    window.addEventListener(
      'scene:ready',
      () => {
        t.ready = performance.now();
      },
      { once: true },
    );
    // Long-task ledger — used at the assertion to tell a reintroduced theater
    // hold apart from GL-stack compile saturation (the sync-compile note
    // below). Observer unsupported → empty ledger → tight assertion stands.
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) t.longTasks.push({ start: e.startTime, duration: e.duration });
      }).observe({ entryTypes: ['longtask'] });
    } catch (_e) {
      /* longtask entry type unsupported in this browser */
    }
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
    () =>
      (
        window as unknown as {
          __loaderTimes: { ready?: number; reveal?: number; longTasks: Array<{ start: number; duration: number }> };
        }
      ).__loaderTimes,
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
  // Sync-compile signature: on GL stacks WITHOUT KHR_parallel_shader_compile
  // (headless SwiftShader on a fast CPU is the canonical case) the engine's
  // post-first-frame compileAsync degrades to ONE synchronous multi-second
  // block that begins at the scene:ready instant and starves every timer —
  // including the loader's floor timer. That is the same saturation class the
  // slow regime already excludes; it merely leaks into the fast regime when
  // the CPU races through boot. Detect it directly from the long-task ledger
  // instead of guessing from the ready time. On real GPUs (parallel compile
  // present) no such task exists and the tight assertion stands — verified
  // headed on real hardware: ready≈512ms, reveal≈1040ms, zero long tasks.
  const syncCompileBlock = times.longTasks.find(
    (lt) => lt.duration >= 800 && lt.start >= times.ready! - 50 && lt.start <= times.ready! + 250,
  );
  if (times.ready! < 2 * FLOOR_MS && !syncCompileBlock) {
    // Fast-ready regime: the reveal may wait out at most the floor remainder
    // plus modest jitter. The old 2.5s theater hold fails this decisively.
    expect(times.reveal!, `ready=${times.ready} reveal=${times.reveal}`).toBeLessThan(
      FLOOR_MS + 1500,
    );
  } else {
    // Slow-ready regime (contended CI) or sync-compile block: the floor is
    // already spent / unhonorable — only guard against outright stalls (the
    // 8s backstop class of bug).
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

test('SPA nav home (clicking the wordmark) keeps html.js — the live hero, not the static edition', async ({
  page,
}) => {
  // Regression: a ClientRouter swap replaces <html>'s attributes with the
  // incoming static document's, which has no `js` class (only client JS adds it).
  // Without re-stamping `html.js` after the swap, navigating back to '/' — e.g.
  // clicking the brand wordmark — dropped the class, so `html:not(.js)` fired and
  // the no-JS static edition overlapped the hero. motion.ts now re-stamps `js`
  // (and data-motion) on astro:after-swap; this pins that.
  await page.goto('/projects', { waitUntil: 'load' });
  await expect(page.locator('a.subnav-brand')).toBeVisible();
  await page.locator('a.subnav-brand').first().click();
  await page.waitForURL(/\/$/, { timeout: 8_000 });

  // The js class survives the swap → the static edition stays hidden and the
  // live hero shell is present (not display:none behind the no-JS gate).
  await expect(page.locator('html')).toHaveClass(/(^|\s)js(\s|$)/);
  await expect(page.locator('.static-edition')).toBeHidden();
  // .bh-root is a fixed full-viewport shell; assert it is NOT display:none (the
  // html:not(.js) gate would set it) rather than Playwright "visibility".
  const bhRootDisplay = await page
    .locator('.bh-root')
    .evaluate((el) => getComputedStyle(el).display);
  expect(bhRootDisplay, 'hero shell is not gated off').not.toBe('none');
  // And the scene actually comes up (not trapped behind a no-JS gate).
  await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 15_000 });
});

// ── PRD-001 Intent-aware loader release ──────────────────────────────────────
//
// These tests exercise the first-session floor waiver DETERMINISTICALLY, with
// zero GPU/timing races: they HOLD the real engine chunks at the network edge
// (so a real scene:ready never competes) and dispatch the scene:ready event
// themselves at the exact moment the scenario calls for. That lets each row of
// the PRD's event-order truth table be reproduced by construction rather than
// by out-racing a software renderer.
//
// The loader's first-session floor is LOADER_MIN_MS (900ms). The waiver rule:
// a native downward scroll of ≥ NATIVE_SCROLL_INTENT_PX (12px) from the init
// baseline waives ONLY the floor remainder — but never reveals before a real
// scene:ready.
test.describe('intent-aware loader release (PRD-001)', () => {
  const INTENT_PX = 12;

  // These tests dispatch scene:ready themselves and control scroll — they need a
  // browser that does NOT force the no-WebGL path (webkit shadows getContext →
  // null in test-base, so the loader would take the 8s backstop and there is no
  // floor/intent interplay to observe). Chromium runs the real first-frame path.
  test.skip(({ browserName }) => browserName !== 'chromium', 'intent path needs chromium first-frame timing');

  // Hold the engine so the ONLY scene:ready is the one the test dispatches, and
  // give the page real scrollable height immediately (the scroll track is
  // server-rendered, but we also force overflow so scrollY can move before the
  // island mounts). Returns after domcontentloaded with the loader visible.
  async function gotoWithHeldEngine(page: import('./test-base').Page): Promise<void> {
    await page.route(/three-core|three-post|createScene|BlackHole/i, async (route) => {
      // Never resolve: the engine never boots, so no real scene:ready fires.
      await new Promise(() => {});
      void route;
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.scene-loader')).toBeVisible();
    // Ensure the document can actually scroll so a programmatic scroll produces
    // a real scrollY OUTCOME (the loader observes scrollY, not wheel events).
    await page.evaluate(() => {
      document.body.style.minHeight = '5000px';
    });
  }

  function dispatchSceneReady(page: import('./test-base').Page): Promise<void> {
    return page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('scene:ready'));
    });
  }

  // Drive a REAL native scroll via the wheel — the loader qualifies intent from
  // the window.scrollY OUTCOME, and a genuine wheel gesture is both the truest
  // reproduction of visitor intent AND immune to the astro:page-load scroll
  // restoration that reverts a programmatic window.scrollTo() back to 0 under a
  // fresh load. Waits until scrollY actually reflects the movement.
  async function wheelDownBy(page: import('./test-base').Page, px: number): Promise<void> {
    await page.mouse.move(400, 300);
    await page.mouse.wheel(0, px);
    await page.waitForFunction((target) => window.scrollY >= target, Math.min(px, 8), {
      timeout: 1_000,
    });
  }

  test('first frame, no intent: reveal waits out the floor', async ({ page }) => {
    await gotoWithHeldEngine(page);
    const t0 = Date.now();
    // Scene ready immediately, but no scroll intent → the floor still governs.
    await dispatchSceneReady(page);
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 3_000 });
    // The reveal must lag the (immediate) scene:ready by roughly the floor. We
    // assert it did NOT reveal instantly (floor honoured) but did within a
    // generous ceiling (floor is ≤1s).
    const elapsed = Date.now() - t0;
    expect(elapsed, `reveal elapsed=${elapsed}ms`).toBeGreaterThanOrEqual(600);
    expect(elapsed, `reveal elapsed=${elapsed}ms`).toBeLessThan(2_500);
  });

  test('intent then first frame: reveal at the frame, not before', async ({ page }) => {
    await gotoWithHeldEngine(page);
    // Qualify intent while the scene is NOT yet painted.
    await wheelDownBy(page, INTENT_PX + 20);
    // Intent alone must NOT reveal — scenePainted still gates the release.
    await expect(page.locator('body')).not.toHaveClass(/scene-ready/, { timeout: 500 });
    // Now paint: reveal should be immediate (floor already waived by intent).
    const t0 = Date.now();
    await dispatchSceneReady(page);
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 1_500 });
    expect(Date.now() - t0, 'reveal is prompt once painted').toBeLessThan(800);
  });

  test('first frame then intent before floor: reveal immediately on intent', async ({ page }) => {
    await gotoWithHeldEngine(page);
    // Paint first; the floor holds the reveal.
    await dispatchSceneReady(page);
    await expect(page.locator('body')).not.toHaveClass(/scene-ready/, { timeout: 300 });
    // Now express intent BEFORE the floor would have elapsed → immediate reveal.
    const t0 = Date.now();
    await wheelDownBy(page, INTENT_PX + 20);
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 1_000 });
    expect(Date.now() - t0, 'intent releases the held floor at once').toBeLessThan(900);
  });

  test('below-threshold movement does not waive the floor', async ({ page }) => {
    await gotoWithHeldEngine(page);
    await dispatchSceneReady(page);
    // A sub-threshold nudge is NOT intent — the floor must still hold the reveal.
    // Wheel a few pixels (under NATIVE_SCROLL_INTENT_PX) and confirm scrollY moved
    // but stayed below the threshold.
    await page.mouse.move(400, 300);
    await page.mouse.wheel(0, INTENT_PX - 6);
    await page.waitForFunction(() => window.scrollY > 0, undefined, { timeout: 1_000 });
    const y = await page.evaluate(() => window.scrollY);
    expect(y, 'sub-threshold scroll stayed under the intent threshold').toBeLessThan(INTENT_PX);
    // The floor must still hold the reveal right after a below-threshold scroll.
    await expect(page.locator('body')).not.toHaveClass(/scene-ready/, { timeout: 400 });
    // It still reveals once the floor elapses (never traps the page).
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 2_500 });
  });

  test('scroll established before first frame is honoured as intent', async ({ page }) => {
    // Covers the "restored scrollY already past threshold, then first frame" row:
    // a below-page position that exists BEFORE scene:ready qualifies as intent, so
    // the floor is waived and the reveal lands on the frame — it does not replay a
    // held intro over the pre-scrolled state. A real wheel gesture establishes the
    // position (persisting where a programmatic scrollTo would be reverted by the
    // load-time scroll restoration), then we paint.
    await gotoWithHeldEngine(page);
    await wheelDownBy(page, INTENT_PX + 40);
    // Position is in place and past threshold; scene not yet painted so no reveal.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(INTENT_PX);
    await expect(page.locator('body')).not.toHaveClass(/scene-ready/, { timeout: 300 });
    // Paint: the pre-existing intent means the floor is already waived → prompt.
    const t0 = Date.now();
    await dispatchSceneReady(page);
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 1_500 });
    expect(Date.now() - t0, 'pre-frame intent waived the floor').toBeLessThan(900);
  });

  test('intent never dispatches loader:skip, sets webgl-unavailable, or moves scrollY', async ({
    page,
  }) => {
    await gotoWithHeldEngine(page);
    // Spy for a loader:skip dispatch (the explicit control's event) — it must
    // NEVER be synthesised by the intent path. The loader script wires skip on a
    // click, not on this event, but we assert the event is simply absent.
    await page.evaluate(() => {
      (window as unknown as { __sawSkip: boolean }).__sawSkip = false;
      window.addEventListener('loader:skip', () => {
        (window as unknown as { __sawSkip: boolean }).__sawSkip = true;
      });
    });
    await wheelDownBy(page, INTENT_PX + 40);
    const scrollYBefore = await page.evaluate(() => window.scrollY);
    await dispatchSceneReady(page);
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 1_500 });

    const sawSkip = await page.evaluate(
      () => (window as unknown as { __sawSkip: boolean }).__sawSkip,
    );
    expect(sawSkip, 'intent must not dispatch loader:skip').toBe(false);
    await expect(page.locator('body')).not.toHaveClass(/webgl-unavailable/);
    // Intent reads scrollY; it must not RESET it. The position established before
    // the reveal must be preserved across it.
    const scrollYAfter = await page.evaluate(() => window.scrollY);
    expect(scrollYAfter, 'intent must not reset native scroll position').toBe(scrollYBefore);
    expect(scrollYAfter, 'scroll position preserved').toBeGreaterThan(0);
  });

  test('floor expires with no first frame: loader stays up until scene:ready', async ({ page }) => {
    // PRD truth-table row 2: "Floor expires, no first frame → Keep loader visible;
    // reveal only at first frame or existing failure timeout."
    // Verify that floor expiry alone never reveals the loader — a real scene:ready
    // is still the gate. We let the floor (LOADER_MIN_MS = 900ms) run to completion
    // with the engine permanently held, confirm the loader is still covering the
    // scene, then dispatch scene:ready and confirm an immediate reveal (floor already
    // spent, so no additional wait).
    await gotoWithHeldEngine(page);
    // Wait for the floor to elapse with room to spare (1 400ms > 900ms floor).
    await page.waitForTimeout(1_400);
    // Floor elapsed — but no scene:ready → loader must still be visible.
    await expect(page.locator('.scene-loader'), 'loader persists after floor alone').toBeVisible();
    await expect(page.locator('body'), 'no scene-ready without the frame').not.toHaveClass(/scene-ready/);
    // Now dispatch the real first frame — reveal must be immediate (floor already spent).
    const t0 = Date.now();
    await dispatchSceneReady(page);
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 1_000 });
    expect(Date.now() - t0, 'reveal is prompt once painted (floor was spent)').toBeLessThan(600);
  });

  test('no stale scroll listener leaks onto a route after Astro navigation', async ({ page }) => {
    // Boot the home normally (real engine), let it reveal, then navigate away.
    // A leaked scroll observer from the home document must not survive onto the
    // destination — we assert the destination has no loader machinery watching.
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 15_000 });
    await page.locator('.overlay-blog-links a', { hasText: 'Writing' }).click();
    await page.waitForURL(/\/writing\/?$/);
    await expect(page.locator('h1')).toBeVisible();
    // The writing route has no .scene-loader; scrolling it must not re-trigger
    // any home loader behaviour or throw. A clean scroll with no console error
    // is the observable contract.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.evaluate(() => window.scrollTo(0, 300));
    expect(errors, 'no error from a leaked home loader listener').toHaveLength(0);
    expect(await page.locator('.scene-loader').count(), 'no home loader on the route').toBe(0);
  });
});
