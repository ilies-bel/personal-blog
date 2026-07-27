# Performance testing

This document covers the full performance-testing setup for the WebGL hero
engine: what is measured, how each harness works, the smoothness floors, and
how to extend the matrix.

## Overview

Two complementary harnesses give different coverage:

| harness | GPU | CPU throttle | purpose |
|---|---|---|---|
| **host bench** | real (M1 Max, GPU rasteriser) | CDP software throttle | measures JS/CPU cost; GPU is best-case |
| **docker bench** | SwiftShader (software rasteriser) | CDP software throttle | worst-case fill-rate proxy; catches GPU-bound regressions |
| **LHCI** | real | none | Lighthouse CWV: LCP, TBT, CLS |
| **bundle budgets** | n/a | n/a | JS/CSS byte caps (`scripts/check-bundle-budgets.mjs`) |

Run all four before shipping a hero change.

---

## Host bench — `pnpm bench`

```sh
pnpm bench
# or
node bench/run-bench.mjs
```

Playwright Chromium drives `dist/` over a local static server. Per device ×
scenario it measures:

| metric | how |
|---|---|
| boot ms | navigation start → `body.scene-ready` |
| hold FPS | rAF-counted FPS over an 8 s stationary hold |
| scroll FPS | rAF-counted FPS during a 10 s top→bottom sweep |
| frame-time p95 ms | 95th-percentile frame duration (most frames faster) |
| worst-hitch ms | single longest frame (= 1000 / worstInstantFps) |
| long-task ms | `PerformanceObserver('longtask')` total during boot |
| heap MB | `performance.memory.usedJSHeapSize` (Chromium only) |
| heroMode | `'live'` (WebGL scene) or `'poster'` (reduced-motion / software-GL fallback) |

Output: `evidence/performance/bench-<device>-<scenario>.json` per run, plus
`evidence/performance/bench-summary.json`.

**Caveat:** CDP throttling simulates a slow *CPU* — the GPU is still the host's.
Host numbers are optimistic for fill-rate-bound low-end devices.

---

## Docker bench — `pnpm bench:docker`

```sh
pnpm bench:docker
```

Builds `bench/Dockerfile` (pinned `mcr.microsoft.com/playwright` image) and
runs the same harness with SwiftShader (`--use-gl=angle --use-angle=swiftshader`).
SwiftShader rasterises entirely on the CPU — a realistic worst-case GPU.

Output: `evidence/performance/bench-<device>-<scenario>-docker.json` per run,
plus `evidence/performance/bench-summary-docker.json` (the `BENCH_TAG=docker`
env suffix prevents clobbering host run files).

The docker bench **exposes the software-GL product fallback**: desktop and
mid-laptop devices running SwiftShader should boot `heroMode='poster'` (the
poster-slideshow fallback, not the live WebGL scene). The
`scripts/check-bench-floors.mjs` script asserts this.

---

## LHCI — `pnpm lhci`

Runs Lighthouse CI against the production preview server. Gates:

- LCP, TBT, CLS from `.lighthouserc.cjs`
- CWV gate script: `scripts/cwv-gate.mjs`

---

## Bundle budgets — `scripts/check-bundle-budgets.mjs`

Checks JS/CSS chunk sizes against the caps in `budgets.json`. Run as part of
the build pipeline.

---

## Smoothness floors

Asserted by `scripts/check-bench-floors.mjs` against a bench summary:

| check | floor | summary |
|---|---|---|
| Post routes — all devices, hold FPS | ≥ 55 fps | any |
| Home / `low-mobile` device, hold FPS | ≥ 50 fps | any |
| Home / `desktop` + `mid-laptop` (docker only) `heroMode` | `'poster'` | docker-tagged |

The docker desktop/mid-laptop poster requirement validates the software-GL
fallback: if those devices boot the live scene under SwiftShader they will
deliver < 20 fps, so the check asserts the fallback must fire.

### Why the floors gate hold FPS, not scroll FPS

Hold FPS is measured on a stationary page and is stable run-to-run. Scroll FPS
is not: the sweep competes with whatever else the host is doing, and on a
software rasteriser that contention dominates. Two back-to-back docker runs of
the *same* commit measured:

| device | hold fps (run 1 → 2) | scroll fps (run 1 → 2) |
|---|---|---|
| desktop / home | 60.0 → 57.3 | 35.6 → 28.5 |
| mid-laptop / home | 59.5 → 58.6 | 39.9 → 24.1 |
| low-mobile / home | 60.1 → 58.9 | 52.6 → 48.4 |

Hold moved by ≤ 2.7 fps; scroll moved by up to 40%. A scroll-FPS floor would
therefore flap. Scroll FPS, `p95FrameMs`, and `worstHitchMs` are still recorded
in every run file — read them as trend indicators, and compare runs taken on an
otherwise-idle machine. Close other containers before a run you intend to
compare against a previous one.

```sh
# check against the docker summary (default):
node scripts/check-bench-floors.mjs

# check against an arbitrary summary:
node scripts/check-bench-floors.mjs --summary evidence/performance/bench-summary.json

# print help:
node scripts/check-bench-floors.mjs --help
```

---

## Device matrix

The matrix lives in `bench/devices.json`. Each entry specifies:

| field | description |
|---|---|
| `name` | identifier used in output filenames |
| `viewport` | `{ width, height }` in CSS px |
| `deviceScaleFactor` | DPR (1, 2, or 3) |
| `cpuThrottle` | CDP `Emulation.setCPUThrottlingRate` factor (1 = none) |
| `isMobile` / `hasTouch` | UA/touch emulation |
| `userAgent` | `null` = default Chromium UA |
| `query` | appended to every scenario URL (use `?tier=` / `?adapt=` to pin the engine tier) |
| `note` | human-readable purpose |

**Current matrix:**

| name | viewport | CPU throttle | notes |
|---|---|---|---|
| `desktop` | 1440 × 900 @2× | none | default tier (high) |
| `mid-laptop` | 1440 × 900 @2× | 4× | 4× CPU, default tier |
| `low-mobile` | 390 × 844 @3× | 6× | mobile UA → tier low |
| `mid-mobile-forced-high` | 390 × 844 @3× | 6× | mobile UA, `?tier=high&adapt=0` — worst-case forced high |

### Adding a device

Append an entry to `bench/devices.json`:

```json
{
  "name": "pixel-8",
  "viewport": { "width": 412, "height": 915 },
  "deviceScaleFactor": 2.6,
  "cpuThrottle": 4,
  "isMobile": true,
  "hasTouch": true,
  "userAgent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) ...",
  "query": "",
  "note": "Mid-range Android — real-world low-tier check"
}
```

---

## Software-GL fallback

Desktop and mid-laptop devices running a software rasteriser (SwiftShader,
llvmpipe, Microsoft Basic Render) are detected at boot via
`isSoftwareGl()` in `src/hero/lib/config.ts`. If no `?tier=` override is
forcing the live scene, `HeroIsland` mounts `mountReducedMotionHero()` instead
of importing the three.js engine. This:

- Adds `body.bh-poster-mode` (the bench detection marker)
- Adds `body.scene-ready` and `body.loader-gone` (identical loader-reveal flow)
- Renders the `PosterSlideshow` (scroll-driven still images, zero GPU cost)

Forced `?tier=high` (or any explicit tier) keeps the live scene for diagnostics.

---

## Known instrumentation gaps

Read the bench output with these in mind — they are measurement limitations,
not engine bugs.

1. **`heroMode` has two values but the hero has three paths.** Phone viewports
   (`< PHONE_VIEWPORT_WIDTH`) mount `MobileHeroVideo`, which fires `scene:ready`
   without adding `bh-poster-mode` — so the scroll-scrubbed video path is
   recorded as `'live'`, indistinguishable from the real WebGL scene. Any
   `low-mobile` / `mid-mobile-*` row reading `heroMode='live'` is actually the
   video path.

2. **`mid-mobile-forced-high` does not currently force the live scene.** Its
   `?tier=high&adapt=0` query is applied, but the phone-viewport gate in
   `HeroIsland` runs *before* tier resolution, so a 390 px viewport takes the
   video path regardless. To exercise forced-high WebGL, the device needs a
   viewport ≥ `PHONE_VIEWPORT_WIDTH`.

3. **Mobile boot time is video-bound, not GPU-bound.** `MobileHeroVideo`
   signals ready on the video's `canplay` event; under 6× CPU throttle that
   lands around 8.3 s on both host and docker. That number tracks video decode,
   not scene cost — the hero holds 60 fps immediately after.

---

## How to add a new performance metric

1. Add the measurement to `MEASURE_FPS` or `INIT_SCRIPT` in `bench/run-bench.mjs`.
2. Record it in the `result` object in `runOne`.
3. If it needs a floor, add a check in `scripts/check-bench-floors.mjs` and a
   corresponding test in `test/check-bench-floors.test.mjs`.
