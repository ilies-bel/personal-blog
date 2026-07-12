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
//   ERROR (hard limit) — blocks CI. See assertMatrix below for per-route split.
//   WARN  (advisory)  — visible in report, never blocks CI.
//   Record targets (LCP 2.0s / INP 150ms / CLS 0.02 / TBT 150ms) — checked
//     separately by scripts/cwv-gate.mjs.
//
// PER-ROUTE SPLIT (P10 decision; see docs/rc/RC-1.md §3 — software-GL caveats):
//
//   Route         CLS    LCP     INP     TBT
//   /             ERROR  warn    warn    warn    ← WebGL boot inflates on SwiftShader
//   all others    ERROR  ERROR   ERROR   ERROR   ← zero-WebGL, perf=100 on SwiftShader
//
//   CLS is deterministic (server-rendered HTML, fixed-footprint canvas host,
//   dimensioned images) on every route — ERROR at 0.02 is safe everywhere.
//   LCP / INP / TBT on the home route use SwiftShader (GitHub software-GL runner)
//   to render the WebGL engine: observed TBT ~155 s lab, LCP inflated by the
//   same artifact. These metrics stay WARN-only until INPUTS-NEEDED #8 (real
//   rendering hardware). The reading routes render zero WebGL and score perf=100
//   on SwiftShader, so hard ERROR limits are reliable there. RC-1 §3.
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
      // Per-route assertion matrix — see header comment for rationale.
      // Record targets (tighter) are checked by scripts/cwv-gate.mjs.
      assertMatrix: [
        {
          // All routes except home — zero WebGL, score perf=100 even on
          // SwiftShader. Hard ERROR limits are reliable here. RC-1 §3.
          matchingUrlPattern: 'http://localhost/.+',
          assertions: {
            'cumulative-layout-shift':   ['error', { maxNumericValue: 0.02 }],
            'largest-contentful-paint':  ['error', { maxNumericValue: 2500 }],
            'interaction-to-next-paint': ['error', { maxNumericValue: 200 }],
            'total-blocking-time':       ['error', { maxNumericValue: 200 }],
          },
        },
        {
          // Home route (/) — WebGL engine boot inflates LCP and TBT to nonsense
          // on SwiftShader (observed TBT ~155 s lab). CLS stays ERROR because it
          // is deterministic and unaffected by WebGL rendering. LCP / INP / TBT
          // are WARN-only until INPUTS-NEEDED #8 (real rendering hardware). RC-1 §3.
          matchingUrlPattern: 'http://localhost/$',
          assertions: {
            'cumulative-layout-shift':   ['error', { maxNumericValue: 0.02 }],
            'largest-contentful-paint':  ['warn',  { maxNumericValue: 2500 }],
            'interaction-to-next-paint': ['warn',  { maxNumericValue: 200 }],
            'total-blocking-time':       ['warn',  { maxNumericValue: 200 }],
          },
        },
      ],
    },
    upload: {
      // Keep reports as local filesystem files; CI archives the whole dir.
      target: 'filesystem',
      outputDir: '.lighthouseci/reports',
    },
  },
};
