import { test, expect } from './test-base';

// PERF SAFETY CONTRACT — hero FPS under 4× CPU throttle (desktop, 1440×900).
//
// Architecture note (why this spec no longer forces ?tier=high): device-tier
// selection is now PROACTIVE — detectDeviceTier() classifies the GPU up front
// from the unmasked renderer string, tie-breaking unknown strings with a
// fill-rate microprobe (src/hero/lib/config.ts). The old fail-first adaptive
// FPS sampler was demoted to a ONE-RUNG safety net (high→mid, mid→low) for the
// residue the upfront classification can't see, and it is PINNED OFF entirely
// when the tier is explicitly forced (isTierForced: ?tier= / sessionStorage /
// __bhTier — an explicit human choice the runtime must not override).
//
// So the old recipe — force ?tier=high, then wait for the runtime downgrade —
// now disables the very path it claimed to measure. What the product actually
// promises is end-to-end: whatever rung the proactive classifier picks for
// this machine (plus the one-rung net if the pick was too optimistic), a
// scrolling visitor on a CPU-constrained device keeps a usable frame rate.
// That is what this spec asserts: auto-classified tier, 4× CPU throttle,
// measured scroll FPS above the floor.
//
// Skips (necessarily): non-chromium projects (one GPU environment), no CDP
// throttling, no live WebGL, and software rasterisers ([data-soft-gl] —
// SwiftShader/llvmpipe FPS numbers measure the rasteriser, not the site).
//
// To measure locally (requires a real GPU + Chromium):
//   npx playwright test e2e/hero-adaptive.spec.ts --project=chromium

const ADAPTIVE_WAIT_MS = 3_000;  // the proactive pick is instant; leave the one-rung
                                 // safety net its ~1.5s sampling window + settle
const MEASURE_MS = 3_000;        // FPS sampling window
const FPS_FLOOR = 24;            // must beat this once the tier ladder has settled

test('scroll FPS stays above floor under 4× CPU throttle on the auto-classified tier', async ({
  page,
  context,
}, testInfo) => {
  // Desktop Chromium only — the baseline is one environment.
  test.skip(
    testInfo.project.name !== 'chromium',
    'hero adaptive spec is chromium-only (one GPU environment)',
  );

  // Apply 4× CPU throttle via CDP.
  let cdp: Awaited<ReturnType<typeof context.newCDPSession>> | null = null;
  try {
    cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  } catch {
    test.skip(true, 'CDP CPU throttling not available in this environment');
  }

  await page.setViewportSize({ width: 1440, height: 900 });

  // NO ?tier= override — the proactive classifier must pick the rung itself.
  // Forcing a tier flips isTierForced() and pins the safety net OFF, which
  // would turn this into a test of the pin, not of the performance contract.
  await page.goto('/', { waitUntil: 'load' });

  // Skip immediately if WebGL is unavailable — no engine, nothing to measure.
  const unavailable = await page.evaluate(
    () => document.body.classList.contains('webgl-unavailable'),
  );
  test.skip(unavailable, 'no live WebGL engine — FPS floor not measurable');

  await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 30_000 });

  // Software rasteriser (SwiftShader / llvmpipe): createScene stamps
  // html[data-soft-gl]. FPS there measures the rasteriser, not the tier
  // ladder — skip, exactly like the no-WebGL case.
  const softGl = await page.evaluate(
    () => document.documentElement.hasAttribute('data-soft-gl'),
  );
  test.skip(softGl, 'software rasteriser — FPS floor not meaningful');

  // Give the one-rung adaptive safety net its sampling window: if the
  // proactive pick was too optimistic for this machine, the step-down
  // (high→mid / mid→low) lands within ~1.5s and the measurement below sees
  // the settled configuration.
  await page.waitForTimeout(ADAPTIVE_WAIT_MS);

  // Measure rAF rate while gently scrolling (mirrors the measured ~10 fps
  // baseline that motivated the tier ladder).
  const fps = await page.evaluate(
    ({ ms }) =>
      new Promise<number>((resolve) => {
        let frames = 0;
        let start = -1;

        const scrollInterval = window.setInterval(() => {
          window.scrollBy({ top: 60, behavior: 'instant' });
        }, 150);

        const tick = (now: number): void => {
          if (start < 0) {
            start = now;
          } else {
            frames += 1; // count completed intervals
          }
          if (now - start >= ms) {
            window.clearInterval(scrollInterval);
            resolve((frames * 1_000) / (now - start));
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    { ms: MEASURE_MS },
  );

  console.log(
    `hero-adaptive: measured ${fps.toFixed(1)} fps over ${MEASURE_MS / 1_000}s ` +
      `at 4× CPU throttle / 1440×900 / auto tier`,
  );
  await testInfo.attach('measured-fps', {
    body: fps.toFixed(2),
    contentType: 'text/plain',
  });

  expect(fps).toBeGreaterThan(FPS_FLOOR);

  // Restore throttle.
  if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
});

test('?tier= is an explicit override: honoured and persisted for the session', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'hero adaptive spec is chromium-only (one GPU environment)',
  );
  // The contract here is "an explicit ?tier= is honoured and persisted" —
  // provable with ANY tier, so force the CHEAPEST rung. ?tier=high on CI's
  // software rasteriser boots the maximum particle load, and under a fully
  // parallel headless run its shader compile can exceed even a tripled test
  // budget (observed: body stuck pre-reveal for 30s+ on GitHub Actions).
  // ?tier=low exercises the identical override/persistence path (readTierOverride
  // → isTierForced → __bhTier mirror) with the lightest possible boot.
  test.slow();

  // The pin half of the contract: a forced tier is mirrored into
  // sessionStorage (key __bhTier — see readTierOverride in
  // src/hero/lib/config.ts) so it survives reloads and SPA navigations, and
  // the scene still boots on it. isTierForced() then disables the adaptive
  // sampler entirely; this asserts the observable surface of that decision —
  // the persisted override every subsequent detection consults.
  await page.goto('/?tier=low', { waitUntil: 'load' });

  const unavailable = await page.evaluate(
    () => document.body.classList.contains('webgl-unavailable'),
  );
  test.skip(unavailable, 'no live WebGL engine — tier override not exercised');

  await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 30_000 });

  const stored = await page.evaluate(() => {
    try {
      return window.sessionStorage.getItem('__bhTier');
    } catch {
      return null;
    }
  });
  expect(stored, 'forced tier is persisted for the session').toBe('low');
});
