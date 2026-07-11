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
3. `pnpm knip` — no unused files/exports/types/dependencies (P11 retired the
   export-level warn downgrade: the dead exports were deleted and the rules
   block removed, so everything is error-level again)
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
13. `node scripts/gen-csp-hashes.mjs --check dist` (P11) — CSP staleness gate:
    the sha256 inline-script hashes recorded in `docs/SECURITY-HEADERS.md`
    (the value pasted into the Cloudflare Response Header Transform rule)
    must match the inline scripts in the just-built dist. Fires whenever the
    BaseHead pre-paint script changes, Astro/Vite is upgraded, or an island
    directive is added/removed. Fix: `pnpm build &&
    node scripts/gen-csp-hashes.mjs`, commit the doc, re-paste the rule.
14. `node scripts/check-og-cards.mjs dist` (P12) — OG-card gate: every dist
    page must advertise a same-origin og:image (twitter:image agreeing) that
    resolves in dist, weighs ≤300KB, and is exactly 1200×630. The route cards
    in `public/og/` are committed release assets (regenerated per release —
    same staleness philosophy as the figure captures, but no hash gate: the
    cards are editorial, any recent engine frame is honest). Fix:
    `pnpm build && node scripts/gen-og-cards.mjs &&
    node scripts/optimize-public-images.mjs && pnpm build`, commit public/og/.
15. Playwright matrix (chromium/firefox/webkit/Pixel 7/iPhone 14): smoke, no-js,
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
    form of the "navigation usable ≤2.5s" roadmap item),
    og cards over HTTP (P12: e2e/og.spec.ts — every route's og:image is a
    route-specific /og/ card, twitter:image agrees, and the URL serves an
    image/png ≤300KB from the preview server)

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
- ~~P12~~ landed: standing gate 14 (OG cards) + the e2e og spec above. The
  submission capture suite (`scripts/shoot-submission.mjs`,
  `scripts/record-reel.mjs`) is release tooling, not a gate — its committed
  record is `docs/awwwards/captures/manifest.json`, and the campaign
  templates live in `docs/awwwards/`.
- ~~P11~~ landed: standing gate 13 (CSP staleness) above, plus the scheduled
  production crawl `.github/workflows/prod-crawl.yml` (weekly cron +
  manual dispatch against https://ilies-bel.dev: apex 200, http→https,
  www-redirect state, key routes 200, honest 404, sitemap reachable +
  every sitemap URL 200, security headers). The security-header step is
  WARN-ONLY until the owner applies the Cloudflare rules from
  `docs/SECURITY-HEADERS.md` (INPUTS-NEEDED #9) — then set
  `WARN_ONLY_HEADERS: 'false'` in prod-crawl.yml to promote it to an error.
  Release discipline itself (freeze schedule T−14/T−7/T−3, the RC checklist,
  the three-clean-RC rule, post-launch monitoring, archive procedure) is
  codified in `docs/RUNBOOK.md`.
- ~~P14~~ landed: the RC procedure below, the degraded-mode sweep completions
  (`e2e/no-webgl.spec.ts`: getContext-null → immediate on-brand fallback, and
  the slow-network loader/skip smoke), the owner-session scripts in
  `docs/validation/`, and RC-1 (`docs/rc/RC-1.md`).

## Release-candidate (RC) procedure — added at P14

An RC is ONE full-matrix validation run tied to ONE commit, recorded as a
dossier in `docs/rc/RC-<n>.md`. The run, in order, against a single build of
the candidate tree:

1. `pnpm build && pnpm check && pnpm test && pnpm knip`
2. All 8 dist gates (standing gates 5–10, 13, 14 — the exact command line is
   in `docs/RUNBOOK.md` step 2) + `npx html-validate "dist/**/*.html"`
3. The full Playwright suite — every project available on the runner
   (chromium + mobile-chrome locally; the complete
   chromium/firefox/webkit/mobile matrix once CI runs, INPUTS-NEEDED #1)
4. Visual evidence: scroll-through full-page screenshots of all 10 routes at
   1280 + 390 (scroll each page to the bottom and back BEFORE capturing —
   lazy-loaded media must be painted) + regenerated grayscale contact sheets
   (`node scripts/shoot-routes-grayscale.mjs`), human-reviewed; anything off
   is either fixed (resets the run) or recorded in the dossier as a known
   cosmetic item.

If ANY step fails: fix, commit the fix, and RESTART the whole run — the
dossier records only the final clean run. Because a dossier cannot contain
its own commit SHA, each dossier identifies its run by parent SHA + commit
title (the RC commit itself must change no product code relative to the
validated tree beyond the dossier/evidence records).

**Three-clean-RC rule** (from `docs/RUNBOOK.md`): the submission tag is cut
only after three consecutive RCs pass with zero fixes in between; any fix
resets the count. RC-1 = the P14 run. RC-2/RC-3 SHOULD run on real CI
hardware (full browser matrix + Lighthouse wall-clock gates promoted) once
the remote exists.
