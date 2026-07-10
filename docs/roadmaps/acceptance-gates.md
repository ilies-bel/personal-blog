# SOTY program — acceptance gates

Two layers of gates: the **internal award gates** the whole program aims at
(stricter than Awwwards' published bar), and the **per-phase verification
gates** every commit on this branch must pass.

## Internal award gates (from the audit handoff)

| Gate | Required internal standard |
|------|---------------------------|
| SOTD-ready | Zero P0/P1 findings; blind jury ≥8.25; Design ≥8.2, Usability ≥8.0, Creativity ≥8.8, Content ≥8.2; every route ≥8.0 desktop/mobile; three clean release candidates |
| Developer-Award-ready | Internal developer score ≥8.25, every dimension ≥8.0; WCAG 2.2 AA; good Core Web Vitals; no fallback, hydration, console, reflow, network, or context-loss defect |
| SOTM-ready | Both above; blind jury ≥8.5; top-decile vs 24 current comparables; 30 days stable production |
| SOTY-campaign-ready | Top-5% annual comparison; ≥80% seven-day concept recall; three proof-rich flagships; ≥99.95% uptime; complete rights/accessibility/campaign/preservation package |

Jury-dependent rows require the owner-side sessions in `docs/INPUTS-NEEDED.md` (#8).

## Standing per-commit gates (enforced by `.github/workflows/ci.yml`)

1. `astro check` — 0 errors
2. `pnpm test` — all unit tests (node --test)
3. `pnpm knip` — no unused files/dependencies (export-level findings warn until P11)
4. `pnpm build` — clean production build
5. `node scripts/check-links.mjs dist` — no broken internal refs, no protocol-relative URLs
6. `node scripts/check-asset-sizes.mjs dist` — no raster >500KB (target ≤250KB), every `<img>` dimensioned, duplicate-payload warnings
7. `node scripts/optimize-public-images.mjs --check` — no unoptimized raster committed to public/
8. `node scripts/check-figure-staleness.mjs` — committed engine captures match engine source hash
9. `node scripts/check-bundle-budgets.mjs dist` — gzip JS/HTML budgets from
   `budgets.json` (P10): hero engine graph ≤240KiB gz hard, per-route eager JS
   (engine pages ≤100KiB / reading routes ≤40KiB hard), per-page HTML ≤90KiB
   hard; target overages warn. Deterministic dist bytes — hard-enforced on any
   runner. Raise a budget only in the same commit as the code needing it, with
   the reason in `budgets.json` comments.
10. `node scripts/gen-perf-report.mjs --check dist` — perf-report staleness
    gate: the committed `src/data/perf-report.json` (the generated telemetry
    `/behind-the-build` renders — it replaced the hand-written budget table)
    must match the just-built dist within ±5%. Regenerate + rebuild + commit
    when what ships changes.
11. `pnpm lhci` (Lighthouse CI, own job after checks) — lab metrics on
    /, /projects, /writing, /contact, one post against the built dist.
    CLS ≤0.02 is an ERROR (deterministic). LCP ≤2.0s, TBT ≤200ms,
    total-byte-weight, unused-javascript are WARN-level for now: every
    available runner (sandbox + GitHub ubuntu) renders through software GL,
    so wall-clock lab numbers measure the runner, not the site. PROMOTION
    PENDING: these harden to errors once CI runs on real rendering hardware
    (owner input #8 real-device lane) — payload truth is meanwhile hard-gated
    by the deterministic bundle budgets above.
12. `npx html-validate "dist/**/*.html"` — 0 errors
13. Playwright matrix (chromium/firefox/webkit/Pixel 7/iPhone 14): smoke, no-js,
    reduced-motion (incl. mid-session flip + zero-engine-chunks), loader honesty,
    axe WCAG 2.2 AA (serious/critical fail), reflow 320–430px, visual baselines
    (static edition + 404), WebGL governance (≤2 contexts, zero three.js on
    reading routes, heap growth <max(15MB,10%) over 10 SPA cycles), images
    (dimensions + no 404s), content (derived counts match collections),
    mobile access (first-viewport nav, ≤9-viewport mobile track, skip control),
    route identity (P9: body[data-route] on every route, per-route structural
    marker, one RouteEnding per section page / article-next on posts),
    fps regression floor (P10: e2e/perf.spec.ts — rAF-counted fps on
    `/?tier=low` at stage 0 must stay ≥ the committed floor in
    e2e/perf-baseline.json, set at 60% of the environment's measured median;
    regeneration steps are in the spec header), nav-before-engine (P10:
    loader spec proves labelled nav is visible AND clickable on desktop while
    the engine chunks are still held at the network edge — the stable-strong
    form of the "navigation usable ≤2.5s" roadmap item)

Unit-test layer additions (P9): `test/route-transitions.test.mjs` pins every
time literal in transitions.css, the warpTransition JUMP/ARRIVE constants and
the dive arrival tail to the ≤700ms route-transition budget (the home hero's
scroll choreography is exempt by design — it is not a route transition).
Blind-screenshot evidence: `node scripts/shoot-routes-grayscale.mjs` (against
a fresh `pnpm build`) regenerates the grayscale contact sheets under
`scratchpad/p9/` for the phase-exit review.

Local invocation (sandbox): prefix Playwright with
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` and run
`--project=chromium --project=mobile-chrome` (other browsers run in CI).

## Phase-exit criteria

A phase commit may land only when: all standing gates green locally, the
phase's own new tests green, screenshots of changed surfaces reviewed
(scratchpad contact sheets), and the commit message records the verification
results. Deliberate gate-bust proofs (e.g. the evidence-schema failure) are
run, quoted in the commit body, and reverted before commit.

## Gates still to be added by later phases

- ~~P10~~ landed (standing gates 9–11 + the fps/nav e2e additions above).
  Numbers were adjusted to measured reality where the roadmap's guesses
  predated the measurement — the reasoning lives in `budgets.json` comments:
  hero graph 240 hard kept / target 235 (measured 232.4; the 210 aspiration
  needs an engine diet, tracked); pre-engine route JS 100/96 (measured 93.6 —
  the roadmap's 85/65 predate counting the React island runtime, 56.0KiB gz,
  as pre-hero); reading routes TIGHTENED to 40/20 (measured max 15.6 — at the
  roadmap's 85 a React-runtime leak would pass silently).
- P10 → real-hardware follow-up: promote LCP/TBT/byte-weight Lighthouse
  assertions from warn to error; re-baseline e2e/perf-baseline.json on the
  real CI runner.
- P11: CSP hash validation, scheduled production crawl (links + headers +
  uptime) against the live domain
- P14: full-matrix RC run tied to one SHA + RC dossier in `docs/rc/`
