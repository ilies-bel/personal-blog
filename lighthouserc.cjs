// Lighthouse CI configuration — PERF-008 lab CWV gate.
//
//   pnpm lhci autorun          collect + assert hard limits
//   node scripts/cwv-gate.mjs  check record targets, archive evidence
//
// Serves ./dist statically (same bytes GitHub Pages serves) and audits all
// nine public routes three times each (≥3 runs → LHCI reports median per
// route, covering both the cold first fetch and warm subsequent runs where
// static assets are cache-hit).
//
// THROTTLE PROFILE — mid-range mobile (Moto G4 / PageSpeed Insights standard):
//   CPU: 4× slowdown (simulate method — works on software-rendered CI).
//   Network: Slow 4G (150 ms RTT, 1.6 Mbps down, 0.75 Mbps up).
//   Viewport: 390 × 844, deviceScaleFactor 3 (mid-range smartphone).
// `simulate` is the only mode available on GitHub ubuntu runners (no kernel
// perf events), so devtools throttle is not used even locally in this config.
//
// ASSERTION TIERS:
//   ERROR (hard limit) — blocks CI. Values from PERF-008 blocking gates.
//   WARN (record target) — NOT in this file; checked and reported separately
//     by scripts/cwv-gate.mjs (LCP 2.0s / INP 150ms / CLS 0.02 / TBT 150ms).
//
// CLS note: CLS is deterministic (server-rendered HTML, fixed-footprint canvas
// host, dimensioned images), so the 0.10 hard limit is an outer backstop.
// The 0.02 record target (tighter) is what the site should achieve and is
// enforced at WARN level by the gate script.
//
// LCP / INP / TBT note: simulate-method numbers on software-rendered CI
// measure the scheduler more than the site, but the hard limits (2.5s / 200ms /
// 200ms) are generous enough to catch real regressions (new render-blocking
// resources, large unoptimised LCP images, new synchronous JS payloads) without
// producing coin-flip failures on swapping runner hardware.
module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      // All nine public routes — the full audience surface.
      url: [
        'http://localhost/',
        'http://localhost/projects/',
        'http://localhost/writing/',
        'http://localhost/contact/',
        'http://localhost/graveyard/',
        'http://localhost/about/',
        'http://localhost/behind-the-build/',
        'http://localhost/posts/memory-leak-search-and-destroy/',
        'http://localhost/posts/thanks-for-scrolling-to-the-bottom/',
      ],
      // Median of 3 runs per route — covers cold (run 1) and warm (runs 2–3).
      numberOfRuns: 3,
      settings: {
        // Sandbox-friendly Chrome flags required on Linux CI.
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
        // Mid-range mobile throttle profile.
        formFactor: 'mobile',
        throttlingMethod: 'simulate',
        screenEmulation: {
          mobile: true,
          width: 390,
          height: 844,
          deviceScaleFactor: 3,
          disabled: false,
        },
        throttling: {
          // Slow 4G — 150 ms round-trip, ~1.6 Mbps effective throughput.
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 4,
          requestLatencyMs: 562.5,
          downloadThroughputKbps: 1474.56,
          uploadThroughputKbps: 675,
        },
      },
    },
    assert: {
      // Hard limits — EXIT 1 if any route's median exceeds these.
      // Record targets (tighter) are checked by scripts/cwv-gate.mjs.
      assertions: {
        'cumulative-layout-shift':    ['error', { maxNumericValue: 0.10 }],
        'largest-contentful-paint':   ['error', { maxNumericValue: 2500 }],
        'interaction-to-next-paint':  ['error', { maxNumericValue: 200 }],
        'total-blocking-time':        ['error', { maxNumericValue: 200 }],
      },
    },
    upload: {
      // Keep reports as local filesystem files; CI archives the whole dir.
      target: 'filesystem',
      outputDir: '.lighthouseci/reports',
    },
  },
};
