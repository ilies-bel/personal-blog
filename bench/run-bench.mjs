#!/usr/bin/env node
// Device-matrix performance benchmark for the WebGL hero engine.
//
// Serves the PRODUCTION build (dist/) over a local static server, then drives
// Playwright Chromium through the device matrix in bench/devices.json.
// Per device x scenario it measures:
//   - boot ms   : navigation start -> body.scene-ready (45s timeout => FAILED-TO-START)
//   - hold FPS  : rAF-counted FPS over an 8s stationary hold
//   - scroll FPS: rAF-counted FPS during a 10s scripted scroll sweep top->bottom
//   - longtask  : total long-task ms during boot (PerformanceObserver 'longtask')
//   - heap MB   : performance.memory.usedJSHeapSize, if exposed
//
// Output: evidence/performance/bench-<device>-<scenario>.json (one per run)
// plus evidence/performance/bench-summary.json and a printed table.
//
// Usage: node bench/run-bench.mjs
// Env:   BENCH_PORT (default: auto), BENCH_SKIP_BUILD=1 to trust dist/ as-is.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT_DIR = join(ROOT, 'evidence', 'performance');
const BOOT_TIMEOUT_MS = 45_000;
const HOLD_S = 8;
const SCROLL_S = 10;

// BENCH_TAG: when set (e.g. 'docker'), run files are suffixed with the tag
// (bench-desktop-home-docker.json) and the summary file is bench-summary-docker.json.
// This prevents containerised runs from clobbering host-run files.
const BENCH_TAG = process.env.BENCH_TAG ?? '';

// BENCH_DEVICES / BENCH_SCENARIOS: comma-separated allow-lists for iterating on
// one profile without paying for the whole matrix. Unset = run everything.
// These NARROW a run, so a filtered run writes fewer files than a full one —
// never point the floors gate at a filtered summary (it would silently pass on
// the profiles that were skipped). The summary records the filter for that reason.
const parseFilter = (raw) => {
  const list = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : null;
};
const DEVICE_FILTER = parseFilter(process.env.BENCH_DEVICES);
const SCENARIO_FILTER = parseFilter(process.env.BENCH_SCENARIOS);

// --- build freshness ---------------------------------------------------------

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const p = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return newest;
}

function ensureBuild() {
  if (process.env.BENCH_SKIP_BUILD === '1' && existsSync(join(DIST, 'index.html'))) return;
  const distStamp = existsSync(join(DIST, 'index.html')) ? statSync(join(DIST, 'index.html')).mtimeMs : 0;
  const srcStamp = Math.max(newestMtime(join(ROOT, 'src')), statSync(join(ROOT, 'astro.config.mjs')).mtimeMs);
  if (distStamp > srcStamp) {
    console.log('[bench] dist/ is fresh, skipping build');
    return;
  }
  console.log('[bench] dist/ stale or missing -> running pnpm build (this may take a minute)');
  execSync('pnpm build', { cwd: ROOT, stdio: 'inherit' });
}

// --- static server -----------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.xml': 'application/xml', '.txt': 'text/plain', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.mp4': 'video/mp4',
};

function startServer() {
  const server = createServer((req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = join(DIST, path);
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file)) file = join(DIST, path.replace(/\/$/, '') + '/index.html');
      if (!existsSync(file)) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  return new Promise((resolve) => {
    const wanted = Number(process.env.BENCH_PORT ?? 0);
    server.listen(wanted, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// --- scenario discovery --------------------------------------------------------

function discoverPostRoute() {
  const postsDir = join(DIST, 'posts');
  const slug = readdirSync(postsDir, { withFileTypes: true })
    .find((d) => d.isDirectory() && existsSync(join(postsDir, d.name, 'index.html')));
  if (!slug) throw new Error('no post route found under dist/posts/');
  return `/posts/${slug.name}/`;
}

// --- in-page instrumentation ---------------------------------------------------

const INIT_SCRIPT = () => {
  const S = (window.__bench = { longTaskMs: 0, longTasks: 0, bootMs: null, heroMode: null });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) { S.longTaskMs += e.duration; S.longTasks += 1; }
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* longtask unsupported */ }
  const mark = () => {
    if (S.bootMs === null && document.body?.classList.contains('scene-ready')) {
      S.bootMs = performance.now();
      // 'bh-poster-mode' is added by mountReducedMotionHero (reduced-motion AND
      // software-GL fallback paths). Its absence means the live WebGL scene booted.
      S.heroMode = document.body.classList.contains('bh-poster-mode') ? 'poster' : 'live';
    }
  };
  // NOTE: observe `document`, not documentElement — init scripts run before the
  // document has an <html> element, so documentElement is null at this point.
  new MutationObserver(mark).observe(document, {
    subtree: true, attributes: true, attributeFilter: ['class'], childList: true,
  });
  document.addEventListener('DOMContentLoaded', mark);
};

// GPU IMPRINT — what the scene costs the GPU, as opposed to how fast it runs.
//
// createScene publishes `window.__bhDrawAudit` (DEBUG_WINDOW_KEYS.drawAudit).
// snapshot() returns the LAST COMPLETE frame's submission counters (draw calls /
// points / triangles / lines) plus the live program count and the GPU-side
// residency (geometries / textures). The FIRST call ARMS whole-frame
// accumulation — until then the hook costs nothing — so the bench calls it once
// to arm, lets a measurement window elapse, then calls it again for real
// numbers.
//
// Returns null (never throws) when the hook is absent: poster mode, the phone
// video path and the reading routes have no live renderer, and that is a
// legitimate outcome, not a failure.
const GPU_IMPRINT = () => {
  const hook = window.__bhDrawAudit;
  if (!hook || typeof hook.snapshot !== 'function') return null;
  try {
    return hook.snapshot();
  } catch {
    return null;
  }
};

// WARM STATE — which of the boot bakes actually landed.
//
// createScene publishes `window.__bhGpuWarm` (DEBUG_WINDOW_KEYS.gpuWarm) with a
// per-bake completion flag plus the program count before/after the warm chain.
// A bake that silently failed (or never got scheduled) leaves the shader on its
// analytic fallback — same picture, far more per-vertex/per-pixel work — which
// looks like an unexplained frame-time regression unless you can see the flags.
// Cloned through JSON so Playwright can serialise it; null when absent.
const WARM_STATE = () => {
  const w = window.__bhGpuWarm;
  if (!w) return null;
  try {
    return JSON.parse(JSON.stringify(w));
  } catch {
    return null;
  }
};

const MEASURE_FPS = ({ seconds, scroll }) => new Promise((resolve) => {
  const total = document.documentElement.scrollHeight - window.innerHeight;
  const t0 = performance.now();
  let frames = 0;
  const deltas = []; // per-frame deltas (ms), excluding the first frame
  let last = t0;
  const frame = (now) => {
    frames += 1;
    const dt = now - last;
    last = now;
    if (frames > 1 && dt > 0) deltas.push(dt);
    const elapsed = now - t0;
    if (scroll) window.scrollTo(0, Math.min(1, elapsed / (seconds * 1000)) * total);
    if (elapsed >= seconds * 1000) {
      const sorted = deltas.slice().sort((a, b) => a - b);
      const n = sorted.length;
      // p95 frame time: 95% of frames are faster than this (ms).
      const p95FrameMs = n > 0 ? sorted[Math.floor(n * 0.95)] ?? null : null;
      // Worst hitch: the single longest frame (ms).
      const worstHitchMs = n > 0 ? sorted[n - 1] ?? null : null;
      // Worst instant FPS: the slowest single frame's FPS equivalent.
      const worstInstantFps = worstHitchMs !== null && worstHitchMs > 0 ? 1000 / worstHitchMs : null;
      resolve({
        fps: (frames * 1000) / elapsed,
        frames,
        worstInstantFps,
        p95FrameMs,
        worstHitchMs,
      });
    } else {
      requestAnimationFrame(frame);
    }
  };
  requestAnimationFrame(frame);
});

// --- one run ---------------------------------------------------------------------

async function runOne(browser, device, scenario, baseUrl) {
  const url = baseUrl + scenario.path + device.query;
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
    ...(device.userAgent ? { userAgent: device.userAgent } : {}),
  });
  const page = await context.newPage();
  await page.addInitScript(INIT_SCRIPT);
  const cdp = await context.newCDPSession(page);
  if (device.cpuThrottle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: device.cpuThrottle });

  const result = {
    device: device.name, scenario: scenario.name, url,
    // Diagnostic profiles force a configuration the product never ships (e.g. the
    // live scene on a software rasteriser, which really serves the poster). Their
    // numbers are recorded and tracked; the FPS floors skip them, because a floor
    // on a configuration no visitor can reach asserts nothing true.
    diagnostic: device.diagnostic === true,
    config: {
      viewport: device.viewport, deviceScaleFactor: device.deviceScaleFactor,
      cpuThrottle: device.cpuThrottle, isMobile: device.isMobile,
      userAgent: device.userAgent ?? '(chromium default)', query: device.query,
    },
    started: false,
    // 'live' = WebGL scene booted; 'poster' = reduced-motion or software-GL fallback.
    // null = page did not reach scene-ready (non-home routes or FAILED-TO-START).
    heroMode: null,
    bootMs: null, longTaskBootMs: null, longTaskBootCount: null,
    holdFps: null, holdWorstInstantFps: null, holdP95FrameMs: null, holdWorstHitchMs: null,
    scrollFps: null, scrollWorstInstantFps: null, scrollP95FrameMs: null, scrollWorstHitchMs: null,
    heapMB: null, error: null,
    // GPU imprint of the last complete frame of the stationary hold. null when
    // the route has no live renderer (poster / video / reading routes).
    gpu: null,
    // Boot-bake completion flags (window.__bhGpuWarm). null on routes with no
    // live renderer.
    warm: null,
    timestamp: new Date().toISOString(),
  };

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: BOOT_TIMEOUT_MS });
    try {
      await page.waitForFunction(() => window.__bench && window.__bench.bootMs !== null, null, { timeout: BOOT_TIMEOUT_MS });
      result.started = true;
      result.bootMs = round(await page.evaluate(() => window.__bench.bootMs));
      result.heroMode = await page.evaluate(() => window.__bench.heroMode);
    } catch {
      // body.scene-ready is HOME-only (added by index.astro's loader). Other
      // routes still run WebGL canvases but never add the marker — treat a
      // fully-loaded page without the marker as started (bootMs n/a), and only
      // a page that never finished loading as FAILED-TO-START.
      const loaded = await page.evaluate(() => document.readyState === 'complete');
      if (loaded && scenario.name !== 'home') {
        result.started = true;
        result.note = 'no scene-ready marker on this route (home-only); bootMs n/a, FPS measured after load';
      } else {
        result.started = false;
        result.error = `FAILED-TO-START: body.scene-ready not observed within ${BOOT_TIMEOUT_MS / 1000}s`;
      }
    }
    result.canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
    const boot = await page.evaluate(() => ({ ms: window.__bench.longTaskMs, n: window.__bench.longTasks }));
    result.longTaskBootMs = round(boot.ms);
    result.longTaskBootCount = boot.n;

    if (result.started) {
      // Arm whole-frame draw accumulation BEFORE the hold, so the snapshot taken
      // after it reflects a full composited frame rather than a single pass.
      await page.evaluate(GPU_IMPRINT);
      const hold = await page.evaluate(MEASURE_FPS, { seconds: HOLD_S, scroll: false });
      result.gpu = await page.evaluate(GPU_IMPRINT);
      result.warm = await page.evaluate(WARM_STATE);
      result.holdFps = round(hold.fps);
      result.holdWorstInstantFps = round(hold.worstInstantFps);
      result.holdP95FrameMs = round(hold.p95FrameMs);
      result.holdWorstHitchMs = round(hold.worstHitchMs);
      const sweep = await page.evaluate(MEASURE_FPS, { seconds: SCROLL_S, scroll: true });
      result.scrollFps = round(sweep.fps);
      result.scrollWorstInstantFps = round(sweep.worstInstantFps);
      result.scrollP95FrameMs = round(sweep.p95FrameMs);
      result.scrollWorstHitchMs = round(sweep.worstHitchMs);
      result.heapMB = round(await page.evaluate(
        () => performance.memory ? performance.memory.usedJSHeapSize / (1024 * 1024) : null,
      ));
    }
  } catch (e) {
    result.error = result.error ?? `CRASH: ${e.message}`;
  } finally {
    await context.close();
  }
  return result;
}

const round = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

// --- main -----------------------------------------------------------------------

async function main() {
  ensureBuild();
  mkdirSync(OUT_DIR, { recursive: true });
  const allDevices = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'devices.json'), 'utf8')).devices;
  const devices = DEVICE_FILTER ? allDevices.filter((d) => DEVICE_FILTER.includes(d.name)) : allDevices;
  if (devices.length === 0) {
    throw new Error(`BENCH_DEVICES matched no device. Known: ${allDevices.map((d) => d.name).join(', ')}`);
  }
  if (DEVICE_FILTER) console.log(`[bench] device filter: ${devices.map((d) => d.name).join(', ')}`);
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[bench] serving dist/ at ${baseUrl}`);

  const allScenarios = [
    { name: 'home', path: '/' },
    { name: 'post', path: discoverPostRoute() },
  ];
  const scenarios = SCENARIO_FILTER ? allScenarios.filter((s) => SCENARIO_FILTER.includes(s.name)) : allScenarios;
  if (scenarios.length === 0) {
    throw new Error(`BENCH_SCENARIOS matched no scenario. Known: ${allScenarios.map((s) => s.name).join(', ')}`);
  }
  console.log(`[bench] scenarios: ${scenarios.map((s) => s.path).join(', ')}`);

  const extraArgs = (process.env.BENCH_CHROMIUM_FLAGS ?? '').split(' ').filter(Boolean);
  // Headed by default on the host: headless Chromium falls back to a software /
  // stalled GL path on macOS (measured ~3x slower than headed on the same scene).
  // Docker (no display) sets BENCH_HEADLESS=1 and uses SwiftShader explicitly.
  const headless = process.env.BENCH_HEADLESS === '1';
  const browser = await chromium.launch({ args: extraArgs, headless });
  const gpu = spawnSync('sysctl', ['-n', 'machdep.cpu.brand_string'], { encoding: 'utf8' }).stdout?.trim() || null;

  const results = [];
  for (const device of devices) {
    for (const scenario of scenarios) {
      process.stdout.write(`[bench] ${device.name} x ${scenario.name} ... `);
      const r = await runOne(browser, device, scenario, baseUrl);
      results.push(r);
      const suffix = BENCH_TAG ? `-${BENCH_TAG}` : '';
      const file = join(OUT_DIR, `bench-${device.name}-${scenario.name}${suffix}.json`);
      writeFileSync(file, JSON.stringify(r, null, 2) + '\n');
      console.log(r.started ? `boot ${r.bootMs}ms, hold ${r.holdFps}fps, scroll ${r.scrollFps}fps` : (r.error ?? 'failed'));
    }
  }

  await browser.close();
  server.close();

  const summary = {
    host: { platform: process.platform, cpu: gpu, node: process.version, chromiumFlags: extraArgs },
    tag: BENCH_TAG || null,
    // Records whether this run covered the whole matrix. A filtered summary is
    // for iteration only — check-bench-floors.mjs refuses to gate on one.
    filtered: Boolean(DEVICE_FILTER || SCENARIO_FILTER),
    deviceFilter: DEVICE_FILTER, scenarioFilter: SCENARIO_FILTER,
    holdSeconds: HOLD_S, scrollSeconds: SCROLL_S, bootTimeoutMs: BOOT_TIMEOUT_MS,
    timestamp: new Date().toISOString(),
    results,
  };
  const summarySuffix = BENCH_TAG ? `-${BENCH_TAG}` : '';
  writeFileSync(join(OUT_DIR, `bench-summary${summarySuffix}.json`), JSON.stringify(summary, null, 2) + '\n');

  const header = [
    'device', 'scenario', 'mode', 'boot ms', 'hold fps', 'scroll fps', 'longtask ms',
    'heap MB', 'draws', 'points', 'tris', 'progs', 'tex',
  ];
  const rows = results.map((r) => [
    r.device, r.scenario,
    r.started ? (r.heroMode ?? '-') : 'NO', r.bootMs ?? '-', r.holdFps ?? '-',
    r.scrollFps ?? '-', r.longTaskBootMs ?? '-', r.heapMB ?? '-',
    r.gpu?.calls ?? '-', r.gpu?.points ?? '-', r.gpu?.triangles ?? '-',
    r.gpu?.programs ?? '-', r.gpu?.textures ?? '-',
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => String(row[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  console.log('\n' + line(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) console.log(line(row));
  const summaryName = `bench-summary${summarySuffix}.json`;
  console.log(`\n[bench] wrote ${results.length} run files + ${summaryName} to evidence/performance/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
