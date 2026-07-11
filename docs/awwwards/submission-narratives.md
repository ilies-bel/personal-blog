# Submission narratives — skeletons

Fill-in templates for the Awwwards submission copy. The technical claims below
are pre-filled from the repo's own generated evidence (`src/data/perf-report.json`,
`docs/roadmaps/acceptance-gates.md`) — every number is reproducible with the
listed command, so nothing in the submission can drift from what actually
ships. `[OWNER: …]` slots are voice/positioning decisions only the owner can
make (tracked as input #10 in `docs/INPUTS-NEEDED.md`).

Regenerate the numbers before submitting: `pnpm build && node
scripts/gen-perf-report.mjs` (the CI staleness gate keeps the committed copy
within ±5% of dist).

---

## 50-word blurb (feed/description field)

> A portfolio that plays the stellar lifecycle in reverse: scroll rewinds a
> black hole back to a pale blue dot. One WebGL engine, nine documented
> shaders, honest fallbacks for every capability, and a build that fails when
> the content lies. [OWNER: closing 8–12 words in your voice].

(Word count target ≤50 — trim the opening clause first, never the honesty
claims.)

---

## 150-word description

> [OWNER: 1 sentence — who you are and why this site exists.]
>
> The homepage is a scroll-scrubbed stellar lifecycle played in reverse — it
> opens on a black hole and resolves, six states later, into a lone pale blue
> dot. One three.js engine drives everything: a ~1.2M-point GPU particle
> cloud, a lensed starfield, and a post chain, in nine documented shaders you
> can read (and run live) on the Behind the Build page.
>
> The engineering is the argument: reading routes ship zero three.js
> (≤16 KiB gzip of JS), the whole site holds itself to two live WebGL
> contexts, the loader never lies (real first-frame reveal, ≤1s floor, a
> working Skip), and no-JS/no-WebGL/reduced-motion each get an authored
> edition — not an apology. Content claims are schema-enforced: an
> unevidenced boast fails the build.
>
> [OWNER: 1–2 closing sentences — what you want a juror to do next.]

---

## Long-form narrative (case study / "about this project" page)

Structure to fill; each section has its evidence pre-attached.

### 1. Concept — [OWNER: the story of the reversed lifecycle choice]

- The forward physics (dot → nebula → star → giant → supernova → black hole)
  is played backwards on scroll — opening on the spectacle, closing on the
  quiet speck. One seam (`LIFECYCLE_DIRECTION` in `src/hero/timeline.ts`)
  mirrors the whole arc.
- Each state carries one line of the manifesto; the finale ledger states real
  counts derived from the content collections at build time (2 shipped,
  2 dead today — the numbers move with the content, not the copy).
- [OWNER: why this metaphor is yours — the Voyager/Luminet inspirations are
  documented in the "Why this begins at the end" post.]

### 2. The honest-technology bullets (pre-filled, verifiable)

- **Zero three.js on reading routes.** /projects, /writing, /about, /contact
  and every post ship ≤15.6 KiB gzip JS total; their backdrops are build-time
  captures of the same engine (posters + CSS grade), not idle GL contexts.
  Verify: `node scripts/check-bundle-budgets.mjs dist` (budgets.json:
  reading routes ≤40 KiB hard, measured 15.6).
- **A 2-context WebGL governor.** Every `createScene` construction site must
  acquire a token (`src/hero/lib/glGovernor.ts`, priority + LRU eviction,
  unit-tested); the Behind the Build shader plates are stills by default and
  go live only on opt-in, under the same cap.
- **Evidence-gated content.** The projects/graveyard schemas
  (`src/lib/contentSchemas.ts`) reject factual claims without an evidence
  field or an explicit `draftEvidence` debt flag — the build fails, proven in
  the P6 commit body.
- **A WCAG 2.2 AA program, not a pass.** Contrast-tested design tokens
  (`test/contrast.test.mjs` parses tokens.css against an audited pairs
  ledger), 44px coarse-pointer targets, a sitewide double-ring focus system,
  forced-colors and zoom/text-spacing specs, axe serious/critical as a CI
  gate across the route matrix.
- **Generated performance telemetry.** The budget table on /behind-the-build
  renders `src/data/perf-report.json` — written by a script from the built
  dist (hero engine graph 232.4 KiB gzip, home pre-engine JS 93.6 KiB,
  max page HTML 51.1 KiB, largest raster 156.5 KiB), with a ±5% CI staleness
  gate so the page can never show stale numbers. Lab CLS: 0–0.001 per route
  (gate: ≤0.02 as a hard error).
- **Degraded modes are authored.** No-JS gets a static edition with the full
  manifesto and nav; no-WebGL reveals the same; reduced motion gets a poster
  edition and requests zero engine chunks (request-asserted in e2e); the
  loader shows a real Skip control wired before hydration.
- **Security discipline.** Full CSP with per-build sha256 inline-script
  hashes (generated + CI-gated), HSTS/nosniff/Referrer-Policy documented as
  paste-ready edge rules, zero source maps in dist.
- **Tested like a product.** 89 unit test cases, 212+ Playwright e2e across
  desktop + mobile projects, 15 standing CI gates (links, asset sizes, bundle
  budgets, perf staleness, CSP staleness, OG cards, html-validate, axe…).

### 3. Process & rejected paths — [OWNER]

- [OWNER: the red-giant framing story, the loader-theater removal, the
  boot/shutdown sequence you deleted — what you tried and killed. The
  graveyard page is itself the public version of this section.]

### 4. Credits & provenance

- Co-authorship is formalized: byline + JSON-LD (Lansana Diomande on the
  memory-leak investigation).
- [OWNER: tools, fonts (Space Grotesk / IBM Plex Mono / Instrument Serif —
  OFL licenses ship in the repo), imagery attributions (Voyager, Luminet).]
