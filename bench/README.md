# WebGL hero engine — device-matrix bench

Measures the production build (`dist/`) across a matrix of simulated devices
with Playwright Chromium + CDP CPU throttling.

Per device x scenario (home hero `/` + one `/posts/...` page):

| metric | how |
|---|---|
| boot ms | navigation start → `body.scene-ready` (45s timeout → `FAILED-TO-START`) |
| hold FPS | rAF-counted over an 8s stationary hold |
| scroll FPS | rAF-counted over a 10s scripted top→bottom sweep |
| long-task ms | `PerformanceObserver('longtask')` total during boot |
| heap MB | `performance.memory.usedJSHeapSize` (Chromium only) |

Output: `evidence/performance/bench-<device>-<scenario>.json` per run, plus
`evidence/performance/bench-summary.json` and a printed table. Each JSON embeds
the run's viewport / DPR / throttle / UA / URL config.

## Run on the host (real GPU)

```sh
pnpm bench          # = node bench/run-bench.mjs
```

- Rebuilds `dist/` automatically when it is stale vs `src/`; set
  `BENCH_SKIP_BUILD=1` to trust `dist/` as-is.
- `BENCH_PORT=4321` to pin the static-server port (default: any free port).
- `BENCH_CHROMIUM_FLAGS="..."` to pass extra Chromium flags.

**Caveat:** CDP throttling emulates a slow *CPU* only — the GPU is still the
host's. Host numbers are optimistic for fill-rate-bound low-end devices.

## Run in Docker (software GPU — the true low-GPU proxy)

```sh
pnpm bench:docker
```

Builds `bench/Dockerfile` (pinned `mcr.microsoft.com/playwright` image) and
runs the same script with SwiftShader (`--use-gl=angle --use-angle=swiftshader`),
so rasterization happens on the CPU — a realistic worst-case GPU. Results land
in the mounted `evidence/` directory.

## Adding a device

Append an entry to `bench/devices.json`:

```json
{
  "name": "my-device",
  "viewport": { "width": 412, "height": 915 },
  "deviceScaleFactor": 2.6,
  "cpuThrottle": 4,
  "isMobile": true,
  "hasTouch": true,
  "userAgent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) ...",
  "query": "?tier=high&adapt=0",
  "note": "why this device exists"
}
```

- `cpuThrottle` is the CDP `Emulation.setCPUThrottlingRate` factor (1 = none).
- `userAgent: null` keeps the default desktop Chromium UA.
- `query` is appended to every scenario URL (`?tier=` / `?adapt=` pin the
  engine's tier and adaptive-downgrade behavior).
