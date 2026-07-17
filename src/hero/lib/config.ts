// Scene configuration — the tuned constants for the black-hole hero, plus the
// device/runtime helpers that read the environment.
//
// Physics adapted from github.com/vlwkaos/threejs-blackhole: Keplerian orbits,
// relativistic beaming ∝ δ³, gravitational redshift, T ∝ r^-3/4 (rs = 1; the hole
// sits at the world origin). Brightness-related values are lifted above the moody
// reference still so the hero reads as clearly luminous (see exposure / bloomStr /
// disk brightness).
import { DEBUG_WINDOW_KEYS, readDebugNumber, readDebugString } from './constants';

export interface Config {
  rIn: number;
  rOut: number;
  diskThickness: number;
  diskParticles: number;
  diskDistrib: number;
  coreSize: number;
  holeFactor: number;
  ringBright: number;
  omega0: number;
  spinDir: number;
  betaScale: number;
  beamExp: number;
  doppler: number;
  lens: number;
  secScale: number;
  vertAsym: number;
  horizAsym: number;
  inclDeg: number;
  camDist: number;
  fovDeg: number;
  rotation: number;
  exposure: number;
  bloomStr: number;
  bloomRad: number;
  grain: number;
  warmth: number;
  saturation: number;
  olive: number;
  warp: number;
  starBright: number;
  starDensity: number;
  /** Render-target scale for the HEAVY soft additive particle rigs (the ~1.2M-grain
   *  disk cloud + its lensed ghost). 0.5 = render those rigs at half resolution into
   *  an offscreen HalfFloat target and additively upsample-composite them into the
   *  full-res scene BEFORE bloom (see scene/buildParticlePass.ts). 1 = the original
   *  single-pass path, byte-identical (the split is short-circuited entirely).
   *  Overridable per-visit via ?prtres= (mirrors the ?tier= pattern). */
  particleRTScale: number;
  /** Red-giant granulation CUBEMAP bake (the vertex-bound red-giant fix — see
   *  scene/buildGranBake.ts). true = bake the rigid granulation field once at boot
   *  and replace the per-vertex-per-frame cellular/warpFbm/fbm block with one
   *  texture fetch on the red giant. false = the analytic path only (today's exact
   *  shader). Overridable per-visit via ?rgbake= (mirrors the ?prtres= pattern);
   *  high tier only either way (the low tier's 28-40k grains make the vertex noise
   *  negligible, and low may lack WebGL2/float-renderability). */
  rgGranBake: boolean;
}

export const CFG: Config = {
  // --- disk ---
  rIn: 2.55,
  rOut: 18.0,
  diskThickness: 0.215,
  diskParticles: 1_200_000,
  diskDistrib: 0.78,
  coreSize: 2.06,
  holeFactor: 0.88,
  ringBright: 0.62, // brighter rim (ref: 0.44)

  // --- physics ---
  omega0: 0.5,
  spinDir: -1.0,
  betaScale: 0.53,
  beamExp: 2.7,
  doppler: 0.3, // ITEM 2: softer relativistic beam (0.40 → 0.30) so the bright LEFT lobe — which
  //   sits right over the bottom-left manifesto text — no longer crowds the copy. More negative
  //   space near the text → the opening reads as pressure + silence, not a busy warm space scene.
  lens: 1.72,
  secScale: 0.85,
  vertAsym: 1.0,
  horizAsym: 0.28, // ITEM 2: gentler L/R imbalance (0.34 → 0.28) → the left beam (over the text)
  //   calms further, spreading the light more evenly so the dark text region stays quiet/empty

  // --- camera (resting pose; the intro travels in to this) ---
  inclDeg: 5.0,
  camDist: 20.0,
  fovDeg: 30.0,
  rotation: 35.0,

  // --- render (brightened) ---
  exposure: 0.85, // ref: 0.50 → noticeably brighter
  bloomStr: 0.78, // ref: 0.56
  bloomRad: 0.45,
  grain: 0, // film grain removed from all states
  warmth: -0.05, // ITEM 2: COLD highlights at the black hole (blue-white, not warm). cfg.warmth
  //   only reaches the grade at the black-hole fallthrough — every later state overrides warmth
  //   in its own lifecycle branch — so this cools the BH highlights ONLY (no warm/cold bleed).
  saturation: 0.38,
  olive: 1.3, // cold-silver grade strength at the black hole (ITEM 2: drives the cool cast)
  warp: 0.76,
  starBright: 1.7, // ITEM 2: dropped further (3.6 -> 2.5 -> 1.7) so the lensed starfield
  //   recedes behind the hole and attention centers on the dark center rather than the
  //   busy sparkly field. The lensed starfield is hidden during nebula/dot and the star
  //   states use the sun-rig dome, so this only quiets the BH field.
  starDensity: 3.4, // thinned (5.2 -> 3.4) so the star count drops and the field becomes sparser
  particleRTScale: 0.5, // half-res particle pass for the big soft gaussian fields (the scene is
  //   GPU-fill-rate-bound on the 1.2M-sprite additive cloud; halving each axis quarters the
  //   blended fragments while the bilinear upsample + bloom keep the soft gas visually
  //   indistinguishable). ?prtres=1 forces the original full-res single pass for A/B.
  rgGranBake: true, // red-giant granulation cubemap bake (the settled red giant was VERTEX-bound
  //   at ~37fps re-evaluating the rigid cellular/warpFbm/fbm granulation per vertex per frame;
  //   the bake replaces it with one cubemap fetch of the spun direction — identical pattern,
  //   rigidly rotated). ?rgbake=0 forces the analytic per-frame path for A/B.
};

// --- device tier ------------------------------------------------------------
// A three-step ladder, detected ONCE at mount — PROACTIVELY, from what the GPU
// actually IS (renderer-string classification + a fill-rate microprobe for
// unknowns), not reactively from watching the scene stutter. The old approach
// ("boot high, downgrade after 1.5s under 30fps") meant a weak device FAILED
// FIRST and only then fell back; classification up front means it never fails.
//
//   'high' — the full hero exactly as it has always shipped (byte-identical).
//   'mid'  — the FULL look at half density: high particle buckets × MID_TIER_DENSITY
//            through the ?density= plumbing (so densityCompensation auto-fattens
//            the sprites), a slightly stronger film grain (FILM_GRAIN_AMT_MID)
//            texturing the thinner cloud, DPR capped at 1.5, and the FULL post
//            chain — bloom stays ON (it smooths the thinner cloud into gas).
//            Gravity sim + gran bake stay ON too: they are LOAD-TIME costs, not
//            per-frame ones, and the mid GPU pays per-frame, not per-boot.
//            Validated on the SwiftShader bench: density 0.5 + grain is the
//            approved middle look (smooth gas, not confetti).
//   'low'  — the reduced fallback exactly as it has always shipped (28-40k
//            grains, 0.6 DPR cap, cheap quarter-res bloom, no gravity bake).
//
// The tier is a single seam: every consumer branches on `tier === 'low'` /
// `!== 'low'` or takes a defaulted param, so high and low stay byte-identical.
export type DeviceTier = 'high' | 'mid' | 'low';

/** The mid tier's particle-density scale, fed through resolveDensityScale as the
 *  DEFAULT (an explicit ?density= still overrides it — same lever, same plumbing).
 *  0.5 halves the high bucket (1.2M → 600k on desktop) and, being < 1, forces
 *  densityCompensation on so the thinned cloud auto-fattens into gas. */
export const MID_TIER_DENSITY = 0.5;

// Memoized so the probe (which creates + tears down a throwaway WebGL context)
// runs at most once per page, no matter how many times the tier is requested.
let cachedTier: DeviceTier | undefined;

// Human-readable provenance of the cached tier ("gpu-class" / "probe 42ms" /
// "forced" / "no-webgl2" / "ssr"), for the perf HUD's classification row. Set
// alongside cachedTier in detectDeviceTier.
let cachedTierSource = 'unset';

/**
 * How the session's tier was decided — shown by the perf HUD as e.g.
 * "tier mid (gpu-class)". Calls detectDeviceTier() first so the memoized
 * detection (and its source) is always populated.
 */
export function detectDeviceTierSource(): string {
  detectDeviceTier();
  return cachedTierSource;
}

// Whether the cached tier came from an EXPLICIT human override (?tier= /
// sessionStorage / __bhTier) rather than auto-detection. Set alongside cachedTier
// in detectDeviceTier; consumed by isTierForced() so the adaptive runtime
// downgrade never overrides an explicit human choice.
let cachedTierForced = false;

/**
 * True when the session's device tier was FORCED via readTierOverride (?tier= /
 * sessionStorage / __bhTier) rather than auto-detected. Calls detectDeviceTier()
 * first so the memoized detection (and its forced-ness) is always populated.
 * The adaptive downgrade consults this: an explicit `?tier=high` pins the tier.
 */
export function isTierForced(): boolean {
  detectDeviceTier();
  return cachedTierForced;
}

/**
 * Resolve a forced tier override from any of three reload-surviving sources, in
 * priority order: the `?tier=` URL query, sessionStorage, then the __bhTier window
 * global. A bare window global is wiped by a reload (it races scene hydration), so
 * `?tier=low` / `?tier=mid` / `?tier=high` is the reliable way to test — when seen in the URL it
 * is persisted to sessionStorage so it survives subsequent same-tab reloads and
 * in-app navigations. Returns undefined when nothing valid is set (→ auto-detect).
 */
function readTierOverride(): DeviceTier | undefined {
  const valid = (value: unknown): DeviceTier | undefined =>
    value === 'high' || value === 'mid' || value === 'low' ? value : undefined;

  // 1) URL query (?tier=low) — survives reloads; mirror it into sessionStorage.
  try {
    const fromUrl = valid(new URLSearchParams(window.location.search).get('tier'));
    if (fromUrl) {
      window.sessionStorage?.setItem(DEBUG_WINDOW_KEYS.tier, fromUrl);
      return fromUrl;
    }
  } catch {
    // URL/sessionStorage access can throw in locked-down contexts — ignore.
  }

  // 2) sessionStorage (set by a prior ?tier= visit) — also survives reloads.
  try {
    const fromStore = valid(window.sessionStorage?.getItem(DEBUG_WINDOW_KEYS.tier));
    if (fromStore) return fromStore;
  } catch {
    // ignore — fall through to the window global.
  }

  // 3) window.__bhTier global (handy in the console; cleared by a full reload).
  return valid(readDebugString(DEBUG_WINDOW_KEYS.tier));
}

// --- proactive GPU classification ---------------------------------------------
// The old detection tripped 'low' on ANY weak signal and left every unknown
// desktop on 'high', relying on a REACTIVE runtime downgrade (fail first, then
// fall back). The new detection classifies the GPU UP FRONT from the unmasked
// WEBGL_debug_renderer_info string, and — only for strings the table doesn't
// know — runs a ~tens-of-ms fill-rate microprobe whose cost shape matches the
// scene's actual bottleneck (full-canvas additive transparent quads).

/** 'unknown' = the string matched no family → tie-break with the microprobe. */
export type GpuClass = DeviceTier | 'unknown';

/**
 * Classify an unmasked WebGL renderer string into a tier candidate.
 *
 * CLASSIFICATION TABLE (checked top-to-bottom; first match wins):
 *   low  — software rasterisers: SwiftShader / ANGLE "Software" / llvmpipe /
 *          Microsoft Basic Render. Bench-measured at 9-11fps even on the HIGH
 *          desktop scenario — the whole reason this rework exists.
 *   high — discrete NVIDIA: any RTX, GTX 16xx+ (Turing and newer).
 *   high — discrete AMD: Radeon RX.
 *   high — Apple Silicon: "Apple M1/M2/…" (Chrome/ANGLE Metal spells the chip)
 *          or the bare "Apple GPU" Safari privacy string. iPhones/iPads report
 *          "Apple GPU" too — the mobile clamp in detectDeviceTier caps them at
 *          'mid' (recent A-chips ARE mid-worthy), so 'high' here is desktop-only.
 *   mid  — Intel iGPU (UHD / Iris / HD Graphics): runs the scene, but the
 *          1.2M-grain additive cloud at 1.85 DPR is exactly the class the old
 *          reactive downgrade kept catching. Also any other/older Intel.
 *   mid  — older / mobile-class GeForce (GTX 10xx and below, MX) and
 *          non-RX Radeon (Vega iGPU, "AMD Radeon Graphics").
 *   mid  — recent mobile GPUs: Adreno 7xx, Mali-G7x and up.
 *   low  — older mobile GPUs: Adreno ≤6xx, other Mali, PowerVR.
 *   unknown — anything else (masked strings, exotic GPUs) → microprobe.
 *
 * Exported for unit tests (a pure string → class function).
 */
/**
 * True for software rasterisers (SwiftShader / llvmpipe / Microsoft Basic Render
 * / ANGLE "Software"). Shared by classifyGpuRenderer (they classify 'low') and
 * createScene's proactive low-tier DPR step (a KNOWN-software renderer skips the
 * 3s adaptive sampling window and boots straight at the reduced pixel ratio —
 * sampling would just measure its way to the same conclusion while the visitor
 * watches the slow version).
 */
export function isSoftwareRenderer(renderer: string): boolean {
  return /SwiftShader|llvmpipe|Software(Adapter| Renderer)?|Microsoft Basic Render/i.test(renderer);
}

export function classifyGpuRenderer(renderer: string): GpuClass {
  if (!renderer) return 'unknown';
  // Software rasterisers FIRST (SwiftShader strings also contain "ANGLE" and
  // could otherwise stray into a vendor match below).
  if (isSoftwareRenderer(renderer)) return 'low';
  // Discrete NVIDIA: RTX anything, or GTX 16xx+ (16xx is Turing without RT).
  if (/\bRTX\b|GTX 1[6-9]\d{2}/i.test(renderer)) return 'high';
  // Older / laptop NVIDIA (GTX 10xx/9xx, MX chips, plain GeForce) → mid.
  if (/GeForce|NVIDIA/i.test(renderer)) return 'mid';
  // Discrete AMD (RX line) → high; everything else Radeon/AMD (Vega iGPU,
  // "AMD Radeon Graphics" APUs) → mid.
  if (/Radeon\s*(\(TM\)\s*)?RX/i.test(renderer)) return 'high';
  if (/Radeon|\bAMD\b/i.test(renderer)) return 'mid';
  // Apple: both the ANGLE Metal "Apple M2 Pro" spelling and Safari's bare
  // "Apple GPU". Mobile Apple devices are clamped to mid by the caller.
  if (/\bApple\b/i.test(renderer)) return 'high';
  // Intel iGPU family — the canonical "high on paper, 10fps in practice" class.
  if (/\bIntel\b/i.test(renderer)) return 'mid';
  // Mobile GPUs: recent Adreno 7xx / Mali-G7x+ are genuinely mid-capable;
  // anything older (Adreno ≤6xx, other Mali, PowerVR) stays low.
  if (/Adreno \(TM\) 7\d{2}|Adreno 7\d{2}\b/i.test(renderer)) return 'mid';
  if (/Mali-G7\d|Mali-G[89]\d/i.test(renderer)) return 'mid';
  if (/Adreno|Mali|PowerVR/i.test(renderer)) return 'low';
  return 'unknown';
}

// --- fill-rate microprobe -------------------------------------------------------
// Tie-breaker for renderer strings the table doesn't know. The scene's bottleneck
// is GPU FILL RATE on soft additive transparent sprites, so the probe measures
// exactly that cost shape: PROBE_QUADS full-canvas additively-blended triangles
// at PROBE_SIZE², synced per frame with gl.finish() + a 1px readPixels.
//
// DIFFERENTIAL BY DESIGN: the per-frame GPU sync itself has a FIXED cost that
// varies wildly by environment (measured ~90ms/frame under a remote-debugged
// Playwright harness on an M1 Max vs single-digit ms in a normal browser —
// entirely readback/IPC overhead, independent of draw count). So the probe
// times HEAVY frames (PROBE_QUADS quads) and LIGHT frames (PROBE_LIGHT_QUADS)
// in alternating pairs and scores the DIFFERENCE — the sync overhead cancels
// and only the marginal fill cost of the extra quads remains.
//
// THRESHOLDS, on "the fill cost of 30 full-canvas 512² additive quads"
// (≈7.9M blended fragments — roughly ONE real scene frame's fill at mid
// density), measured:
//   • Apple M1 Max: marginal fill ≈ 1-4ms per 30 quads (min-estimator ≈ 0.9ms
//     even under a 120ms-sync remote-debug harness) — well under
//     PROBE_HIGH_MAX_MS with margin for noise.
//   • SwiftShader (Docker bench image, software rasteriser): lands far past
//     PROBE_MID_MAX_MS (the 9fps desktop-high bench result made flesh) → 'low'.
//     (SwiftShader normally never reaches the probe — its renderer string
//     classifies 'low' in the table — the measurement anchors the threshold.)
//   fill ms < PROBE_HIGH_MAX_MS  → 'high'
//   fill ms < PROBE_MID_MAX_MS   → 'mid'   (a device that can't fill one
//   else                         → 'low'    mid-density frame inside a 30fps
//                                           budget can't hold the mid look)
const PROBE_SIZE = 512;
const PROBE_QUADS = 30;
const PROBE_LIGHT_QUADS = 2;
const PROBE_MAX_PAIRS = 3;
/** Total wall-clock budget. The FIRST light+heavy pair always completes (one
 *  pair is the minimum for a differential verdict); later pairs are skipped
 *  once the budget is spent. A device so slow that even the first pair blows
 *  far past the budget is, by that very fact, fill-bound → its own verdict. */
const PROBE_BUDGET_MS = 120;
const PROBE_HIGH_MAX_MS = 8;
const PROBE_MID_MAX_MS = 33;
/** sessionStorage key caching the probe verdict ("tier:ms") — the microprobe
 *  burns real GPU time, so it runs once per SESSION, not on every navigation. */
const PROBE_CACHE_KEY = 'bh:gpu-probe';

/** Result of the microprobe: the tier verdict plus the measured avg frame ms
 *  (rounded; surfaced in the perf HUD as "probe 42ms"). */
interface FillRateVerdict {
  tier: DeviceTier;
  ms: number;
}

/**
 * Run the fill-rate microprobe on an EXISTING throwaway context (the caller owns
 * creation/teardown). Times alternating LIGHT (PROBE_LIGHT_QUADS) and HEAVY
 * (PROBE_QUADS) frames — each synced with gl.finish() + a 1px readPixels (finish
 * alone is a scheduling hint on some drivers; the readback is the hard sync) —
 * and scores the DIFFERENCE, normalised to the fill cost of PROBE_QUADS quads,
 * so the environment-dependent fixed sync cost cancels (see the threshold block
 * above). Fully guarded: any GL failure returns undefined and the caller falls
 * back to a conservative 'mid'.
 */
function fillRateMicroprobe(
  gl: WebGL2RenderingContext | WebGLRenderingContext,
  canvas: HTMLCanvasElement,
): FillRateVerdict | undefined {
  try {
    canvas.width = PROBE_SIZE;
    canvas.height = PROBE_SIZE;
    gl.viewport(0, 0, PROBE_SIZE, PROBE_SIZE);

    // Minimal fullscreen-triangle program. The fragment colour depends on
    // gl_FragCoord so no driver can constant-fold the fill away; the tiny
    // per-quad output (×30, additive) never saturates to a clamp fast-path.
    const vsSrc = 'attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.0,1.0);}';
    const fsSrc =
      'precision mediump float;void main(){gl_FragColor=vec4(vec3(0.004+0.002*fract(gl_FragCoord.x*0.013+gl_FragCoord.y*0.007)),1.0);}';
    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    };
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return undefined;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return undefined;
    gl.useProgram(prog);

    // One triangle covering the whole canvas (fewer verts than a quad, same fill).
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    // The scene's cost shape: ADDITIVE transparent fill.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 1);

    const pixel = new Uint8Array(4); // 1px readback target (the hard GPU sync)
    const timedFrame = (quads: number): number => {
      const t0 = performance.now();
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (let i = 0; i < quads; i++) gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.finish();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return performance.now() - t0;
    };

    // Warm frame (shader compile / first-draw allocation must not pollute timing).
    timedFrame(PROBE_QUADS);

    // Alternating light/heavy pairs; the difference isolates the marginal fill
    // cost from the fixed per-frame sync overhead. The first pair ALWAYS
    // completes (the differential needs at least one of each); later pairs are
    // skipped once the wall-clock budget is spent.
    const start = performance.now();
    let lightMin = Infinity;
    let heavyMin = Infinity;
    for (let i = 0; i < PROBE_MAX_PAIRS; i++) {
      lightMin = Math.min(lightMin, timedFrame(PROBE_LIGHT_QUADS));
      heavyMin = Math.min(heavyMin, timedFrame(PROBE_QUADS));
      if (performance.now() - start > PROBE_BUDGET_MS) break; // budget guard
    }
    // MIN of each side, not the mean: scheduling/sync noise is strictly additive
    // (a frame is never faster than its true cost), so the minimum is the best
    // estimator of the real fill time. Marginal cost of
    // (PROBE_QUADS − PROBE_LIGHT_QUADS) quads, normalised to a full
    // PROBE_QUADS' worth. Clamped at 0 — on very fast GPUs the difference can
    // be sub-noise-negative, which simply means "free" → 'high'.
    const marginal = Math.max(0, heavyMin - lightMin);
    const fillMs = marginal * (PROBE_QUADS / (PROBE_QUADS - PROBE_LIGHT_QUADS));
    const tier: DeviceTier =
      fillMs < PROBE_HIGH_MAX_MS ? 'high' : fillMs < PROBE_MID_MAX_MS ? 'mid' : 'low';
    return { tier, ms: Math.round(fillMs) };
  } catch {
    return undefined;
  }
}

/** Order tiers can be compared/clamped in (higher index = weaker device). */
const TIER_LADDER: readonly DeviceTier[] = ['high', 'mid', 'low'];

/** The weaker (further-down-the-ladder) of two tiers — used for the mobile and
 *  cores/memory clamps, which can only ever DEMOTE a GPU-class verdict. */
function weakerTier(a: DeviceTier, b: DeviceTier): DeviceTier {
  return TIER_LADDER.indexOf(a) >= TIER_LADDER.indexOf(b) ? a : b;
}

/**
 * Step DOWN one rung of the ladder (high→mid, mid→low, low→low). Used by the
 * adaptive safety net in createScene — which, with correct upfront
 * classification, should ~never fire; when it does, it takes one measured step
 * rather than the old cliff-dive straight from high to low.
 */
export function stepDownTier(tier: DeviceTier): DeviceTier {
  return tier === 'high' ? 'mid' : 'low';
}

/**
 * Detect the device tier once and cache it. SSR-safe (returns 'high' with no
 * window). PROACTIVE by design — the ladder rung is chosen from what the GPU IS,
 * before the first real frame, so a weak device never has to fail first:
 *
 *   1. A forced override (?tier= / sessionStorage / __bhTier) is honoured FIRST
 *      so any rung can be exercised on any machine.           → source "forced"
 *   2. No WebGL2 at all → 'low' outright (the high/mid rigs assume it).
 *                                                             → source "no-webgl2"
 *   3. The unmasked renderer string is classified against the known-family
 *      table (classifyGpuRenderer).                           → source "gpu-class"
 *   4. UNKNOWN strings tie-break on the fill-rate microprobe (cached per session
 *      in sessionStorage — it burns real GPU time).           → source "probe Nms"
 *   5. Clamps that only ever DEMOTE the GPU verdict:
 *      • mobile UA/viewport → at most 'mid' (a strong mobile GPU now gets the
 *        mid look instead of the old blanket ALL-mobile→low; 'high' stays
 *        desktop-only as the safety the product decision asked for);
 *      • few cores (≤4) or low reported memory (≤4 GB) → one rung down (the CPU
 *        side of the boot/scroll pipeline drags even when the GPU is willing).
 */
export function detectDeviceTier(): DeviceTier {
  if (typeof window === 'undefined') return 'high';
  if (cachedTier !== undefined) return cachedTier;

  // 1) Override FIRST (testable on any machine): the tier can be pinned outright
  // via the ?tier= URL query, sessionStorage, or the __bhTier window global.
  const override = readTierOverride();
  if (override !== undefined) {
    cachedTier = override;
    cachedTierForced = true;
    cachedTierSource = 'forced';
    return cachedTier;
  }

  const probe = probeWebGL();

  // 2) No WebGL2 → low outright.
  if (!probe.webgl2) {
    cachedTier = 'low';
    cachedTierSource = 'no-webgl2';
    return cachedTier;
  }

  // 3) Known GPU family → its table rung. 4) Unknown → microprobe tie-breaker.
  let gpuTier: DeviceTier;
  const gpuClass = classifyGpuRenderer(probe.renderer);
  if (gpuClass !== 'unknown') {
    gpuTier = gpuClass;
    cachedTierSource = 'gpu-class';
  } else {
    const verdict = probe.microprobe;
    if (verdict) {
      gpuTier = verdict.tier;
      cachedTierSource = `probe ${verdict.ms}ms`;
    } else {
      // Probe failed/unavailable on an unknown GPU: 'mid' is the conservative
      // middle — never the old "unknown desktop → full 1.2M-grain high".
      gpuTier = 'mid';
      cachedTierSource = 'fallback';
    }
  }

  // 5) Demote-only clamps (cheap signals, defensively typed).
  const cores = navigator.hardwareConcurrency ?? 8;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory; // GB | undefined
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 760;
  let tier = gpuTier;
  // ALL mobile caps at 'mid' — never 'high' (safety: thermals, shared memory,
  // touch scrolling all punish the full 1.2M cloud even on strong mobile GPUs).
  if (isMobile) tier = weakerTier(tier, 'mid');
  // Weak CPU-side signals drag boot + the per-frame JS loop: one rung down.
  if (cores <= 4 || (mem !== undefined && mem <= 4)) tier = stepDownTier(tier);

  cachedTier = tier;
  return cachedTier;
}

/**
 * One-time WebGL capability probe on a throwaway canvas (never attached to the
 * DOM). Returns whether WebGL2 is available, the unmasked renderer string (for
 * classifyGpuRenderer), and — ONLY when the string classifies as 'unknown' —
 * the fill-rate microprobe verdict (sessionStorage-cached per session, so the
 * GPU-time cost is paid once, not on every in-app navigation). Best-effort and
 * fully guarded: any failure returns the neutral { webgl2: false, renderer: '' }
 * so a thrown probe never crashes detection (it just reads as "no WebGL2" → 'low').
 */
function probeWebGL(): { webgl2: boolean; renderer: string; microprobe?: FillRateVerdict } {
  try {
    const canvas = document.createElement('canvas'); // throwaway, never in the DOM
    const gl = canvas.getContext('webgl2'); // WebGL2RenderingContext | null
    if (!gl) {
      // Best-effort renderer read on a WebGL1 fallback context is pointless here:
      // no WebGL2 already decides 'low' regardless of the GPU family.
      return { webgl2: false, renderer: '' };
    }
    // UNMASKED_RENDERER_WEBGL is gated behind this debug extension.
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';

    // Microprobe ONLY for unknown families — the table already answers the rest.
    let microprobe: FillRateVerdict | undefined;
    if (classifyGpuRenderer(renderer) === 'unknown') {
      // Session cache first ("tier:ms") — one probe per session, not per page.
      try {
        const cached = window.sessionStorage?.getItem(PROBE_CACHE_KEY);
        if (cached) {
          const [t, ms] = cached.split(':');
          if (t === 'high' || t === 'mid' || t === 'low') {
            microprobe = { tier: t, ms: Number.parseInt(ms ?? '0', 10) || 0 };
          }
        }
      } catch {
        // storage unavailable — probe fresh below.
      }
      if (!microprobe) {
        microprobe = fillRateMicroprobe(gl, canvas);
        if (microprobe) {
          try {
            window.sessionStorage?.setItem(PROBE_CACHE_KEY, `${microprobe.tier}:${microprobe.ms}`);
          } catch {
            // storage unavailable — the per-page cachedTier memo still holds.
          }
        }
      }
    }

    // Best-effort: release the throwaway context immediately.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { webgl2: true, renderer, microprobe };
  } catch {
    return { webgl2: false, renderer: '' };
  }
}

/**
 * Resolve the particle render-target scale for this visit. Mirrors readTierOverride's
 * reload-surviving priority order: the `?prtres=` URL query (persisted to
 * sessionStorage so it survives same-tab reloads), then sessionStorage, then the
 * __bhPrtRes window global, then the CFG.particleRTScale default. The value is
 * clamped to [0.25, 1]; anything ≥ 0.999 collapses to EXACTLY 1 so the caller's
 * `scale < 1` test cleanly short-circuits the split (the kill-switch contract:
 * ?prtres=1 must reproduce the original single-pass path with zero extra work).
 */
export function resolveParticleRTScale(): number {
  if (typeof window === 'undefined') return 1;
  const sanitize = (raw: unknown): number | undefined => {
    const n = typeof raw === 'string' ? Number.parseFloat(raw) : typeof raw === 'number' ? raw : NaN;
    if (!Number.isFinite(n) || n <= 0) return undefined;
    const clamped = Math.min(1, Math.max(0.25, n));
    return clamped >= 0.999 ? 1 : clamped;
  };

  // 1) URL query (?prtres=1) — survives reloads; mirror it into sessionStorage.
  try {
    const fromUrl = sanitize(new URLSearchParams(window.location.search).get('prtres'));
    if (fromUrl !== undefined) {
      window.sessionStorage?.setItem(DEBUG_WINDOW_KEYS.prtres, String(fromUrl));
      return fromUrl;
    }
  } catch {
    // URL/sessionStorage access can throw in locked-down contexts — ignore.
  }

  // 2) sessionStorage (set by a prior ?prtres= visit) — also survives reloads.
  try {
    const fromStore = sanitize(window.sessionStorage?.getItem(DEBUG_WINDOW_KEYS.prtres));
    if (fromStore !== undefined) return fromStore;
  } catch {
    // ignore — fall through to the window global.
  }

  // 3) window.__bhPrtRes global (console-handy; cleared by a full reload).
  const fromGlobal = sanitize(readDebugNumber(DEBUG_WINDOW_KEYS.prtres));
  if (fromGlobal !== undefined) return fromGlobal;

  return sanitize(CFG.particleRTScale) ?? 1;
}

/**
 * Resolve whether the red-giant granulation cubemap bake is enabled for this visit.
 * Mirrors resolveParticleRTScale's reload-surviving priority order: the `?rgbake=`
 * URL query (persisted to sessionStorage so it survives same-tab reloads), then
 * sessionStorage, then the __bhRgBake window global (0 = off, anything else = on),
 * then the CFG.rgGranBake default. `?rgbake=0` is the A/B kill-switch: the bake rig
 * is never built, uGranBakeReady stays 0, and the disk runs the analytic per-frame
 * granulation — today's exact shader.
 */
export function resolveRgGranBake(): boolean {
  if (typeof window === 'undefined') return false;
  const sanitize = (raw: unknown): boolean | undefined => {
    if (raw === '0' || raw === 0 || raw === 'false' || raw === 'off') return false;
    if (raw === '1' || raw === 1 || raw === 'true' || raw === 'on') return true;
    return undefined;
  };

  // 1) URL query (?rgbake=0) — survives reloads; mirror it into sessionStorage.
  try {
    const fromUrl = sanitize(new URLSearchParams(window.location.search).get('rgbake'));
    if (fromUrl !== undefined) {
      window.sessionStorage?.setItem(DEBUG_WINDOW_KEYS.rgbake, fromUrl ? '1' : '0');
      return fromUrl;
    }
  } catch {
    // URL/sessionStorage access can throw in locked-down contexts — ignore.
  }

  // 2) sessionStorage (set by a prior ?rgbake= visit) — also survives reloads.
  try {
    const fromStore = sanitize(window.sessionStorage?.getItem(DEBUG_WINDOW_KEYS.rgbake));
    if (fromStore !== undefined) return fromStore;
  } catch {
    // ignore — fall through to the window global.
  }

  // 3) window.__bhRgBake global (console-handy; cleared by a full reload).
  const fromGlobal = sanitize(readDebugNumber(DEBUG_WINDOW_KEYS.rgbake));
  if (fromGlobal !== undefined) return fromGlobal;

  return CFG.rgGranBake;
}

/**
 * Resolve whether the supernova blast-field cubemap bake (scene/buildBlastBake.ts
 * — the vertex-bound collapse-flash fix) is enabled for this visit. Mirrors
 * resolveRgGranBake's reload-surviving priority order: the `?blastbake=` URL
 * query (persisted to sessionStorage so it survives same-tab reloads), then
 * sessionStorage, then the __bhBlastBake window global (0 = off, anything else
 * = on). DEFAULT ON — like resolvePhotons there is no CFG entry: the bake is a
 * shipped optimization on every WebGL2 tier. `?blastbake=0` is the A/B
 * kill-switch: the bake rig is never built, uBlastBakeReady stays 0, and the
 * disk runs the analytic per-frame blastField() — today's exact shader.
 */
export function resolveBlastBake(): boolean {
  if (typeof window === 'undefined') return false;
  const sanitize = (raw: unknown): boolean | undefined => {
    if (raw === '0' || raw === 0 || raw === 'false' || raw === 'off') return false;
    if (raw === '1' || raw === 1 || raw === 'true' || raw === 'on') return true;
    return undefined;
  };

  // 1) URL query (?blastbake=0) — survives reloads; mirror it into sessionStorage.
  try {
    const fromUrl = sanitize(new URLSearchParams(window.location.search).get('blastbake'));
    if (fromUrl !== undefined) {
      window.sessionStorage?.setItem(DEBUG_WINDOW_KEYS.blastbake, fromUrl ? '1' : '0');
      return fromUrl;
    }
  } catch {
    // URL/sessionStorage access can throw in locked-down contexts — ignore.
  }

  // 2) sessionStorage (set by a prior ?blastbake= visit) — also survives reloads.
  try {
    const fromStore = sanitize(window.sessionStorage?.getItem(DEBUG_WINDOW_KEYS.blastbake));
    if (fromStore !== undefined) return fromStore;
  } catch {
    // ignore — fall through to the window global.
  }

  // 3) window.__bhBlastBake global (console-handy; cleared by a full reload).
  const fromGlobal = sanitize(readDebugNumber(DEBUG_WINDOW_KEYS.blastbake));
  if (fromGlobal !== undefined) return fromGlobal;

  return true; // default ON — a shipped optimization, not a diagnostic
}

/**
 * Resolve whether the LOW-tier yellow-star photosphere cubemap bake
 * (scene/buildSunBake.ts — the fragment-bound sun fix) is enabled for this
 * visit. Mirrors resolveBlastBake's reload-surviving priority order: the
 * `?sunbake=` URL query (persisted to sessionStorage), then sessionStorage,
 * then the __bhSunBake window global (0 = off, anything else = on). DEFAULT ON
 * — but the bake is only ever BUILT on the low tier (createScene's tier gate);
 * high/mid keep the analytic photosphere regardless of this flag. `?sunbake=0`
 * is the low-tier A/B kill-switch: the rig is never built, uSunBakeReady stays
 * 0, and the photosphere runs the analytic per-pixel stack — today's shader.
 */
export function resolveSunBake(): boolean {
  if (typeof window === 'undefined') return false;
  const sanitize = (raw: unknown): boolean | undefined => {
    if (raw === '0' || raw === 0 || raw === 'false' || raw === 'off') return false;
    if (raw === '1' || raw === 1 || raw === 'true' || raw === 'on') return true;
    return undefined;
  };

  // 1) URL query (?sunbake=0) — survives reloads; mirror it into sessionStorage.
  try {
    const fromUrl = sanitize(new URLSearchParams(window.location.search).get('sunbake'));
    if (fromUrl !== undefined) {
      window.sessionStorage?.setItem(DEBUG_WINDOW_KEYS.sunbake, fromUrl ? '1' : '0');
      return fromUrl;
    }
  } catch {
    // URL/sessionStorage access can throw in locked-down contexts — ignore.
  }

  // 2) sessionStorage (set by a prior ?sunbake= visit) — also survives reloads.
  try {
    const fromStore = sanitize(window.sessionStorage?.getItem(DEBUG_WINDOW_KEYS.sunbake));
    if (fromStore !== undefined) return fromStore;
  } catch {
    // ignore — fall through to the window global.
  }

  // 3) window.__bhSunBake global (console-handy; cleared by a full reload).
  const fromGlobal = sanitize(readDebugNumber(DEBUG_WINDOW_KEYS.sunbake));
  if (fromGlobal !== undefined) return fromGlobal;

  return true; // default ON — a shipped optimization, not a diagnostic
}

/**
 * Resolve whether the debug PERF HUD (scene/perfHud.ts) is enabled for this visit.
 * Mirrors resolveRgGranBake's reload-surviving priority order: the `?perf=` URL
 * query (persisted to sessionStorage so it survives same-tab reloads), then
 * sessionStorage, then the __bhPerf window global (0 = off, anything else = on).
 * DEFAULT OFF — there is no CFG entry: unlike the bake/half-res levers this is a
 * pure diagnostic overlay, so nothing ships it on. When off, createScene never
 * builds the HUD and the frame loop pays exactly one null check.
 */
export function resolvePerfHud(): boolean {
  if (typeof window === 'undefined') return false;
  const sanitize = (raw: unknown): boolean | undefined => {
    if (raw === '0' || raw === 0 || raw === 'false' || raw === 'off') return false;
    if (raw === '1' || raw === 1 || raw === 'true' || raw === 'on') return true;
    return undefined;
  };

  // 1) URL query (?perf=1) — survives reloads; mirror it into sessionStorage.
  try {
    const fromUrl = sanitize(new URLSearchParams(window.location.search).get('perf'));
    if (fromUrl !== undefined) {
      window.sessionStorage?.setItem(DEBUG_WINDOW_KEYS.perf, fromUrl ? '1' : '0');
      return fromUrl;
    }
  } catch {
    // URL/sessionStorage access can throw in locked-down contexts — ignore.
  }

  // 2) sessionStorage (set by a prior ?perf= visit) — also survives reloads.
  try {
    const fromStore = sanitize(window.sessionStorage?.getItem(DEBUG_WINDOW_KEYS.perf));
    if (fromStore !== undefined) return fromStore;
  } catch {
    // ignore — fall through to the window global.
  }

  // 3) window.__bhPerf global (console-handy; cleared by a full reload).
  const fromGlobal = sanitize(readDebugNumber(DEBUG_WINDOW_KEYS.perf));
  if (fromGlobal !== undefined) return fromGlobal;

  return false; // default OFF — a diagnostic overlay never ships on
}

/**
 * Resolve whether the cursor-photon interaction rig (scene/buildPhotons.ts — the
 * "cursor emits light, the black hole absorbs it" gravity rig) is enabled for
 * this visit. Mirrors resolveRgGranBake/resolvePerfHud's reload-surviving
 * priority order: the `?photons=` URL query (persisted to sessionStorage so it
 * survives same-tab reloads), then sessionStorage, then the __bhPhotons window
 * global (0 = off, anything else = on). DEFAULT ON — the rig is a shipped
 * interaction, not a diagnostic; `?photons=0` is the A/B kill-switch (the rig is
 * never built and the frame loop pays exactly one null check).
 */
export function resolvePhotons(): boolean {
  if (typeof window === 'undefined') return false;
  const sanitize = (raw: unknown): boolean | undefined => {
    if (raw === '0' || raw === 0 || raw === 'false' || raw === 'off') return false;
    if (raw === '1' || raw === 1 || raw === 'true' || raw === 'on') return true;
    return undefined;
  };

  // 1) URL query (?photons=0) — survives reloads; mirror it into sessionStorage.
  try {
    const fromUrl = sanitize(new URLSearchParams(window.location.search).get('photons'));
    if (fromUrl !== undefined) {
      window.sessionStorage?.setItem(DEBUG_WINDOW_KEYS.photons, fromUrl ? '1' : '0');
      return fromUrl;
    }
  } catch {
    // URL/sessionStorage access can throw in locked-down contexts — ignore.
  }

  // 2) sessionStorage (set by a prior ?photons= visit) — also survives reloads.
  try {
    const fromStore = sanitize(window.sessionStorage?.getItem(DEBUG_WINDOW_KEYS.photons));
    if (fromStore !== undefined) return fromStore;
  } catch {
    // ignore — fall through to the window global.
  }

  // 3) window.__bhPhotons global (console-handy; cleared by a full reload).
  const fromGlobal = sanitize(readDebugNumber(DEBUG_WINDOW_KEYS.photons));
  if (fromGlobal !== undefined) return fromGlobal;

  return true; // default ON — the photon rig is a shipped interaction
}

/**
 * Shipped default for the grade pass's luminance-adaptive film grain (uGrainAmt).
 * Subtle at full density — the grain exists so the particle cloud can be THINNED
 * (see resolveDensityScale) without the gaps between sparse grains resolving into
 * discrete dots on black ("confetti"): signed hash noise, weighted toward the
 * dark-to-mid range, textures those gaps as gas while leaving highlights clean.
 */
export const FILM_GRAIN_AMT = 0.06;

/**
 * The MID tier's default grain strength. Bumped above FILM_GRAIN_AMT because the
 * mid cloud runs at MID_TIER_DENSITY (half the grains): the stronger grain
 * textures the wider dark gaps between sprites as gas — the user-approved
 * "density 0.5 + film grain" middle look from the SwiftShader bench validation.
 * High and low keep FILM_GRAIN_AMT exactly (byte-identical).
 */
export const FILM_GRAIN_AMT_MID = 0.1;

/**
 * Resolve the luminance-adaptive film-grain strength (uGrainAmt) for this visit.
 * Mirrors resolveParticleRTScale's reload-surviving priority order: the `?grain=`
 * URL query (a float, persisted to sessionStorage so it survives same-tab
 * reloads), then sessionStorage, then the __bhGrain window global, then
 * `defaultAmt` — FILM_GRAIN_AMT unless the caller passes the tier's own default
 * (buildPostChain passes FILM_GRAIN_AMT_MID on the mid tier). `?grain=0` is the
 * A/B kill-switch (grain term contributes exactly 0 — byte-identical pre-grain
 * look); values are clamped to [0, 0.5] so a typo can't white-noise the frame.
 */
export function resolveGrainAmt(defaultAmt: number = FILM_GRAIN_AMT): number {
  if (typeof window === 'undefined') return defaultAmt;
  const sanitize = (raw: unknown): number | undefined => {
    if (raw === null || raw === undefined || raw === '') return undefined;
    const n = typeof raw === 'string' ? Number.parseFloat(raw) : typeof raw === 'number' ? raw : NaN;
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.min(0.5, n);
  };

  // 1) URL query (?grain=0.12) — survives reloads; mirror it into sessionStorage.
  try {
    const fromUrl = sanitize(new URLSearchParams(window.location.search).get('grain'));
    if (fromUrl !== undefined) {
      window.sessionStorage?.setItem(DEBUG_WINDOW_KEYS.grain, String(fromUrl));
      return fromUrl;
    }
  } catch {
    // URL/sessionStorage access can throw in locked-down contexts — ignore.
  }

  // 2) sessionStorage (set by a prior ?grain= visit) — also survives reloads.
  try {
    const fromStore = sanitize(window.sessionStorage?.getItem(DEBUG_WINDOW_KEYS.grain));
    if (fromStore !== undefined) return fromStore;
  } catch {
    // ignore — fall through to the window global.
  }

  // 3) window.__bhGrain global (console-handy; cleared by a full reload).
  const fromGlobal = sanitize(readDebugNumber(DEBUG_WINDOW_KEYS.grain));
  if (fromGlobal !== undefined) return fromGlobal;

  return defaultAmt;
}

/**
 * Resolve the particle-density scale for this visit. Originally a DEBUG-only A/B
 * lever; now ALSO the mid tier's production seam — createScene passes
 * `defaultScale = MID_TIER_DENSITY` (0.5) on 'mid', so the mid look rides the
 * exact same plumbing the validated ?density= experiments used (and an explicit
 * ?density= in the URL still overrides the tier default, same lever). Priority
 * order mirrors resolveParticleRTScale: the `?density=` URL query (a float,
 * persisted to sessionStorage), then sessionStorage, then the __bhDensity window
 * global, then `defaultScale` (1 on high/low — byte-identical). Clamped to
 * [0.05, 1]; anything ≥ 0.999 collapses to EXACTLY 1 so the caller's `scale < 1`
 * test cleanly short-circuits. When < 1, createScene multiplies
 * tuneParticlesForDevice's result by it AND forces densityCompensation on, so
 * the thinned cloud auto-fattens exactly the way the low tier's does.
 */
export function resolveDensityScale(defaultScale = 1): number {
  if (typeof window === 'undefined') return defaultScale;
  const sanitize = (raw: unknown): number | undefined => {
    const n = typeof raw === 'string' ? Number.parseFloat(raw) : typeof raw === 'number' ? raw : NaN;
    if (!Number.isFinite(n) || n <= 0) return undefined;
    const clamped = Math.min(1, Math.max(0.05, n));
    return clamped >= 0.999 ? 1 : clamped;
  };

  // 1) URL query (?density=0.5) — survives reloads; mirror it into sessionStorage.
  try {
    const fromUrl = sanitize(new URLSearchParams(window.location.search).get('density'));
    if (fromUrl !== undefined) {
      window.sessionStorage?.setItem(DEBUG_WINDOW_KEYS.density, String(fromUrl));
      return fromUrl;
    }
  } catch {
    // URL/sessionStorage access can throw in locked-down contexts — ignore.
  }

  // 2) sessionStorage (set by a prior ?density= visit) — also survives reloads.
  try {
    const fromStore = sanitize(window.sessionStorage?.getItem(DEBUG_WINDOW_KEYS.density));
    if (fromStore !== undefined) return fromStore;
  } catch {
    // ignore — fall through to the window global.
  }

  // 3) window.__bhDensity global (console-handy; cleared by a full reload).
  const fromGlobal = sanitize(readDebugNumber(DEBUG_WINDOW_KEYS.density));
  if (fromGlobal !== undefined) return fromGlobal;

  // Tier default: 1 on high/low (full device-tuned density, byte-identical);
  // MID_TIER_DENSITY when createScene passes the mid tier's default in.
  return sanitize(defaultScale) ?? 1;
}

export function tuneRenderPixelRatio(reduced = false, tier: DeviceTier = 'high'): number {
  if (typeof window === 'undefined') return 1;
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || width < 760;
  if (reduced) return Math.min(dpr, 1.25);
  // Low tier (ALL mobile): cap at 0.6 — render WELL BELOW native resolution and let
  // the browser upscale. The additive gaussian-sprite cloud is fragment-bound, so
  // fewer fragments is the single biggest cost lever. A measured low-tier scroll
  // benchmark under CPU throttle could not hold 30fps at the old 1.0 cap; dropping to
  // 0.6 (with the smaller particle buckets below) recovered most of the headroom.
  // 0.6 still could not hold 30fps on the SwiftShader (software-GL) bench that the
  // low tier now classifies proactively — every full-screen pass scales with the
  // buffer, so 0.5 (~31% fewer fragments than 0.6) is the honest floor-keeper. The
  // luminance-adaptive film grain in the grade pass masks the extra softness.
  if (tier === 'low') return Math.min(dpr, 0.5);
  // Mid tier: cap at 1.5. Together with the halved particle bucket this is the
  // second fill-rate lever — 1.5² vs 1.85² is ~34% fewer fragments on a 2x
  // display, while text/UI (DOM, not canvas) stays native-sharp. Below the
  // high desktop cap but comfortably above the low tier's 0.6 upscale blur.
  // (Mobile-mid keeps the tighter 1.4 mobile cap — mid must never raise a cap.)
  if (tier === 'mid') return Math.min(dpr, isMobile ? 1.4 : 1.5);
  if (isMobile) return Math.min(dpr, 1.4);
  if (width < 1280) return Math.min(dpr, 1.6);
  return Math.min(dpr, 1.85);
}

// Particle count tuned down for smaller / mobile devices.
export function tuneParticlesForDevice(tier: DeviceTier = 'high'): number {
  if (typeof window === 'undefined') return CFG.diskParticles;
  const width = window.innerWidth;
  // Low tier: a hard, small cap regardless of the width ladder below (the cloud is
  // the dominant draw cost), with a tighter budget on the narrowest viewports. A
  // measured low-tier scroll benchmark under CPU throttle (4×/6×, mobile viewport)
  // showed the old 90k/140k buckets were FAR too many for a throttled mobile CPU
  // (single-digit fps, sustained sub-30 the whole sweep — the prior "pins 120 FPS"
  // claim here was simply wrong). The cloud is cut hard to 16k/24k, which together
  // with the 0.6 DPR cap above lifts the 4× scroll median back toward the low-20s fps.
  // (Cutting further — 9k/14k — gave NO additional gain: the residual cost is the
  // per-frame render loop + occasional shader/GPGPU stalls, not the grain count, so
  // 16k/24k is the floor before the cloud visibly thins for nothing.) The ratio-based
  // densityCompensation below auto-scales to the smaller count, and the cheap
  // quarter-res bloom + grain-fattening still smooth the thinned cloud into gas.
  // 16k/24k proved too thin even with the re-tuned density compensation: at ratio
  // ≈75× the red giant still resolved as discrete dots with black gaps (confetti).
  // 28k/40k closes the gaps with MORE grains rather than ever-fatter sprites — at
  // these sizes the additive fill cost is comparable (28k×3.3² ≈ 16k×4.0²) but the
  // coverage is real, and vertex count at 28-40k is negligible on any GPU.
  // The 28k/40k buckets were trimmed to a single 24k bucket (the task-sanctioned
  // "24k-grain-bucket trim") during the SwiftShader 30fps rework: the extra grains
  // cost ~4-5ms/frame on the software-GL bench for marginal density, and the
  // ratio-based compensation + cheap bloom close the difference.
  if (tier === 'low') return 24_000;
  // Mid tier deliberately falls through to the HIGH width buckets below: its
  // halving happens downstream, in createScene, via resolveDensityScale's
  // MID_TIER_DENSITY default — the same ?density= plumbing — so the count AND
  // the density-compensation fatten stay one mechanism, not two.
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || width < 760;
  if (width < 480) return 95_000;
  if (isMobile) return 150_000;
  if (width < 1280) return 240_000;
  return CFG.diskParticles;
}

// --- low-tier density compensation ------------------------------------------
// This hero's light is ADDITIVE: each grain emits, and overlapping grains
// ACCUMULATE brightness. The low tier draws far fewer grains than the ~1.2M-grain
// desktop cloud, so the object collects less light and the gaps between grains open
// up. Historically the low tier ALSO skipped the UnrealBloom pass — the effect that
// smooths discrete grains into a glow — which left the red giant reading as a
// crusty sponge/golf-ball. That is now fixed at the source: the low tier runs a
// CHEAP quarter-res bloom (buildPostChain 'cheap') AND ~2× the old particle count
// (tuneParticlesForDevice: 90k/140k). With bloom smoothing the grains and twice the
// coverage doing the rest, this per-grain compensation only has to do a MODEST top-up
// — it is deliberately LIGHTER than the old "no-bloom, very-few-grains" tuning, which
// over-boosted brightness/size and was itself the source of the chunky look. We still
// boost each grain's EMISSION (so the thinned cloud accumulates enough additive light)
// and its SIZE (so grains overlap into continuous gas), just by a smaller amount.
//
// Gated by COUNT *and* the explicit `lowTier` flag (threaded from createScene). The
// count gate alone is no longer enough to separate the tiers: the bumped low buckets
// (90k/140k) now OVERLAP the high width buckets (95k/150k/240k), so a pure count
// ceiling would either miss 140k or catch 95k/150k. Threading the tier makes the
// separation exact — the compensation applies ONLY on the low tier, so the desktop
// full count AND every high-tier width bucket stay byte-identical (comp {1,1}).
// LOW_TIER_MAX_PARTICLES is kept as a defensive upper sanity bound (just above the
// top low bucket) so an unexpectedly large low count can't trigger a runaway boost.
export const LOW_TIER_MAX_PARTICLES = 150_000;

export interface DensityCompensation {
  /** Multiplier for per-grain emission (uBright / uStarBright). 1.0 at full count. */
  brightGain: number;
  /** Multiplier for grain SIZE (uPointGain in the disk shader). 1.0 at full count. */
  pointGain: number;
}

/**
 * Density compensation for a rig built with `actualCount` grains out of the full
 * `fullCount` baseline, on the given tier. Returns { brightGain: 1, pointGain: 1 }
 * (a no-op) UNLESS the caller is the low tier (`lowTier === true`) — so the desktop
 * full path AND every high-tier width bucket (95k/150k/240k) are byte-identical;
 * only the low-tier fallback buckets are boosted. (LOW_TIER_MAX_PARTICLES is an extra
 * sanity bound so even on low an unexpectedly large count can't trigger a boost.)
 *
 * Both gains are SUBLINEAR in the drop ratio `fullCount / actualCount` (≈8.6–13×
 * at the new low buckets). A linear inverse would blow the additive cloud to flat
 * white; a fractional power lifts the object back into the legible band without
 * clipping. The exponents/caps are intentionally LIGHTER than the pre-bloom tuning
 * (cheap bloom + 2× grains now carry most of the load). Clamped so it can't run away.
 */
export function densityCompensation(
  actualCount: number,
  fullCount: number = CFG.diskParticles,
  lowTier = false,
  force = false,
): DensityCompensation {
  // OFF unless this is the low tier (and within the sanity bound) → high path and
  // every high-tier width bucket untouched, byte-identical. `force` is the debug
  // ?density= A/B path (resolveDensityScale < 1): it bypasses BOTH the tier gate
  // and the LOW_TIER_MAX_PARTICLES sanity bound (a high-tier half-density cloud is
  // ~600k grains — way over the low-tier bound but still needing the same sublinear
  // fatten so the thinned cloud reads as gas, not confetti).
  if (!(lowTier || force) || actualCount <= 0 || (!force && actualCount > LOW_TIER_MAX_PARTICLES)) {
    return { brightGain: 1, pointGain: 1 };
  }
  const ratio = fullCount / actualCount; // how many grains were dropped (≈50× at 24k, ≈75× at 16k)
  // HISTORY / WHY THE CAPS MOVED: these exponents+caps were tuned when the low
  // buckets were 90k/140k (ratios ≈8.6-13×, gains landing ≈1.9-2.2×, caps 2.4/2.6
  // never engaged). The buckets were later cut hard to 16k/24k for CPU-throttle
  // performance — ratios jumped to ≈50-75× — but the caps stayed, clamping the
  // compensation at a level tuned for 5× more grains. Result: the mobile red giant
  // rendered as sparse orange CONFETTI on black (the audit finding). The caps now
  // sit just above what ratio^exp yields at the 16k bucket, so the fractional-power
  // curve — not the clamp — sets the gain at every real bucket.
  // Brightness: ratio^0.30 (≈3.2× at 24k, ≈3.65× at 16k).
  const brightGain = Math.min(3.8, Math.pow(ratio, 0.30));
  // Size: ratio^0.32 (≈3.5× at 24k, ≈4.0× at 16k) — the disk shader widens each
  // grain's gaussian CORE in step (disk.glsl softP/softN, driven by uPointGain) so
  // the fattened grains overlap into a continuous surface instead of discrete dots.
  const pointGain = Math.min(4.2, Math.pow(ratio, 0.32));
  return { brightGain, pointGain };
}

/**
 * Resolve whether the ADAPTIVE runtime downgrade (the first-1.5s median-FPS
 * check that can step a 'high' session down to 'low') is enabled for this visit.
 * Mirrors resolvePhotons's reload-surviving priority order: the `?adapt=` URL
 * query (persisted to sessionStorage so it survives same-tab reloads), then
 * sessionStorage, then the __bhAdapt window global (0 = off, anything else = on).
 * DEFAULT ON — the adaptive path is shipped behavior; `?adapt=0` is the PIN flag
 * for machines hovering right at the 30fps floor (the downgrade never fires and
 * the session stays on the boot tier). Note: an explicit `?tier=` override ALSO
 * pins the tier (see isTierForced) independently of this flag.
 */
export function resolveAdaptive(): boolean {
  if (typeof window === 'undefined') return true;
  const sanitize = (raw: unknown): boolean | undefined => {
    if (raw === '0' || raw === 0 || raw === 'false' || raw === 'off') return false;
    if (raw === '1' || raw === 1 || raw === 'true' || raw === 'on') return true;
    return undefined;
  };

  // 1) URL query (?adapt=0) — survives reloads; mirror it into sessionStorage.
  try {
    const fromUrl = sanitize(new URLSearchParams(window.location.search).get('adapt'));
    if (fromUrl !== undefined) {
      window.sessionStorage?.setItem(DEBUG_WINDOW_KEYS.adapt, fromUrl ? '1' : '0');
      return fromUrl;
    }
  } catch {
    // URL/sessionStorage access can throw in locked-down contexts — ignore.
  }

  // 2) sessionStorage (set by a prior ?adapt= visit) — also survives reloads.
  try {
    const fromStore = sanitize(window.sessionStorage?.getItem(DEBUG_WINDOW_KEYS.adapt));
    if (fromStore !== undefined) return fromStore;
  } catch {
    // ignore — fall through to the window global.
  }

  // 3) window.__bhAdapt global (console-handy; cleared by a full reload).
  const fromGlobal = sanitize(readDebugNumber(DEBUG_WINDOW_KEYS.adapt));
  if (fromGlobal !== undefined) return fromGlobal;

  return true; // default ON — adaptive downgrade is shipped behavior
}

// --- adaptive runtime downgrade (SAFETY NET only) -----------------------------
// The PRIMARY tiering is now proactive (detectDeviceTier's GPU classification +
// fill-rate microprobe above): a weak device boots on the right rung instead of
// failing first. This sampler remains as a demoted SAFETY NET for the residue
// the upfront classification can't see — a masked renderer string that probed
// optimistically, a thermally-throttled laptop, a battery-saver GPU clock.
//
// After the first ADAPTIVE_SAMPLE_MS ms of rendering, compute the MEDIAN frame
// delta and, if that implies FPS below ADAPTIVE_FPS_FLOOR, step DOWN exactly ONE
// rung (stepDownTier: high→mid, mid→low — no more cliff-diving straight to low)
// — lowering the render pixel ratio (and, at 'low', enabling the 30fps cap).
// Still disabled by ?adapt=0 and by any forced ?tier= (isTierForced). The boot
// path is byte-identical when median FPS is healthy (no downgrade).

/** Milliseconds to collect frame-time samples before deciding. */
export const ADAPTIVE_SAMPLE_MS = 1_500;

/** Median FPS floor below which the adaptive downgrade fires. */
export const ADAPTIVE_FPS_FLOOR = 30;

/**
 * Given an array of frame-time deltas (ms) returns the median FPS.
 * Returns 0 for empty arrays.
 */
export function medianFpsFromDeltas(frameDeltas: number[]): number {
  if (frameDeltas.length === 0) return 0;
  const sorted = [...frameDeltas].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianDelta =
    sorted.length % 2 === 0
      ? ((sorted[mid - 1]! + sorted[mid]!) / 2)
      : sorted[mid]!;
  return 1_000 / medianDelta;
}

/**
 * Returns true when the sampled frame deltas indicate that the scene should
 * be stepped down one tier. Requires at least 5 samples (to filter noise
 * from the first couple of frames) and a median FPS below `fpsFloor`.
 * Safe to call on a partial or empty sample set — never throws.
 */
export function shouldAdaptiveDowngrade(
  frameDeltas: number[],
  fpsFloor: number = ADAPTIVE_FPS_FLOOR,
): boolean {
  if (frameDeltas.length < 5) return false;
  return medianFpsFromDeltas(frameDeltas) < fpsFloor;
}
