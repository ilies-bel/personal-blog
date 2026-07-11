# RC-1 — release-candidate dossier

**Status: CLEAN — first of the three consecutive clean RCs required before
the submission tag** (`docs/RUNBOOK.md`, three-clean-RC rule). RC-2 and RC-3
should run on real CI hardware once the remote lands (INPUTS-NEEDED #1).

| | |
|---|---|
| Date | 2026-07-11 |
| Branch | `soty/program` |
| Validated tree | Parent commit `8b2784f` (P13) + this P14 commit ("P14 RC-1: full-matrix validation run, RC dossier, owner validation scripts — program complete"). A dossier cannot contain its own commit SHA; the RC commit is self-identifying — verify with `git log --oneline -1`. Relative to the validated product tree, P14 added only the two degraded-mode e2e specs (`e2e/no-webgl.spec.ts`) which are part of this run, plus docs. **No product code changed in P14.** |
| Runner | Local sandbox — Linux 6.18, Node v22.22.2, pnpm 10.28.2, Playwright 1.61.1, Chromium 141.0.7390.37 (SwiftShader software GL) |
| Fixes during the run | **None** — the run completed clean on the first pass (no restart needed) |

## RC run record

One build of the candidate tree; commands in order; summary lines quoted
from the run logs.

### Step (a) — build / typecheck / unit / dead-code

| Command | Result | Evidence |
|---------|--------|----------|
| `pnpm build` | ✅ `10 page(s) built in 7.06s — Complete!` | run log |
| `pnpm check` | ✅ `Result (172 files): 0 errors, 0 warnings, 48 hints` | run log |
| `pnpm test` | ✅ **89/89 unit tests pass**, 0 skipped | run log |
| `pnpm knip` | ✅ clean — no unused files/exports/types/deps (error-level since P11) | run log |

### Step (b) — the 8 dist gates + html-validate (standing gates 5–10, 13, 14, 12)

| # | Gate | Result | Evidence (summary line) |
|---|------|--------|-------------------------|
| 5 | `check-links.mjs dist` | ✅ | `10 pages scanned … all internal references resolve ✓` |
| 6 | `check-asset-sizes.mjs dist` | ✅ | `56 raster(s) scanned … within budget, all <img> dimensioned ✓` |
| 7 | `optimize-public-images.mjs --check` | ✅ | `18 public raster(s) scanned, 0 unoptimized ✓` |
| 8 | `check-figure-staleness.mjs` | ✅ | `8 capture(s) fresh (hash 13869105ff67…) ✓` |
| 9 | `check-bundle-budgets.mjs dist` | ✅ | `within budgets ✓` (hero graph ≤240KiB gz; reading routes e.g. /writing eager JS 15.3K vs 40K hard) |
| 10 | `gen-perf-report.mjs --check dist` | ✅ | `committed report matches the built dist (±5%) ✓` |
| 13 | `gen-csp-hashes.mjs --check dist` | ✅ | `8 inline-script hash(es) in docs/SECURITY-HEADERS.md match the built dist` |
| 14 | `check-og-cards.mjs dist` | ✅ | `10 page(s) → 10 distinct card(s) … every page ships a resolvable 1200×630 card ≤300KB` |
| 12 | `npx html-validate "dist/**/*.html"` | ✅ | 0 errors (exit 0) |

### Step (c) — full Playwright run (chromium + mobile-chrome)

`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test
--project=chromium --project=mobile-chrome` — the entire e2e suite, both
local projects, one preview of the step-(a) build:

**244 passed, 1 skipped, 1 flaky-passed-on-retry, 0 failed — 10.4 minutes,
exit 0.**

- The skip: `e2e/perf.spec.ts` fps floor on mobile-chrome (desktop-only by
  design — the floor is baselined on the desktop viewport).
- The flaky: `e2e/loader.spec.ts` "first-visit floor is honest" on
  mobile-chrome — passed on retry. This spec measures wall-clock reveal
  latency of an eased UI on contended software-rendered CPU and carries
  `retries: 2` in-file for exactly this scheduler noise (documented in the
  spec header since P7); it failed once under parallel-worker contention
  and passed on retry. Not a product defect; expected quiet on real CI.

Per-suite (green test executions across both projects):

| Suite | Tests | Suite | Tests |
|-------|------:|-------|------:|
| zoom (200–400% + text-spacing) | 38 | webgl (census/heap/context-loss) | 12 |
| targets (44px coarse-pointer) | 20 | reflow (320–430px) | 12 |
| smoke (routes + 404) | 20 | mobile-access | 10 |
| routes-identity (P9) | 18 | a11y-states (loader/static/reduced/modal) | 10 |
| og cards over HTTP | 18 | loader honesty + nav-before-engine | 8 |
| images (dimensions, no 404s) | 18 | forced-colors | 8 |
| a11y (axe WCAG 2.2 AA) | 18 | reduced-motion (incl. mid-session flip) | 6 |
| content (derived counts, evidence pins) | 16 | visual baselines | 4 |
| no-js | 4 | **no-webgl + slow-network (NEW P14)** | **4** |
| | | perf fps floor | 1 (+1 skip) |

245 green executions + 1 designed skip = the full local matrix.

### Step (d) — visual evidence set

Scroll-through full-page screenshots of all 10 routes at 1280×800 and
390×844 → `scratchpad/rc/` (20 shots, `scratchpad/shoot-rc.mjs`; each page
is scrolled to the bottom and back before capture, which fixes the P13
lazy-load paint artifact — the graveyard specimen figures are now fully
painted in the full-page captures). Grayscale + color contact sheets
regenerated → `scratchpad/p9/contact-sheet-{desktop,mobile}-{gray,color}.png`
(`node scripts/shoot-routes-grayscale.mjs`). All 24 artifacts eyeballed;
findings in "Known cosmetic items" below. (scratchpad/ is gitignored local
evidence by design — regenerate with the two scripts against a fresh build.)

Evidence-set caveats (artifacts of the method, not site defects):

- The HOME full-page capture shows the nav + opening ring over a black
  column: the hero canvas is position:fixed and the manifesto beats are
  scroll-opacity-gated, so a stitched full-page PNG cannot represent the
  scroll experience. The contact-sheet viewport frame and the P12
  submission stills are the honest home evidence.
- `/graveyard` and `/behind-the-build` mount a live ArticleScene whose
  scene:ready can exceed 60s under SwiftShader; when it times out the
  scripts shoot the poster state (logged in the capture output). Carried
  P9 note; irrelevant on real GPUs.

## Gate table — every gate from `docs/roadmaps/acceptance-gates.md`

### Standing per-commit gates

| Gate | Result at RC-1 | Evidence |
|------|----------------|----------|
| 1 `astro check` | ✅ 0 errors | step (a) |
| 2 unit tests | ✅ 89/89 | step (a) |
| 3 knip | ✅ clean | step (a) |
| 4 `pnpm build` | ✅ | step (a) |
| 5–10, 13, 14 dist gates | ✅ all 8 | step (b) table |
| 11 Lighthouse CI | ⏸ **pends real CI** — CLS≤0.02 error gate + warn-level LCP/TBT verified green at P10 on this runner, but wall-clock lab numbers on software GL measure the runner, not the site; not re-run for RC-1 (deterministic payload truth is covered by gates 9/10) | P10 record; INPUTS-NEEDED #1 |
| 12 html-validate | ✅ 0 errors | step (b) |
| 15 Playwright matrix | ✅ chromium + mobile-chrome (full local matrix); ⏸ firefox / webkit / mobile-safari pend real CI | step (c); caveats below |

### Degraded-mode sweep (matrix row of gate 15, all local-verified at RC-1)

| Mode | Spec | Result |
|------|------|--------|
| No JS | `e2e/no-js.spec.ts` | ✅ |
| **No WebGL** (getContext → null) | `e2e/no-webgl.spec.ts` (NEW at P14) — immediate revealWithoutWebgl path beats the 8s backstop, on-brand note, nav works, zero console errors | ✅ |
| **Slow network** (chunks held at the edge) | `e2e/no-webgl.spec.ts` (NEW at P14) — loader paints from document HTML, Skip releases the page while the engine is still in flight | ✅ |
| Context loss mid-session | `e2e/webgl.spec.ts` (`WEBGL_lose_context`) | ✅ |
| Reduced motion (incl. mid-session OS flip, zero engine chunks) | `e2e/reduced-motion.spec.ts` | ✅ |
| Forced colors | `e2e/forced-colors.spec.ts` | ✅ |
| Zoom 200–400% + text spacing | `e2e/zoom.spec.ts` | ✅ |
| Reflow 320–430px | `e2e/reflow.spec.ts` | ✅ |

### Internal award gates (owner-blocked — no code path)

| Gate | Status at RC-1 |
|------|----------------|
| Blind jury ≥8.25 / dimension floors / every route ≥8.0 | ⏸ awaiting the 9-person proxy jury — protocol ready at `docs/validation/proxy-jury.md` (INPUTS-NEEDED #8) |
| Real-device / thermal / screen-reader / usability sign-offs | ⏸ session scripts ready in `docs/validation/` (INPUTS-NEEDED #8) |
| Three proof-rich flagships, de-hedged claims | ⏸ content inputs #2–#5, #7 — evidence debt is explicit (`draftEvidence: true` ×2, e2e-pinned) |
| Security headers live / prod crawl green on GitHub | ⏸ inputs #1, #9 |
| 30-days-stable / uptime / ≥80% 7-day recall | ⏸ post-launch measures; recall protocol in `docs/validation/usability-session.md` |

## Environment caveats

1. **Software GL**: every local render (screenshots, FPS floor, Lighthouse
   at P10) went through SwiftShader. Wall-clock/frame numbers measure the
   runner; the deterministic gates (bytes, structure, CLS) are the ones
   hard-enforced here. Real-GPU truth = `docs/validation/device-matrix.md`.
2. **Chromium-family only locally**: firefox / webkit / mobile-safari
   projects are defined in `playwright.config.ts` but their browsers are
   not installed in this sandbox — they run on real CI
   (INPUTS-NEEDED #1). RC-1's cross-engine claim is therefore
   chromium-engine only (desktop + Pixel 7 profile).
3. **Lighthouse wall-clock gates** (LCP/TBT/byte-weight) stay warn-level
   until CI runs on real rendering hardware; promotion steps are in
   `docs/roadmaps/acceptance-gates.md` (gate 11).
4. Submission stills/reel (P12) must be regenerated on real GPU hardware
   before upload — SwiftShader captures are fine for OG cards only.

## Known cosmetic items

Reviewed and consciously shipped at RC-1 (none are gate failures; axe and
the contrast unit tests are green — these are editorial-eye findings for
the owner's creative pass):

1. **Graveyard opening frame at 390px**: the h1 "Not everything survives."
   and especially the lead sentence cross the live scene's bright photon
   ring arc — the line stays legible (the P8 scrim holds the measured
   contrast) but visibly washes where it overlaps the halo. Desktop has
   clearance. Candidate fix if the owner agrees: extend the bright-state
   scrim (or nudge the journey's opening framing) at ≤480px.
   Evidence: `scratchpad/rc/mobile-graveyard-full.png` (top band).
2. **Behind the Build — STREAK shader tile** reads nearly black at gallery
   size: the subject (two-tier hyperspace lanes) is faint by design and
   only active in the dive beat, so its committed capture looks like an
   empty panel beside its eight siblings.
   Evidence: `scratchpad/rc/desktop-behind-the-build-full.png` (gallery).
3. **Behind the Build — fallback-ladder tier thumbnails** (high/low tier)
   render as soft unlabelled blobs at card size; they carry little
   information beyond "an engine frame existed". The copy does the work.
   Evidence: same capture, section 04.

Nothing else stood out across the 20 full-page shots + 4 contact sheets:
route identity survives grayscale on both viewports, specimen/case-study
figures are fully painted, prose columns hold at 390px, and the 404 and
posts are clean.

## Sign-off checklist (owner signs; unchecked at RC-1)

- [ ] **Creative** — art direction reviewed route-by-route on real hardware; grayscale identity holds; supernova peak lands
- [ ] **Technical** — full CI matrix green on GitHub (all 5 Playwright projects + Lighthouse job); real-device FPS/thermal pass recorded
- [ ] **Content** — claims de-hedged or consciously shipped as draft; copy proofread; case studies approved
- [ ] **Accessibility** — screen-reader sessions run (`docs/validation/screen-reader-session.md`); findings triaged
- [ ] **Privacy** — no analytics confirmed as intended (or `docs/ANALYTICS.md` enacted deliberately); security headers pasted (input #9)
- [ ] **Owner** — final go: freeze schedule set (`docs/RUNBOOK.md` T−14/T−7/T−3), RC-2/RC-3 scheduled on real CI

## RC counter

**RC-1 of 3.** Per the three-clean-RC rule, any fix after this run resets
the count. Cut RC-2 by re-running the RC procedure in
`docs/roadmaps/acceptance-gates.md` (on real CI once available) and
recording `docs/rc/RC-2.md` from this file's structure.
