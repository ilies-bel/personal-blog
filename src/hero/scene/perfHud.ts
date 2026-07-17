// Debug-flag PERF HUD — the live "what does the scene actually cost" overlay.
//
// Built by createScene ONLY when resolvePerfHud() is true (?perf=1 /
// sessionStorage / __bhPerf — see lib/config.ts); in normal play this module's
// code never even loads a DOM node and the frame loop pays exactly one null
// check (`perfHud?.tick(now)`). Satisfies the `Rig` contract so it joins the
// rigs disposal loop — dispose() removes the overlay node.
//
// COST DISCIPLINE (the HUD must never distort what it measures):
//   • tick(now) is called ONCE per rAF tick, at the TOP of frame() — BEFORE the
//     idle-gate early return and the low-tier frame cap — so skipped/parked
//     frames still count toward FPS. The HUD therefore shows the TRUE composite
//     rate the visitor experiences (an idle-parked scene reads ~60fps of cheap
//     ticks, a fill-bound scene reads its real 24fps), and it keeps refreshing
//     while the idle gate parks rendering.
//   • ZERO allocations per frame: inter-frame deltas land in a preallocated
//     Float64Array ring buffer; strings/sorts happen only at the ~2Hz flush.
//   • The DOM is written at ~2Hz (FLUSH_MS), never per frame — a per-frame
//     textContent write would itself cost layout/paint and pollute the numbers.
//
// GPU FRAME TIME (EXT_disjoint_timer_query_webgl2): deliberately NOT wired.
// Wrapping the composer render in begin/endQuery would thread query state
// through createScene's hot path for an extension that is absent on macOS (all
// Metal-backed browsers) — the primary dev machine here. The row shows "n/a".
import type * as THREE from 'three';
import type { DeviceTier } from '../lib/config';
import type { Rig } from './types';

/** Everything the HUD reads, threaded in by createScene at build time. Getters
 *  (not copies) for the values that mutate after boot: activeTier can step down
 *  via the adaptive downgrade, and the granulation bake lands asynchronously
 *  under the loader — a snapshot at build time would silently go stale. */
export interface PerfHudDeps {
  renderer: THREE.WebGLRenderer;
  /** The boot-time device tier (the proactive detectDeviceTier decision). */
  bootTier: DeviceTier;
  /** WHY the boot tier was chosen — detectDeviceTierSource()'s provenance string
   *  ("gpu-class" / "probe 42ms" / "forced" / "no-webgl2" / "fallback"), shown in
   *  the tier row so a misclassification is diagnosable at a glance. */
  tierSource: string;
  /** LIVE tier — reads createScene's `activeTier` so the one-shot adaptive
   *  safety-net step-down (ONE rung after 1.5s under 30fps median) is visible
   *  the flush after it fires. MUST be a getter: a copied value would pin the
   *  boot tier. */
  getActiveTier: () => DeviceTier;
  /** Grain count of the disk cloud rig (tuneParticlesForDevice's decision). */
  diskParticles: number;
  /** True when the half-res particle pass is active (particleScale < 1). */
  halfResParticles: boolean;
  /** True when the GPGPU gravity sim was built (not the reduced/low no-op). */
  gravitySimActive: boolean;
  /** LIVE granulation-bake state — flips true only when the cubemap bake lands
   *  (asynchronously, under the loader), so this too must be a getter. */
  getGranBakeApplied: () => boolean;
  /** Whole-frame render submission stats. createScene arms its draw-audit
   *  accumulation (renderer.info autoReset off + one reset per composite) when
   *  the HUD is built and hands the SAME accumulator object the __bhDrawAudit
   *  hook reads — otherwise renderer.info.render would hold only the LAST
   *  composer pass's numbers (info auto-resets after every renderer.render()),
   *  making the draw-call count meaninglessly small. */
  getFrameStats: () => { calls: number; points: number; triangles: number; lines: number };
}

/** The HUD's rig surface: per-frame tick + the shared disposal contract. */
export interface PerfHudRig extends Rig {
  /** Record one rAF tick. Call at the TOP of frame(), before any early return. */
  tick: (now: number) => void;
}

/** Ring-buffer capacity: ~4s of samples at 60fps — enough history for a stable
 *  median + a meaningful p99 (1% low), short enough to react to tier changes. */
const SAMPLE_CAP = 240;
/** DOM flush cadence (~2Hz). Strings and sorts happen only here. */
const FLUSH_MS = 500;

/** Chrome-only heap probe shape (performance.memory is non-standard). */
interface PerformanceMemory {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export function buildPerfHud(deps: PerfHudDeps): PerfHudRig {
  const { renderer } = deps;

  // --- overlay node (created once; only textContent mutates afterwards) ------
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true'); // pure diagnostics — invisible to AT
  // Inline styles (not a stylesheet class): the HUD is a debug-flag overlay that
  // must never depend on — or leak into — the page's CSS bundle.
  el.style.cssText = [
    'position:fixed',
    'top:8px',
    'right:8px',
    'z-index:2147483000', // above the loader/HUD chrome; a debug overlay outranks everything
    'padding:8px 10px',
    'background:rgba(8,10,14,0.78)',
    'color:#9fd8a3',
    'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    'white-space:pre',
    'pointer-events:none', // never intercepts the scene's pointer parallax/clicks
    'border:1px solid rgba(159,216,163,0.25)',
    'border-radius:4px',
    'text-align:left',
  ].join(';');
  document.body.appendChild(el);

  // --- one-time GPU identity (queried at build, never per frame) -------------
  let gpuName = 'unknown';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpuName = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch {
    // locked-down context — keep 'unknown'; the HUD must never throw at build.
  }

  // --- preallocated frame-timing state (zero allocation on the tick path) ----
  const samples = new Float64Array(SAMPLE_CAP); // inter-frame deltas, ms (ring)
  const scratch = new Float64Array(SAMPLE_CAP); // sorted at flush, in place
  let sampleCount = 0; // filled entries (caps at SAMPLE_CAP)
  let writeIndex = 0; // next ring slot
  let prevTick = 0; // ms; 0 = no previous tick yet
  let lastFlush = 0; // ms of the last DOM write

  const flush = (now: number): void => {
    // Copy the filled window into scratch and sort ASCENDING — median/p99 are
    // order statistics. The sort + string building below allocate, but only at
    // 2Hz — the per-frame tick path above stays allocation-free by contract.
    const n = sampleCount;
    if (n === 0) return;
    scratch.set(samples.subarray(0, n));
    const window_ = scratch.subarray(0, n);
    window_.sort();
    const median = n % 2 === 0 ? (window_[n / 2 - 1] + window_[n / 2]) / 2 : window_[(n - 1) / 2];
    // "1% low" = the fps implied by the p99 (slowest-1%) frame delta.
    const p99 = window_[Math.min(n - 1, Math.floor(n * 0.99))];
    let sum = 0;
    for (let i = 0; i < n; i++) sum += window_[i];
    const meanMs = sum / n;

    // Renderer info: memory/programs read live off renderer.info (never reset);
    // the render counters come from the whole-frame accumulator (see deps doc).
    const info = renderer.info;
    const stats = deps.getFrameStats();
    const dbw = renderer.domElement.width; // drawingBuffer size == canvas backing store
    const dbh = renderer.domElement.height;

    // Chrome-only JS heap row; hidden (empty string) elsewhere.
    const memory = (performance as Performance & { memory?: PerformanceMemory }).memory;
    const heapRow = memory
      ? `heap  ${(memory.usedJSHeapSize / 1048576).toFixed(0)} / ${(memory.jsHeapSizeLimit / 1048576).toFixed(0)} MB\n`
      : '';

    el.textContent =
      `fps   ${(1000 / median).toFixed(1)}  (1% low ${(1000 / p99).toFixed(1)})\n` +
      `frame ${meanMs.toFixed(2)} ms mean\n` +
      `gpu-t n/a\n` + // EXT_disjoint_timer_query_webgl2 not wired — see header
      `draws ${stats.calls}  pts ${stats.points.toLocaleString('en-US')}\n` +
      `tris  ${stats.triangles.toLocaleString('en-US')}  lines ${stats.lines}\n` +
      `geo   ${info.memory.geometries}  tex ${info.memory.textures}  prog ${info.programs?.length ?? 0}\n` +
      `tier  ${deps.bootTier} (${deps.tierSource}) → ${deps.getActiveTier()}  dpr ${renderer.getPixelRatio().toFixed(2)}\n` +
      `buf   ${dbw}×${dbh}  grains ${deps.diskParticles.toLocaleString('en-US')}\n` +
      `half-res ${deps.halfResParticles ? 'on' : 'off'}  gran-bake ${deps.getGranBakeApplied() ? 'on' : 'off'}  grav-sim ${deps.gravitySimActive ? 'on' : 'off'}\n` +
      heapRow +
      gpuName;
    lastFlush = now;
  };

  return {
    tick(now: number): void {
      if (prevTick > 0) {
        const dt = now - prevTick;
        // Same plausibility gate as the adaptive sampler: drop background-tab
        // throttle gaps and clock weirdness so one alt-tab can't crater the p99.
        if (dt > 0 && dt < 1_000) {
          samples[writeIndex] = dt;
          writeIndex = (writeIndex + 1) % SAMPLE_CAP;
          if (sampleCount < SAMPLE_CAP) sampleCount++;
        }
      }
      prevTick = now;
      if (now - lastFlush >= FLUSH_MS) flush(now);
    },
    dispose(): void {
      el.remove();
    },
  };
}
