// Lighthouse CI configuration (P10) — lab-metric gates over the built site.
//
//   pnpm lhci autorun          (CI: after the checks job; locally: same command,
//                               CHROME_PATH=/opt/pw-browsers/chromium in the sandbox)
//
// Serves ./dist statically (same bytes GitHub Pages serves) and audits the
// five representative routes: home (engine page), the three reading routes,
// and one post.
//
// Assertion severity is deliberately split:
//   • CLS — ERROR. Layout stability is deterministic (server-rendered HTML,
//     fixed-footprint canvas host, dimensioned images), so it holds even on
//     software rendering.
//   • LCP / TBT / byte-weight / unused-js — WARN for now. The only runners
//     available (local sandbox + GitHub ubuntu runners) render through
//     SwiftShader/software GL, where wall-clock numbers measure the scheduler,
//     not the site; a hard gate would be a coin flip. They harden to errors
//     when the pipeline gets real hardware (tracked in
//     docs/roadmaps/acceptance-gates.md). Deterministic payload budgets are
//     ALREADY hard-enforced by scripts/check-bundle-budgets.mjs — this layer
//     adds the lab view, it does not carry the payload gate.
module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      // Directory-format build: every route is a real index.html.
      url: [
        'http://localhost/',
        'http://localhost/projects/',
        'http://localhost/writing/',
        'http://localhost/contact/',
        'http://localhost/posts/memory-leak-search-and-destroy/',
      ],
      numberOfRuns: 1,
      settings: {
        // Sandbox-friendly Chrome; SwiftShader GL is what CI gets anyway.
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      assertions: {
        // Deterministic → hard error.
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.02 }],
        // Wall-clock → warn until real CI hardware exists (see header).
        'largest-contentful-paint': ['warn', { maxNumericValue: 2000 }],
        'total-blocking-time': ['warn', { maxNumericValue: 200 }],
        'total-byte-weight': ['warn', { maxNumericValue: 3145728 }],
        'unused-javascript': ['warn', { maxNumericValue: 307200 }],
      },
    },
    upload: {
      // Keep reports as local files (uploaded as a CI artifact); no LHCI server.
      target: 'filesystem',
      outputDir: '.lighthouseci/reports',
    },
  },
};
