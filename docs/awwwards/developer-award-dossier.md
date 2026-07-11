# Developer Award dossier — criteria → evidence map

Skeleton for the Awwwards Developer Award submission. Each criterion row
links the claim to the repo artifact that PROVES it, so the dossier can be
assembled by copying evidence, not by writing prose from memory. `[OWNER]`
rows need the owner's account or an environment only they have (real devices,
the live domain).

Verify every row against the submitted build's commit SHA before filing;
regenerate generated artifacts (`gen-perf-report.mjs`, `gen-csp-hashes.mjs`)
as the release step so nothing is stale on submission day.

| Criterion (dev-award dimension) | Claim | Evidence artifact |
|---|---|---|
| Performance — payload | Reading routes ship ≤15.6 KiB gzip JS (zero three.js); hero engine graph 232.4 KiB gzip, loaded deferred; max page HTML 51.1 KiB gzip | `src/data/perf-report.json` (generated, CI-staleness-gated); `budgets.json` + `scripts/check-bundle-budgets.mjs` (hard gates) |
| Performance — runtime | CLS 0–0.001 per route (hard gate ≤0.02); FPS regression floor vs committed baseline; GPU programs compiled under the loader, not mid-scroll | `lighthouserc.cjs` + perf-report lighthouse block; `e2e/perf.spec.ts` + `e2e/perf-baseline.json`; `__bhGpuWarm` output hook (constants.ts) |
| Performance — media | Every content raster through astro:assets (AVIF/WebP, dimensions enforced); largest dist raster 156.5 KiB | `scripts/check-asset-sizes.mjs` (500KB hard/250KB warn + `<img>` dimension gate); perf-report rasters block |
| Accessibility | WCAG 2.2 AA program: contrast-tested tokens, 44px coarse-pointer targets, double-ring focus system, forced-colors, zoom & text-spacing, SPA focus handoff, axe serious/critical as CI gate | `test/contrast.test.mjs`; `e2e/targets.spec.ts`, `e2e/a11y.spec.ts`, `e2e/a11y-states.spec.ts`, `e2e/forced-colors.spec.ts`, `e2e/zoom.spec.ts`, `e2e/reflow.spec.ts` |
| Robustness / fallbacks | Authored no-JS static edition; no-WebGL reveal; reduced-motion poster edition requests zero engine chunks; WebGL context-loss recovery; loader can never wedge (skip + safety timeout) | `e2e/no-js.spec.ts`, `e2e/reduced-motion.spec.ts`, `e2e/webgl.spec.ts`, `e2e/loader.spec.ts`; `src/components/StaticEdition.astro` |
| Resource governance | Max two live WebGL contexts sitewide, priority + LRU eviction; heap stable across 10 SPA cycles | `src/hero/lib/glGovernor.ts` + `test/gl-governor.test.mjs`; context census + heap gate in `e2e/webgl.spec.ts` |
| Code quality / process | 89 unit test cases; 212+ e2e across desktop+mobile projects; knip clean (no dead exports); typecheck 0 errors; html-validate 0 errors; 15 standing CI gates | `.github/workflows/ci.yml`; `docs/roadmaps/acceptance-gates.md` (the gate ledger) |
| Content integrity | Factual claims are schema-enforced: evidence or an explicit debt flag, else the build fails; displayed counts derived from collections | `src/lib/contentSchemas.ts`; `docs/EVIDENCE-SCHEMA.md`; P6 commit body (build-failure proof) |
| Security | Full CSP with per-build sha256 inline-script hashes + CI staleness gate; defense-in-depth meta-CSP; HSTS/nosniff/Referrer-Policy/Permissions-Policy documented as edge rules; no source maps in dist | `scripts/gen-csp-hashes.mjs` (--check = CI gate 13); `docs/SECURITY-HEADERS.md` |
| SEO / semantics | One h1/one main per route; Person/WebSite/Breadcrumb/BlogPosting JSON-LD @graph; canonical + sitemap (dev routes filtered); honest 404 with noindex; route-specific OG cards, gated | `e2e/smoke.spec.ts`; `src/components/BaseHead.astro`; `scripts/check-links.mjs`; `scripts/check-og-cards.mjs` + `e2e/og.spec.ts` |
| Mobile | Compressed mobile lifecycle track; 320–430px reflow gate; 44px targets; mobile e2e project green | `e2e/reflow.spec.ts`, `e2e/mobile-access.spec.ts`; Pixel 7 project in `playwright.config.ts` |
| [OWNER] Real-device validation | Field CWV / real-device thermals / screen readers | INPUTS-NEEDED #8 — attach session notes when done |
| [OWNER] Production evidence | Live-domain header dump, uptime, prod-crawl runs | `curl -sI` dump per RUNBOOK archive step; `.github/workflows/prod-crawl.yml` once remote is live |

## Assembly checklist

1. Pin the submission commit SHA; run the full gate suite against it and save
   the output (this is the dossier's appendix).
2. Copy the table above into the submission, replacing each artifact path
   with a link (repo permalink at the pinned SHA).
3. Fill both `[OWNER]` rows or delete them — no pending-evidence rows in the
   filed dossier.
4. Attach: perf-report.json, SECURITY-HEADERS.md, the acceptance-gates ledger,
   and the e2e summary from the archived RC run (`docs/rc/`, P14).
