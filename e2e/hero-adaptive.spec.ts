import { test, expect } from './test-base';

// ADAPTIVE DOWNGRADE — hero FPS under 4× CPU throttle (desktop, 1440×900).
//
// Root cause: detectDeviceTier() classifies ANY desktop with >4 cores + >4 GB
// + WebGL2 as 'high', regardless of integrated-GPU throughput. On a mid-range
// laptop the 1.2M-particle additive cloud runs at ~10 fps.
//
// Fix: createScene.ts samples rAF inter-frame deltas for the first 1.5s. If
// the median FPS falls below ADAPTIVE_FPS_FLOOR (30), activeTier steps down to
// 'low', triggering renderer.setPixelRatio(low-cap ≈ 0.6) and the 30fps cap.
//
// This spec asserts the post-adaptive FPS floor. It is necessarily SKIPPED on
// environments without live WebGL (CI software-GL, SwiftShader) because the
// adaptive only fires when the real GPU is genuinely slow — not when the CPU is
// throttled but the renderer is a software rasteriser already at a fixed rate.
// It is also SKIPPED when CDP CPU throttling is not available (some CI setups).
//
// To measure locally (requires a real GPU + Chromium):
//   npx playwright test e2e/hero-adaptive.spec.ts --project=chromium

const ADAPTIVE_WAIT_MS = 3_000;  // wait for 1.5s window + 1.5s settle
const MEASURE_MS = 3_000;        // FPS sampling window
const FPS_FLOOR = 24;            // must beat this post-adaptive

test('scroll FPS stays above floor under 4× CPU throttle after adaptive downgrade', async ({
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

  // Force 'high' tier so the adaptive path is exercised (CI might otherwise
  // auto-classify as 'low' and bypass the sampling window entirely).
  await page.goto('/?tier=high', { waitUntil: 'load' });

  // Skip immediately if WebGL is unavailable — software-GL environments cannot
  // produce meaningful per-pixel throughput numbers.
  const unavailable = await page.evaluate(
    () => document.body.classList.contains('webgl-unavailable'),
  );
  test.skip(unavailable, 'no live WebGL engine — adaptive downgrade not measurable');

  await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 30_000 });

  // Wait for the adaptive sampling window to complete and the downgrade to apply.
  await page.waitForTimeout(ADAPTIVE_WAIT_MS);

  // Measure rAF rate while gently scrolling (mirrors the measured ~10 fps baseline).
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
      `at 4× CPU throttle / 1440×900 / tier=high`,
  );
  await testInfo.attach('measured-fps', {
    body: fps.toFixed(2),
    contentType: 'text/plain',
  });

  expect(fps).toBeGreaterThan(FPS_FLOOR);

  // Restore throttle.
  if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
});
