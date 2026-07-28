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
| **4GB bench** | SwiftShader | CDP + 2-CPU cgroup | constrained-hardware bar; adds a 4 GB memory ceiling |
| **LHCI** | real | none | Lighthouse CWV: LCP, TBT, CLS |
| **bundle budgets** | n/a | n/a | JS/CSS byte caps (`scripts/check-bundle-budgets.mjs`) |

Run all of them before shipping a hero change.

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

## 4GB bench — `pnpm bench:docker:4gb`

```sh
pnpm bench:docker:4gb
```

The same image as `bench:docker`, run under a hard resource ceiling:

```
--memory=4g --memory-swap=4g --cpus=2
```

`--memory-swap` is set equal to `--memory` on purpose — that disables swap, so
4 GB is a real ceiling rather than a soft one. Output is tagged `4gb`
(`bench-summary-4gb.json`).

This is the profile the **45 fps floor** is asserted against. Note what it is
and is not: a 2-CPU SwiftShader container is a *harsher* environment than a real
4 GB laptop, because a real one has a hardware GPU and this has none. Treat it
as a worst-case bound, not as a model of any specific machine.

### Iterating on one profile

A full matrix run is 12 runs. To iterate on one:

```sh
BENCH_DEVICES=lowgpu-live-mid BENCH_SCENARIOS=home pnpm bench
```

Both are comma-separated allow-lists. A filtered run records
`"filtered": true` in its summary and `check-bench-floors.mjs` **refuses** to
gate on it — a partial run that passed would otherwise read exactly like a full
one.

To iterate without rebuilding the image (device-matrix or harness changes only —
source changes still need a rebuild), mount over the baked copies:

```sh
docker run --rm --memory=4g --memory-swap=4g --cpus=2 -e BENCH_TAG=4gb \
  -v "$PWD/bench/run-bench.mjs:/app/bench/run-bench.mjs:ro" \
  -v "$PWD/bench/devices.json:/app/bench/devices.json:ro" \
  -v "$PWD/evidence:/app/evidence" blog-bench
```

---

## GPU imprint

Frame rate says how fast the scene runs; **imprint** says what it costs. Every
run records both, from hooks the engine already published:

| field | source | meaning |
|---|---|---|
| `gpu.calls` | `renderer.info.render.calls` | draw calls in the last complete frame |
| `gpu.points` | `.points` | point primitives submitted — the particle cloud |
| `gpu.triangles` | `.triangles` | triangle primitives (mostly fullscreen quads) |
| `gpu.programs` | `renderer.info.programs.length` | live shader programs |
| `gpu.geometries` / `gpu.textures` | `renderer.info.memory` | GPU-side residency |
| `warm.*` | `window.__bhGpuWarm` | which boot bakes actually landed |

`gpu` comes from `window.__bhDrawAudit.snapshot()`. The first call **arms**
whole-frame accumulation (until then the hook costs nothing), so the bench calls
it once before the hold and again after. All fields are `null` when there is no
live renderer — poster mode, the phone video path, reading routes — which is a
legitimate outcome, not a failure.

`warm` is the one to check first when frame time regresses for no obvious
reason: a bake that silently failed leaves its shader on the analytic fallback,
which looks identical and costs far more.

### Profiling levers

Both only ever *lower* cost, and neither can raise a production cap:

- `?density=` (0.05–1) — scales the device-tuned particle count.
- `?dpr=` (0.15–2) — hard ceiling on the renderer pixel ratio. This is the
  single biggest fill lever: every fullscreen pass scales with buffer area, so
  halving the ratio quarters fragment work. Applied via `Math.min` against the
  tier's own cap.

Both persist to `sessionStorage`, so they survive reloads.

### What the measurements actually showed

Measured on the 4 GB / 2-CPU SwiftShader container at 1280×800, forcing the live
scene with `?tier=…&adapt=0`:

| lever | change | fps |
|---|---|---|
| mid, points | 1,488,409 → 206,449 (7.2×) | 1.1 → 2.3 |
| low, DPR | 0.50 → 0.15 (11× fewer fragments) | 10.1 → 16.5 |
| low, points at fixed DPR | 39,697 → 26,509 | 16.5 → 16.0 |

Three conclusions worth keeping:

1. **Neither points nor fill is the low tier's bottleneck.** With DPR at 0.15
   and the cloud thinned, it plateaus around 16 fps — a fixed ~60 ms/frame of
   per-draw and per-program overhead that no tier setting reaches.
2. **The live hero cannot reach 45 fps on a 2-CPU software rasteriser**, at any
   setting. That is not what the floor asserts; see below.
3. **The mid tier was genuinely over-provisioned.** See
   `MID_TIER_MAX_PARTICLES` in `src/hero/lib/config.ts`: the width ladder's top
   bucket starts at exactly 1280, so 1280- and 1366-wide laptops — the machines
   the mid tier exists for — inherited the full 1.2 M desktop cloud. Capping mid
   took the imprint from 1,488,409 to 538,809 points/frame (−64%) with the high
   tier untouched.

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
| **Every device × scenario, hold FPS** | **≥ 45 fps** | **4gb-tagged** |

### Diagnostic profiles are excluded from the floors

A device with `"diagnostic": true` in `bench/devices.json` is measured and
recorded but never gated. `lowgpu-live-low` and `lowgpu-live-mid` are both
diagnostic: they use `?tier=` to force the live WebGL scene onto a software
rasteriser, which is a state the product never serves — on a real software
rasteriser `isSoftwareGl()` fires and the poster mounts instead. They exist to
measure the hero's GPU imprint somewhere it can actually be observed.

This is deliberately *not* a weakened floor. Holding a forced-diagnostic
configuration to 45 fps would assert a guarantee about a state no visitor can
reach, and it would fail permanently: the live hero measures 1.8–12.7 fps there
and no tier setting changes that (see "What the measurements actually showed").
The shipping profiles all clear the bar with margin:

| device | actual path | hold fps |
|---|---|---|
| desktop / home | poster | 55.8 |
| mid-laptop / home | poster | 53.8 |
| low-mobile / home | phone video | 58.1 |
| mid-mobile-forced-high / home | phone video | 57.9 |
| all post routes | — | 59.2–60.2 |

(The two mobile rows *report* `heroMode: 'live'`; that is instrumentation gap 1
below, not the live WebGL scene.)

The reason those pass is the software-GL fallback doing its job, not the WebGL
engine getting faster on a CPU rasteriser.

The docker desktop/mid-laptop poster requirement validates the software-GL
fallback: if those devices boot the live scene under SwiftShader they will
deliver < 20 fps, so the check asserts the fallback must fire.

### Throttled scroll-FPS gate — advisory in CI

`e2e/hero-adaptive.spec.ts` asserts that the hero's scroll FPS stays above
`FPS_FLOOR` (24 fps) under 4× CPU throttle on the auto-classified device tier.
This check **skips automatically when `process.env.CI` is set**.

**Why it skips in CI:** GitHub Actions runners use a software rasteriser
(ANGLE + SwiftShader on ubuntu-latest), but the WebGL debug renderer-info
extension is typically disabled in headless Chromium on these hosts. Without
the extension, the unmasked renderer string is empty, so `classifyGpuRenderer`
returns `'unknown'` and the fill-rate microprobe decides the tier. The probe
often classifies the runner as `'mid'` or `'high'` — above `'low'` — so
`createScene.ts` never stamps `html[data-soft-gl]` and the in-spec software-GL
skip guard does not fire. On that path, the measured FPS reflects rasteriser
throughput rather than the adaptive tier ladder, and runner-to-runner variance
is easily ≥ ± 6 % of the floor (observed failure: 22.5 fps vs. floor of 24).

**How to get the real signal:** run the spec locally with a hardware-accelerated
GPU. The `FPS_FLOOR` itself (24 fps — derived from the 1.44 GHz / 4× CPU
throttle tier ladder) is not changed:

```sh
npx playwright test e2e/hero-adaptive.spec.ts --project=chromium
```

Do **not** simply lower `FPS_FLOOR` below the last observed failure. That
trades a flaky gate for a gate that has silently stopped meaning anything. If
the floor turns out to be wrong for the hardware you care about, re-derive it
from several sampled local runs and document where the number came from.

---

### Why the bench floors gate hold FPS, not scroll FPS

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

# check against the 4GB summary (where the 45fps floor applies):
node scripts/check-bench-floors.mjs --summary evidence/performance/bench-summary-4gb.json

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
| `diagnostic` | `true` = measured and recorded, but exempt from the FPS floors |
| `note` | human-readable purpose |

**Current matrix:**

| name | viewport | CPU throttle | notes |
|---|---|---|---|
| `desktop` | 1440 × 900 @2× | none | default tier (high) |
| `mid-laptop` | 1440 × 900 @2× | 4× | 4× CPU, default tier |
| `low-mobile` | 390 × 844 @3× | 6× | mobile UA → tier low |
| `mid-mobile-forced-high` | 390 × 844 @3× | 6× | mobile UA, `?tier=high&adapt=0` — worst-case forced high |
| `lowgpu-live-low` | 1280 × 800 @1× | 2× | **diagnostic** — `?tier=low&adapt=0`, forces the live scene |
| `lowgpu-live-mid` | 1280 × 800 @1× | 2× | **diagnostic** — `?tier=mid&adapt=0`, forces the live scene |

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

## Staggered boot bakes and the loader warm gate

The engine bakes four things at boot — the granulation cubemap, the blast
cubemap, the low-tier sun cubemap, and the GPGPU collapse flipbook. Each holds
the main thread for hundreds of ms on a real GPU. They run one per
`requestAnimationFrame` tick in `scheduleGpuWarm` (`createScene.ts`), so no
single tick blocks for the whole chain.

**Where they run changed.** They used to be deferred until *after* the loader
revealed, because starting them at first paint starved the reveal timer and
turned the honest ≤900 ms floor into a ~2.5 s hold. That traded a slow reveal
for a scene that hitched on the visitor's first scroll — the worse of the two.

Now the loader is told about them and decides:

- `scene:warm-pending` — dispatched by `createScene` before first paint, when
  it has bakes to run.
- `scene:warm-done` — dispatched when the chain settles. Fires **exactly once**
  on success, on bake failure, and on disposal mid-chain.

The loader's release predicate gains a fourth fact:

```
scenePainted && (intentQualified || (floorElapsed && warmSettled))
```

Three independent releases keep it from ever stranding the reveal:

1. the engine settles it,
2. `LOADER_WARM_MAX_MS` (2500 ms from loader init) expires,
3. scroll intent waives it — a visitor already moving is never held,

and `index.astro`'s unconditional 8 s safety backstop still sits above all three.

Two cases deliberately do **not** arm the gate:

- **No bake rigs at all** (no WebGL2, kill-switches off) — nothing to wait for.
- **A software rasteriser** (`softwareGl`) — there the bakes cost *seconds*, not
  hundreds of ms, so holding the reveal would turn a slow boot into an
  apparently-hung page. Those machines warm immediately and lean on the 8 s
  backstop, exactly as before. (A rasteriser weak enough to be *recognised* is
  usually caught one step earlier: `isSoftwareGl()` makes `HeroIsland` mount the
  poster and `createScene` never runs. Headless Chromium on macOS goes down that
  path — verified — so it never arms the gate either.)

The gate also defaults to *settled* and is only ever armed by a live scene that
announces pending bakes. That default is what keeps every no-engine path — the
reading routes, and the loader e2e specs that drive a held engine with a
synthetic `scene:ready` — behaving exactly as it did before the gate existed.

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
   viewport ≥ `PHONE_VIEWPORT_WIDTH` — which is what the `lowgpu-live-*`
   diagnostic profiles (1280 px wide) were added for. The mobile entry is kept
   because it still covers the 3× DPR / 6× CPU video path, but do not read it as
   a forced-high WebGL measurement.

3. **Mobile boot time is video-bound, not GPU-bound.** `MobileHeroVideo`
   signals ready on the video's `canplay` event; under 6× CPU throttle that
   lands around 8.3 s on both host and docker. That number tracks video decode,
   not scene cost — the hero holds 60 fps immediately after.

4. **The floors gate hold FPS, so the scroll path is unguarded.** On the 4 GB
   profile the *poster* home route — no WebGL at all — measures 21.7–23 fps
   scroll against 53.8–55.8 fps hold. That cost is the page's scroll work
   (cursor trail, scroll-driven CSS, slideshow, HUD), not the hero engine, and
   nothing currently asserts a bound on it. Scroll FPS is too variable run-to-run
   to gate directly (see above), so closing this needs a steadier metric rather
   than simply adding a scroll floor.

---

## How to add a new performance metric

1. Add the measurement to `MEASURE_FPS` or `INIT_SCRIPT` in `bench/run-bench.mjs`.
2. Record it in the `result` object in `runOne`.
3. If it needs a floor, add a check in `scripts/check-bench-floors.mjs` and a
   corresponding test in `test/check-bench-floors.test.mjs`.
