# SOTY Execution Program — Implementation Plan

## PROGRAM STATUS (updated 2026-07-10, at the claude/soty-ultraplan handoff push)

Work happens on branch `soty/program`, pushed to `origin/claude/soty-ultraplan`.
Handoff rules from the owner: push after each phase; do NOT rebase onto
origin/main (a parallel orchestrator advanced it ~50 commits; reconciliation is
handled separately — the unrebased branch preserves the three-way diff); no PR yet.
Companion artifacts: `docs/roadmaps/acceptance-gates.md`, `docs/EVIDENCE-SCHEMA.md`,
`docs/INPUTS-NEEDED.md`.

- ✅ **P0 baseline** — deps installed; build/check/42-unit-tests green pre-program.
- ✅ **P1 trust repair** — committed `cab3f29`. No-JS static edition (verified by JS-disabled Playwright probe: loader hidden, labelled Work/Writing/About/Contact nav in first viewport, 1.4 viewports tall), `withBase()` favicon fix (0 protocol-relative URLs in dist), dev-blueprint out of prod+sitemap, branded 404 with noindex, Person/WebSite/Breadcrumb/BlogPosting JSON-LD @graph, prose overflow-wrap + budget-table scroll region, nested-main fix, `scripts/check-links.mjs` (green), DEPLOY.md refreshed.
- ✅ **P2 test & CI foundation** — committed `23309bc`. playwright.config.ts repaired (was pointing at nonexistent e2e/ + stale /personal-blog baseURL); 7 e2e suites (smoke, no-js, reduced-motion, loader, a11y/axe, reflow 320–430px, visual baselines for static edition + 404); `.github/workflows/ci.yml` (typecheck→unit→knip→build→links→asset-gate→html-validate→Playwright matrix); `scripts/check-asset-sizes.mjs` raster gate with 3 grandfathered P5 overages; fixed real a11y bugs the gates caught (nested-interactive links in `<summary>`, aria-label on bare div/p ×6, FinaleLedger tabIndex gating); html-validate 0 errors; knip green (export-level findings downgraded to warn until P11); **62/62 e2e green** on chromium + mobile-chrome (firefox/webkit/mobile-safari defined for CI). Playwright pinned 1.61.1 to match @axe-core/playwright types. Local runs need `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`.
- ✅ **P3 motion centralization** — committed `c928c0e`. `src/lib/motion.ts` single source of truth over `html[data-motion]` (pre-paint script consults the `bh:reduced-motion` override key); all 6 duplicated matchMedia sites rewired; 11 CSS files migrated to `html[data-motion='reduced']`; hydration seam closed; live OS-flip without reload (e2e-proven). 64/64 e2e.
- ✅ **P4 WebGL governance** — committed `73fa77c`. `glGovernor.ts` (MAX 2 contexts, LRU evict, 10 unit tests via native-TS import); Behind the Build figures → committed WebP captures with opt-in "Run live" (governor-gated, scroll-away release); `AmbientBackdrop.astro` posters+CSS replace the full engine on about/projects/writing (reading routes ship ZERO three.js — request-asserted); StarMarker rect caching + ResizeObserver; heap gate (10 SPA cycles) + context census + figure-staleness CI gate. 76/76 e2e.
- ✅ **P5 image pipeline** — committed `5f7ebc6`. All content rasters through astro:assets (`Img.astro` MDX wrapper, `<Picture>` on pages); Golden Record 4.07MB→146KB AVIF; graveyard 679/509KB→90/109KB AVIF; og-default 312→81KB in place; grandfather list deleted; gates tightened (img-dimensions gate, duplicate-hash warn, public-optimizer --check in CI); OFL font licenses. Astro 6 gotcha documented in `src/components/mdx/Img.astro`: never read properties off imported ImageMetadata — it ships the raw original into dist. 92/92 e2e.
- ✅ **P6 content collections** — committed `5727d71`. Evidence-enforcing schemas in `src/lib/contentSchemas.ts` (claims need evidence or `draftEvidence: true` — build-failure proven and quoted in the commit body); projects/graveyard migrated to `src/content/`; Mars SVG → `MarsTopology.astro`; derived counts flow index.astro → island props → FinaleLedger; shader count from shared `shaderCatalog.ts`; authors/provenance formalized (Lansana Diomande credited in byline + JSON-LD). 98/98 e2e. See `docs/EVIDENCE-SCHEMA.md`.
- ⚠️ **P7 mobile access & IA** — **WIP checkpoint committed `ead7f4f`, UNVERIFIED** (implementing agent interrupted twice by session limits). Landed: Work/Writing/About/Contact relabel across SiteNav/footer/StaticEdition/404/FinaleLedger; new `/contact` route + `contact.css` + `AVAILABILITY` const (safe defaults); loader-floor lowering + skip-control work in index/HeroIsland/constants; mobile `--stage-h` cut in scene.css; e2e updates (routes list incl. /contact, loader-honesty spec, new mobile-access.spec.ts). NOT verified: build/check/test/knip/e2e never completed on this tree; the finale REPLAY row, per-beat mobile copy tuning, and visual-baseline regeneration may be incomplete — audit against the P7 section below.
- ⬜ P8–P14 not started.

### Resume point (do this first)
1. Verify the P7 WIP tree end-to-end: `pnpm build && pnpm check && pnpm test && pnpm knip && node scripts/check-asset-sizes.mjs dist && node scripts/check-links.mjs dist`, then `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --project=chromium --project=mobile-chrome`.
2. Complete anything missing from the P7 task list (check: skip-intro control exists, works pre-hydration, ≥44px, tab-reachable; corner nav clickable during the loader; FinaleLedger REPLAY row + posts count; nojs-home visual baselines regenerated for the Contact-link change; 390px screenshots eyeballed).
3. Commit as "P7 complete: …" and push to origin claude/soty-ultraplan.
4. Continue P8→P14 sequentially (one subagent per phase, phases share files — never parallel in one tree), pushing after each phase. NO rebase onto origin/main; no PR.

## Context

The user received a 130-task Awwwards SOTY-readiness roadmap (9 sections) for their portfolio at https://ilies-bel.dev (Astro 6 + React 19 + Three.js 0.180, static GitHub Pages behind Cloudflare, pnpm/Node 22). The goal: implement every code-implementable improvement, sequenced by dependency, and scaffold everything that is blocked on user-supplied evidence so it degrades honestly today and accepts real proof later.

Exploration confirmed the roadmap's findings against the codebase, plus a few new ones. Highest-severity confirmed defects:

- **No-JS trap**: `.scene-loader` (`src/pages/index.astro:46-51`) is a plain div whose opaque cover only lifts via `body.scene-ready`, added by JS (`index.astro:148-154`). Without JS the noscript manifesto is painted underneath a permanent dark cover; the 1800svh track (6 × `300svh` stages, `src/styles/scene.css:200`) still renders.
- **11 simultaneous WebGL contexts** possible on `/behind-the-build` (1 `ArticleScene` + 10 `SceneFigure`, each `new WebGLRenderer`; `SceneFigure.tsx:76-80` disposes only on unmount, never scroll-away). No context manager exists.
- **Full hero engine as wallpaper** on `/about` (`about.astro:765`) and `/projects` (`projects.astro:908`) via `<BlackHole client:only backdrop>`.
- **Protocol-relative favicons**: `BaseHead.astro:89-100` emits `//favicon.svg` (missing the slash-collapse other call sites use).
- **4.07MB `public/inspirations/voyager-golden-record.jpg`**, no srcset/dimensions anywhere (zero `astro:assets` usage); graveyard PNGs 679/509KB.
- **StarMarker layout thrash**: rAF tick writes styles then reads `getBoundingClientRect` every frame (`StarMarker.tsx:338-351, 371, 402, 472`); no ResizeObserver.
- **Hydration seam**: engine import is correctly gated synchronously, but the rendered subtree branch (`HeroIsland.tsx:700-716`) is driven by React state seeded `reduced=false` on the server → mismatch for OS-reduced-motion visitors (the reported React #418). `matchMedia('(prefers-reduced-motion)')` is duplicated in 6 places.
- **Broken E2E**: `playwright.config.ts` points at a nonexistent `e2e/` dir with stale baseURL `http://localhost:4321/personal-blog/`. CI (`.github/workflows/deploy.yml`) is tag-triggered deploy only — nothing runs on push.
- **No 404, no Contact route**; nav is Projects/Writing/About only. `/dev-blueprint` ships an empty prod shell and lands in the sitemap (no filter).
- **Hardcoded counts/claims**: `FinaleLedger.tsx:32-41` ('2 shipped', '2 dead'), "nine shaders" prose literals, hand-entered performance-budget table (`behind-the-build.astro:184-221`); projects are hardcoded JSX with unevidenced claims ("genuine adoption" `projects.astro:67`, "in use" `:88`, "most ambitious" `:249`).
- **Mobile overflow**: italic 51-char identifier in `memory-leak-search-and-destroy.mdx:84` (em has no overflow-wrap; `prose.css:121`), nowrap budget-table cells (`behind-the-build.css:131-136`).
- Nested `<main>` on /about (`BaseLayout.astro:310` + `about.astro:27`). JSON-LD limited to WebSite/BlogPosting — no Person/CreativeWork/Breadcrumb/author. No font license files. Stale `docs/DEPLOY.md`. No analytics/CSP.

**Already strong (reference patterns, don't touch)**: `probeWebGL` capability ladder (`config.ts:210-240`), context-lost/restored handlers (`createScene.ts:882-903`), immediate `revealWithoutWebgl`, per-rig `dispose()` + full listener cleanup, readiness-based loader event, manualChunks three-core/three-post split, 2-step deferred engine import.

## Decisions locked with the user

1. **Mobile cut**: yes — compress mobile hero to 7–9 viewports; desktop keeps the full 1800svh track.
2. **Evidence-blocked content**: scaffold now, degrade gracefully. No invented claims; unevidenced claims get hedged language + a flagged schema field. Deliver an "inputs needed" checklist.
3. **Workflow**: **single integration branch** — all work lands sequentially on one branch (`soty/program`, cut from the current checkout) with a commit per task/cluster; user reviews at the end. This supersedes AGENTS.md's per-task worktree rule for this program (user's explicit choice).
4. **Analytics**: none for now. Implement everything else; leave documented stubs (`docs/ANALYTICS.md` with the Cloudflare Web Analytics wiring ready to paste).

**Environment constraints**: repo has **no git remote** (single local branch `review/lusion-evidence-b-20260710124533-65548`) — CI workflows are authored and locally verified (same commands run locally), but can't be proven green on GitHub from here; nothing gets pushed. All verification is local (`pnpm build/check/test`, Playwright against `pnpm preview`).

## Key simplification discovered during review

`ScrollTracker.measure()` (`src/hero/scroll.ts:129-136`) already normalizes progress against the **measured** `scrollHeight`, not a constant. So the mobile lifecycle cut needs only a CSS custom property for stage height + a media query — the entire timeline/stage mapping compresses automatically. No timeline.ts surgery.

---

## Execution order (each phase = one or more commits on `soty/program`)

Dependencies: E2E foundation early so later phases land with tests → motion centralization before art direction → WebGL governance + image pipeline before budgets → content collections before projects/finale/case-study work. Phases 4 and 5 are independent of each other; 7 and 8 partially overlap.

### Phase 1 — Trust repair (release blockers)

1. **No-JS fix**: add a pre-paint inline script in `BaseHead.astro` head: `document.documentElement.classList.add('js')` (plus `data-motion`, see Phase 3 — one combined script). Gate `.scene-loader` and the tall track on `html.js` in `scene.css`/`index.astro`: `html:not(.js) .scene-loader { display:none }`, `html:not(.js) .scene-stage { height:auto }`. Promote the current noscript fallback (`index.astro:262-277`) into `src/components/StaticEdition.astro` rendered unconditionally: identity, manifesto beats (from shared `BEATS`), Work/Writing/About/Contact links — visible whenever the engine isn't live (no-JS, no-WebGL, backstop). This kills the duplicate-heading risk (one source, no `<noscript>` duplication) and becomes the authored no-WebGL edition for free (wire `revealWithoutWebgl` to reveal it).
2. **Favicon fix**: shared `withBase()` helper (in `src/consts.ts`) replacing the string concat in `BaseHead.astro:89-100`; adopt at the other ad-hoc `.replace(/\/+/g,'/')` sites.
3. **Remove /dev-blueprint from prod**: move to `src/dev-pages/dev-blueprint.astro`, register via `injectRoute` only when `command === 'dev'` in `astro.config.mjs`; add `sitemap({ filter: p => !p.includes('dev-blueprint') })` as belt-and-braces.
4. **Nested main**: `about.astro:27` `<main class="about-shell">` → `<div>`; audit all routes for landmark/heading outline (one `<main>`, one `<h1>`, logical h2/h3 per route).
5. **Branded 404**: new `src/pages/404.astro` — static, zero Three.js, lifecycle-flavored copy, links to all primary routes (GitHub Pages serves `404.html` with real HTTP 404).
6. **Metadata completion**: `BaseHead.astro` — Person JSON-LD site-wide (from `consts.ts`), `author`/`publisher` on BlogPosting, BreadcrumbList on inner routes, CreativeWork/SoftwareSourceCode on project entries (lands fully in Phase 6), `structuredData` prop for per-page extension.
7. **Mobile reflow fixes**: `overflow-wrap: anywhere` for `.prose em` and long-token safety in `prose.css`; wrap `.btb-budget-table` in an `overflow-x:auto` scroll container and drop nowrap where possible (`behind-the-build.css:105,131-136`).
8. **Link/asset checker**: `scripts/check-links.mjs` — crawl `dist/` for broken internal hrefs/srcs (plain Node, no new deps).
9. **Doc repair**: refresh stale `docs/DEPLOY.md` (`/personal-blog` references).

Verification: `pnpm build && pnpm check && pnpm test`; Playwright manual probe with `javaScriptEnabled:false` (screenshot shows static edition, no dark cover); `node scripts/check-links.mjs dist`.

### Phase 2 — Test & CI foundation

1. Create `e2e/` (config already points there); fix `playwright.config.ts` baseURL → `http://localhost:4321/`, webServer runs `pnpm preview` against a prod build; projects for chromium/firefox/webkit + `Mobile Safari`/`Pixel 7` device profiles.
2. Seed suites: `e2e/smoke.spec.ts` (every route: 200, one h1, one main, zero console errors), `e2e/no-js.spec.ts`, `e2e/reduced-motion.spec.ts` (emulate media → poster path, assert **no `three-core` chunk requested** via `page.on('request')`), `e2e/loader.spec.ts`, `e2e/a11y.spec.ts` (`@axe-core/playwright` per route), `e2e/reflow.spec.ts` (320–430px widths, assert no horizontal document overflow).
3. New dev deps: `@axe-core/playwright`, `html-validate`.
4. `.github/workflows/ci.yml` on push/PR: install → `astro check` → unit tests → `knip` → build → `scripts/check-asset-sizes.mjs` (stub; budgets in P5/P10) → `html-validate dist` → Playwright. Keep `deploy.yml` as is.
5. Visual regression: `toHaveScreenshot` baselines for deterministic states only (static edition, 404, reduced-motion posters, inner routes); skip live WebGL frames.

Verification: full local run of the exact CI command sequence; all suites green.

### Phase 3 — Motion preference centralization (hydration-safe)

1. Extend the Phase-1 pre-paint script: `html.dataset.motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full'`.
2. New `src/lib/motion.ts`: `getMotion()` (reads the attribute), `onMotionChange(cb)` (single shared matchMedia listener that also live-updates the attribute), React `useMotion()` whose `useState` initializer reads the DOM attribute (client islands → decided at first client render → kills the #418-class mismatch at `HeroIsland.tsx:700-716`).
3. Replace all 6 duplicated matchMedia sites (`useReducedMotionPreference.ts` becomes a re-export; `about.astro:125`, `graveyard.astro:156`, `decodeHover.ts:42`, `warpTransition.ts:481`, `CustomCursor.astro:294`); `resolveReducedMotionNow` becomes a thin wrapper. CSS consumers migrate from `@media (prefers-reduced-motion)` to `html[data-motion="reduced"]` so JS and CSS can never disagree; manual override (if/when added) just sets the attribute → deterministic across SPA navigation.
4. Live OS-change response without reload: `onMotionChange` drives engine teardown/poster swap, CSS attribute, warp transitions, cursor.
5. Accessibility of decorative readouts: canvas + HUD readouts `aria-hidden`; no live-region scroll-progress announcements (throttled stage-name announcements only, polite).

Verification: extend `e2e/reduced-motion.spec.ts` — flip the media mid-session via CDP, assert attribute + engine reaction; grep gate: zero `prefers-reduced-motion` matchMedia hits outside `src/lib/motion.ts`; no hydration warnings in console during e2e.

### Phase 4 — WebGL governance & render performance

1. **Context governor**: new `src/hero/lib/glGovernor.ts` — token `acquire(priority)/release()`, `MAX_CONTEXTS = 2`, LRU eviction calling holder's `onEvict` (dispose → poster swap). Integrate at both `WebGLRenderer` construction sites (`createScene.ts:127`, `SceneFigure.tsx:52`). Pure logic, unit-tested.
2. **Behind the Build gallery → build-time captures** (decision: captures, not shared renderer — avoids refactoring 2342-line single-scene createScene; gives zero contexts on the reading path). New `scripts/capture-figures.mjs` reusing existing `shoot-*.mjs` Playwright infra: capture each of the 10 figure configurations → `src/assets/figures/` (through the Phase-5 pipeline). `SceneFigure.tsx` renders the capture by default with a "run live" affordance; activation acquires a governor token; scroll-away/eviction releases and swaps back (also fixes the dispose-only-on-unmount leak). CI staleness check: scene-source hash manifest.
3. **Inner-route ambient backdrops → posters + CSS** (decision: no mini-engine). New `src/components/AmbientBackdrop.astro`: per-route capture/poster + layered gradients + transform-only drift under `html[data-motion="full"]`. Replace `<BlackHole backdrop>` on `about.astro:765` and `projects.astro:908`. Result: **reading routes ship zero Three.js**; full engine exclusively on `/`.
4. **StarMarker thrash**: cache marker box metrics, invalidate via `ResizeObserver`; batch all reads before writes in the tick (`StarMarker.tsx:310-509`). Target: zero forced-reflow warnings in a DevTools trace.
5. Heap-growth e2e: 10 SPA route cycles, assert heap delta < 10%/15MB; assert canvases/contexts return to baseline.

Verification: e2e counts live contexts on `/behind-the-build` (≤1 on load, ≤2 after activating 3 figures); context-loss spec via `WEBGL_lose_context`; request-assertions prove reading routes fetch no three chunks.

### Phase 5 — Image & asset pipeline

1. Adopt `astro:assets`: move content rasters from `public/` to `src/assets/`; MDX images through a mapped `src/components/mdx/Img.astro` (dimensions + srcset + AVIF/WebP by default). Golden Record → imported `<Image>`, target ≤150KB (hard cap 250KB) at rendered size; graveyard PNGs likewise.
2. `scripts/optimize-public-images.mjs` (sharp) for true-public files (OG images, favicons) as prebuild.
3. CI raster gate in `scripts/check-asset-sizes.mjs`: fail >500KB, warn >250KB; duplicate/unused asset detection (hash scan + reference grep).
4. Add OFL license files for Space Grotesk / IBM Plex Mono / Instrument Serif next to `src/styles/fonts/`.
5. Review CSS inlining (`inlineStylesheets:'always'`) + font preloads; set per-route HTML/CSS delivery notes in `budgets.json`.

Verification: build output inspection (all `<img>` have width/height — asserted in e2e against dist HTML); gate demonstrably trips on the pre-optimization Golden Record.

### Phase 6 — Content collections, evidence schema, derived counts

1. Extend `src/content.config.ts`:
   - `projects` collection: title, status, role, stack, period, summary, `claims[{statement, evidence:{type: metric|testimonial|link|screenshot|none, source?, url?, date?}}]`, `rejectedPaths[]`, `limitations[]` (≥1 required when shipped), `visibility` (public/redacted), links, media. Zod `superRefine`: any claim with `evidence.type==='none'` fails the build unless `draftEvidence: true`.
   - `graveyard` collection: title, diedOn, cause, hypothesis, warningSigns, lesson, survivingInsight, artifact — migrate the 2 inline specimens.
2. Migrate `projects.astro` hardcoded JSX → `src/content/projects/{fleet,mars}.mdx`. Unevidenced claims ("genuine adoption", "in use", "most ambitious") → hedged wording + `draftEvidence: true` until user supplies proof.
3. New `src/lib/contentStats.ts`: `getCounts()` → shipped/dead/posts/shaders (shaders via `import.meta.glob` over `src/hero/shaders/`). Consumers: `FinaleLedger.tsx` (counts passed as props from `index.astro`), `writing.astro:128`, `behind-the-build.astro:277,322`.
4. Formalize co-authorship: `authors` frontmatter field on posts (credit Lansana Diomande on the memory-leak article) → rendered byline + JSON-LD author array.

Verification: unit tests for schema refinement + contentStats; e2e asserts FinaleLedger numbers equal collection counts; fixture project with unevidenced claim fails the build.

### Phase 7 — Mobile access, IA, loader, Contact, finale

1. **IA**: `SiteNav.astro` → Work / Writing / About / Contact (keep `/projects` URL, change labels; update footer, breadcrumbs, JSON-LD). Every primary destination one interaction away on every route.
2. **Contact route**: new `src/pages/contact.astro` — direct email, availability/timezone/preferred-engagements/response-expectation from a new `AVAILABILITY` const in `src/consts.ts`, socials, `mailto:` primary action (no form on a static host). About's `#get-in-touch` summarizes + links. *(Values in AVAILABILITY need user confirmation — see inputs checklist.)*
3. **Loader honesty + skip**: reduce `LOADER_MIN_MS` floor to ≤1s; reveal coarse real progress (warmThree → createScene → scene:ready); add a visible **"Skip intro"** control inside the loader revealing StaticEdition + nav immediately; remove the nav-inert gate (`HeroIsland.tsx:116-120`) so nav is interactive from first paint. Warm-return (session-seen) reveals immediately (<300ms).
4. **First-mobile-viewport access**: labelled (text) nav in the corner overlay at ≤480px; persistent "Skip experience" control on `/` jumping past the track; keyboard-first tab order.
5. **Mobile lifecycle cut**: `.scene-stage { height: var(--stage-h, 300svh) }` + `@media (max-width: 768px) { --stage-h: 140svh }` → 8.4 viewports (in the 7–9 target), all six states preserved; ScrollTracker already measures real height so the timeline compresses automatically. Tune manifesto copy density per stage on mobile. Verify flick-scroll can't skip supernova/finale (stage-dwell check; adjust per-stage share if needed via per-stage height overrides).
6. **Finale as second decision point**: extend `FinaleLedger` into a decision surface — derived counts (Phase 6), links to Work/Writing/Graveyard, Contact CTA, Replay control (scroll-to-top with transition).

Verification: viewport-matrix e2e (320/360/375/390/412/430/768/1280/1920/2560): first-viewport labelled nav; mobile total scroll ≤9 viewports; six stage transitions observed on scripted scroll; skip works keyboard-only; contact axe-clean.

### Phase 8 — Accessibility hardening (WCAG 2.2 AA)

1. Contrast: audit `tokens.css` pairs; state-aware scrims behind text crossing bright stellar states (keyed to lifecycle stage); encode minimum-contrast pairs as a pure unit test (`test/contrast.test.mjs` parsing tokens.css).
2. 44×44px coarse-pointer targets: nav, HUD, loader/skip buttons, markers, FpsMeter.
3. `:focus-visible` treatment that survives bright and dark scenes; modal behavior (focus trap, Escape, inert background, restore) for any overlay (About panel, shader-code toggles); move focus meaningfully after SPA navigation (warpTransition hook).
4. Forced-colors / increased-contrast: `@media (forced-colors: active)` fallbacks (borders replace glow); 200–400% zoom e2e (no horizontal scroll, no clipped text); WCAG text-spacing override spec.
5. Ensure every reveal enhances rather than gates content (audit IntersectionObserver reveals on graveyard/writing for no-JS/reduced paths).

Verification: axe per state (loader up, engine live, static edition, reduced); zoom/text-spacing/forced-colors specs; contrast unit test. Manual screen-reader passes are user-blocked.

### Phase 9 — Route-specific art direction

1. Per-route physical law via `AmbientBackdrop` variants + route-scoped tokens: Work=sustained orbit, Writing=coalescing nebula (+ conventional list equivalent stays), Graveyard=cooling residue (desaturation + grain), Behind the Build=annotated engine anatomy (single anatomy diagram replacing the repeated-template gallery framing), About=return to human scale, Contact=transmission pulse. All transform/opacity-only, gated on `data-motion`, static edition included.
2. `data-route` attribute on body (BaseLayout from `Astro.url.pathname`) scoping per-route accent tokens, typography rhythm (prose stays 65–75ch, display tracking ≥ −0.04em), and one motion verb per route in transitions.
3. Typography hygiene: reserve IBM Plex Mono/HUD grammar for actual state/measurement/code; remove tiny-uppercase kickers as default scaffolding; remove decorative side-stripe callout; replace any height-animated progress with transform/mask.
4. Route transitions <700ms (clamp `warpTransition.ts` durations); contextual route endings (per-route closing section linking onward: project→contact continuation) instead of repeated card footers; Back preserves scroll position.
5. Second homepage peak: a presentation-clock keyframe crescendo at the supernova beat (scene-code only, no new assets).
6. Blind-screenshot check tooling: `scripts/shoot-routes-grayscale.mjs` producing a grayscale contact sheet for human review.

Verification: visual baselines per route re-approved; transition-duration unit test; CLS guards extended and green; grayscale contact sheet delivered.

### Phase 10 — Performance budgets & truthful telemetry

1. Committed `budgets.json`: hero graph ≤240KiB gz (target 210), pre-hero route JS ≤85KiB gz (target 65), per-route caps. Extend `scripts/check-asset-sizes.mjs` to gzip-measure dist chunks, distinguishing eager vs dynamically-imported three graph.
2. Lighthouse CI (`@lhci/cli`) in ci.yml against `astro preview` for `/`, `/projects`, `/writing`, one post, `/contact`: LCP≤2.0s lab, CLS≤0.02 lab, TBT≤200ms (INP proxy). Field CWV gates documented (needs RUM — stubbed with analytics).
3. Replace the hand-entered `BUDGETS` table with generated data: build step writes `src/data/perf-report.json` from the local Lighthouse + bundle-gate outputs with provenance ("measured on <date>, <runner>"); page renders from it. Unmeasurable claims are deleted, not hedged.
4. FPS gates: e2e rAF-counter spec at a fixed stage — gate on regression vs committed baseline (CI runner is software-rendered; absolute device FPS targets are user-blocked real-device work). Expose/verify `?tier=` override for testability. FpsMeter already truthful (p50/p95/1% lows added to its benchmark output).
5. Labelled navigation usable ≤2.5s while shaders compile (asserted in loader spec).

Verification: one deliberate budget-bust commit proves each gate trips, then revert; full local CI sequence green.

### Phase 11 — Security & release discipline (no analytics)

1. **Headers**: exact Cloudflare Response Header Transform rule values generated by `scripts/gen-csp-hashes.mjs` (CSP with sha256 hashes for the pre-paint inline scripts, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) → documented in `docs/SECURITY-HEADERS.md` for the user to paste; meta-CSP in BaseHead as defense-in-depth (documented limitations). Source maps: confirm not emitted in prod build.
2. **Analytics stub only** (user decision): `docs/ANALYTICS.md` with ready-to-wire Cloudflare Web Analytics + web-vitals RUM snippet and the privacy-note copy; nothing loaded in prod.
3. Release discipline docs + tooling: `docs/RUNBOOK.md` (rollback = rerun deploy workflow on previous tag; rehearsal steps), scheduled production-crawl workflow (`.github/workflows/prod-crawl.yml`: link check + header check against the live domain), freeze policy (T−14/T−7/T−3) and RC-dossier template (`docs/rc/`), archive procedure (tag + `git archive` of judged build).
4. Knip cleanup: run `pnpm knip`, resolve unused files/exports/undeclared deps; keep it green in CI.
5. Update `docs/DEPLOY.md` fully (staging recommendation: Cloudflare Pages preview — documented, user-actioned).

Verification: hash script output validates against built HTML; knip green; crawl script runs against `pnpm preview` locally.

### Phase 12 — Submission tooling (code-side of the Awwwards campaign)

1. Route-specific OG cards: `scripts/gen-og-cards.mjs` via Playwright captures (reuses shoot infra) → 1200×630 per route + per post → `public/og/`; wire per-page `ogImage`.
2. Capture tooling: `scripts/shoot-submission.mjs` — 1600×1200 main image candidates + 12 stills across lifecycle/mobile/fallback states; `scripts/record-reel.mjs` Playwright video of a scripted scroll as raw reel footage.
3. Templates in `docs/awwwards/`: 50/150-word + long narratives skeleton, Elements captions, press-kit manifest, ethical voting policy, Developer-Award evidence dossier skeleton, submission dry-run checklist. Content filled by user.

Verification: generated assets exist at correct dimensions/sizes; OG cards asserted in e2e (<300KB, present in head).

### Phase 13 — Editorial & case-study scaffolding (degrades gracefully)

1. `src/layouts/CaseStudy.astro` rendering the evidence schema: claim+evidence pairs, one-rejected-path / failure / limitation / current-status sections; sections simply absent when data absent (no placeholder boxes). Project→Contact continuation.
2. Reframe `/projects` (label "Work") around problem/role/decisive-choice/outcome/proof from collection data; replace "what I'm proud of" panels with annotated decisions/consequences where content exists.
3. Writing reorganized: type/topic/date/reading-commitment exposed per article (derived); shelves = investigations / essays / failures / build documentation; both existing articles revised for consistency (fix inspiration article's stale lifecycle-direction wording; add provenance blocks; memory-leak article gets an evidence section shell for user's real investigation artifacts).
4. Graveyard → collection-driven with hypothesis/warning-signs/cause/lesson/surviving-insight per specimen (2 today, ready for 4–6).
5. About restructure: role/proof/location/availability + Contact within first 2 mobile viewports; credits/provenance section (fonts, imagery incl. Voyager/Luminet attributions, tooling, collaborators).

Verification: build green with exactly today's content (2 projects, 2 specimens, 2 posts, no testimonials) and with fixture-rich content; e2e smoke + axe on all changed routes.

### Phase 14 — Full-matrix validation & RC

1. Full local matrix run: all e2e projects (viewports 320–2560, chromium/firefox/webkit, mobile devices, keyboard-only, touch), degraded modes (no-JS, no-WebGL, context loss, reduced motion, forced colors, slow network via CDP throttling), reflow + visual baselines re-approved.
2. Ten-cycle heap/leak gate, context-count gate, budget gates — all green in one run tied to one commit SHA.
3. Generate the RC dossier (`docs/rc/RC-1.md`): gate table with evidence links to CI artifacts/screenshots, commit SHA, sign-off checklist.
4. Final `pnpm build && pnpm check && pnpm test && pnpm knip && npx playwright test` clean run ×1 locally (the roadmap's "three consecutive clean RCs" continues on real CI once the remote exists).

---

## Inputs needed from the user (blocked tasks — delivered as `docs/INPUTS-NEEDED.md`)

| # | Input | Unblocks |
|---|---|---|
| 1 | Git remote / GitHub access | CI proven green, staging, prod crawl, deploys |
| 2 | Fleet adoption metrics + maintenance status/issues/PRs | De-hedging Fleet claims, case-study evidence |
| 3 | Mars publication permission + real task graph/failure/outcome (sanitized) | Mars redacted case study |
| 4 | Third public flagship project + artifacts (sketches, commits, profiler captures) | Three-flagship requirement |
| 5 | 2–3 testimonials with publication permission | Evidence sections |
| 6 | Location, timezone, availability, preferred engagements, response expectation | `AVAILABILITY` const real values (scaffolded with safe defaults) |
| 7 | Graveyard specimens 3–6 + 3–5 planned articles + approved master biography | Editorial depth |
| 8 | Real-device testing (iPhone/Pixel/low-tier Android, thermal), screen-reader sessions, usability sessions, proxy jury | Validation sign-offs |
| 9 | Cloudflare dashboard actions (header rules, optional analytics, Pages previews) | Security headers live |
| 10 | Awwwards account, category/tags choices, submission window, fees | Section 9 campaign |

## Verification (end-to-end)

- Every phase ends with: `pnpm build && pnpm check && pnpm test && pnpm knip` + the Playwright suites added so far, run against `pnpm preview` (prod build).
- Degraded-mode proofs are automated: no-JS (javaScriptEnabled:false), no-WebGL (stub `getContext`), reduced motion (emulateMedia + request assertions), context loss (`WEBGL_lose_context`), zoom/text-spacing/forced-colors.
- Budgets/gates are proven by a deliberate bust commit each, then reverted.
- Screenshot evidence: existing `scripts/shoot-*.mjs` + new grayscale/submission capture scripts produce human-reviewable contact sheets at phase boundaries.
- Final state: one commit SHA on `soty/program` with the RC dossier; user reviews and decides on merge/push (nothing is merged or pushed autonomously).
