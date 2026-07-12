import { test, expect } from './test-base';
import baseline from './perf-baseline.json' with { type: 'json' };

// FPS REGRESSION BASELINE (P10).
//
// CI renders through SwiftShader (software GL), so an absolute fps target would
// gate on the runner, not the site. Instead this spec pins a REGRESSION floor:
// a committed baseline (e2e/perf-baseline.json) measured in this same
// environment, with the enforced floor set at 60% of the measured median so
// scheduler variance between runs can't flake the gate — but a real regression
// (a new per-frame allocation, a post-chain pass that doubled, an accidental
// second engine) still fails decisively.
//
// The measurement itself:
//   • '/?tier=low' — the tier override in src/hero/lib/config.ts pins the
//     engine's DeviceTier, so the run always measures the SAME workload
//     (low-tier grain count + no bloom) instead of whatever the runner's
//     capability probe resolves to that day.
//   • after body.scene-ready + a settle window, count rAF callbacks for 8s at
//     stage 0 (page top — the black-hole beat; no scrolling, so the eased
//     presentation clock is at rest and the workload is stationary).
//   • desktop-chromium project only: the baseline is one number for one
//     environment; other projects skip rather than compare apples to oranges.
//
// REGENERATING THE BASELINE (after a deliberate engine change, or when CI
// hardware changes): run the suite 3× and take the median of the reported
// "measured fps" attachment, then write e2e/perf-baseline.json with
// medianFps = that median and floorFps = round(0.6 × medianFps):
//
//   for i in 1 2 3; do PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium \
//     npx playwright test e2e/perf.spec.ts --project=chromium; done
//
// (Each run prints `perf: measured N fps` on stdout and attaches it to the
// report.) Commit the JSON in the same change as the engine edit that moved it,
// with the reason in the commit body.

const MEASURE_MS = 8_000;

test('home hero fps at stage 0 stays above the committed regression floor', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== baseline.project,
    `baseline is committed for the ${baseline.project} project only`,
  );
  test.setTimeout(120_000);

  await page.goto(baseline.url, { waitUntil: 'load' });
  await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 30_000 });

  // scene-ready can also come from the no-WebGL backstop — there is no engine
  // frame loop to measure there, and an idle page's 60fps rAF would "pass" any
  // floor. Only a live engine run counts.
  const unavailable = await page.evaluate(() => document.body.classList.contains('webgl-unavailable'));
  test.skip(unavailable, 'no live WebGL engine in this environment — nothing to measure');

  // Let post-first-frame work (shader warm-up, HUD hydration) drain before
  // sampling, so the window measures steady state rather than boot cost. On
  // software GL the warm-up tail is long — 3s settle left the first run of a
  // cold batch ~35% under the others; 6s stabilized it.
  await page.waitForTimeout(6_000);

  const fps = await page.evaluate(
    (ms) =>
      new Promise<number>((resolve) => {
        let frames = 0;
        let start = -1;
        const tick = (now: number): void => {
          if (start < 0) start = now;
          else frames += 1; // count completed frame intervals, not callbacks
          if (now - start >= ms) resolve((frames * 1_000) / (now - start));
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    MEASURE_MS,
  );

  console.log(`perf: measured ${fps.toFixed(1)} fps over ${MEASURE_MS / 1000}s at ${baseline.url}`);
  await testInfo.attach('measured-fps', { body: fps.toFixed(2), contentType: 'text/plain' });

  expect(
    fps,
    `fps ${fps.toFixed(1)} fell below the committed floor ${baseline.floorFps} ` +
      `(median at baseline time: ${baseline.medianFps} — see e2e/perf-baseline.json for regeneration steps)`,
  ).toBeGreaterThanOrEqual(baseline.floorFps);
});
