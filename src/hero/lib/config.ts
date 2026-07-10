// Scene configuration — the tuned constants for the black-hole hero, plus the
// device/runtime helpers that read the environment.
//
// Physics adapted from github.com/vlwkaos/threejs-blackhole: Keplerian orbits,
// relativistic beaming ∝ δ³, gravitational redshift, T ∝ r^-3/4 (rs = 1; the hole
// sits at the world origin). Brightness-related values are lifted above the moody
// reference still so the hero reads as clearly luminous (see exposure / bloomStr /
// disk brightness).
import { getMotion } from '../../lib/motion';
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

// Fixed screen-space look offset.
export const lookOffsetX = -0.82;
export const lookOffsetY = 0.16;

/** Resolved reduced-motion preference (manual override ?? OS) — delegates to the
 *  sitewide motion module's <html data-motion> attribute. SSR-safe (false). */
export function prefersReducedMotion(): boolean {
  return getMotion() === 'reduced';
}

// --- device tier ------------------------------------------------------------
// A deliberately coarse 'high' | 'low' split, detected ONCE at mount from cheap
// signals (cores / deviceMemory / mobile UA / a throwaway WebGL probe). 'high' is
// the full hero exactly as it has always shipped; 'low' is the reduced fallback
// (fewer particles, capped DPR, no bloom pass, no gravity bake) wired through the
// scene. The tier is a single seam: every consumer either branches on `tier ===
// 'low'` or takes a defaulted param, so the high path stays byte-identical.
export type DeviceTier = 'high' | 'low';

// Memoized so the probe (which creates + tears down a throwaway WebGL context)
// runs at most once per page, no matter how many times the tier is requested.
let cachedTier: DeviceTier | undefined;

/**
 * Resolve a forced tier override from any of three reload-surviving sources, in
 * priority order: the `?tier=` URL query, sessionStorage, then the __bhTier window
 * global. A bare window global is wiped by a reload (it races scene hydration), so
 * `?tier=low` / `?tier=high` is the reliable way to test — when seen in the URL it
 * is persisted to sessionStorage so it survives subsequent same-tab reloads and
 * in-app navigations. Returns undefined when nothing valid is set (→ auto-detect).
 */
function readTierOverride(): DeviceTier | undefined {
  const valid = (value: unknown): DeviceTier | undefined =>
    value === 'high' || value === 'low' ? value : undefined;

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

/**
 * Detect the device tier once and cache it. SSR-safe (returns 'high' with no
 * window). A forced override (?tier= / sessionStorage / __bhTier) is honoured FIRST
 * so the low-end path can be exercised on any machine; otherwise ANY weak signal
 * trips the scene down to 'low'. Conservative by construction — only KNOWN-weak
 * signals demote, so a capable desktop/modern-mobile GPU always stays on the full
 * 'high' hero.
 */
export function detectDeviceTier(): DeviceTier {
  if (typeof window === 'undefined') return 'high';
  if (cachedTier !== undefined) return cachedTier;

  // Override FIRST (testable on any machine): the tier can be pinned outright via
  // the ?tier= URL query, sessionStorage, or the __bhTier window global.
  const override = readTierOverride();
  if (override === 'high' || override === 'low') {
    cachedTier = override;
    return cachedTier;
  }

  // Cheap signals, defensively typed (the optional ones are absent on some UAs).
  const cores = navigator.hardwareConcurrency ?? 8;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory; // GB | undefined
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 760;
  const probe = probeWebGL();

  // ANY of these demotes to 'low' — each independently sufficient.
  const tier: DeviceTier =
    isMobile // ALL mobile → low (confirmed product decision)
    || cores <= 4 // few logical cores → low
    || (mem !== undefined && mem <= 4) // ≤4 GB reported RAM → low (never trips when undefined)
    || probe.weakGpu // a known-weak GPU family → low
    || !probe.webgl2 // no WebGL2 at all → low
      ? 'low'
      : 'high';

  cachedTier = tier;
  return cachedTier;
}

/**
 * One-time WebGL capability probe on a throwaway canvas (never attached to the
 * DOM). Returns whether WebGL2 is available and whether the renderer string
 * matches a CONSERVATIVE list of known-weak GPU families. Best-effort and fully
 * guarded: any failure returns the neutral { webgl2: false, weakGpu: false } so a
 * thrown probe never crashes detection (it just reads as "no WebGL2" → 'low').
 */
function probeWebGL(): { webgl2: boolean; weakGpu: boolean } {
  try {
    const canvas = document.createElement('canvas'); // throwaway, never in the DOM
    const gl2 = canvas.getContext('webgl2'); // WebGL2RenderingContext | null
    const webgl2 = gl2 !== null;
    // Fall back to a WebGL1 context purely to read the renderer string.
    const gl: WebGL2RenderingContext | WebGLRenderingContext | null = gl2 ?? canvas.getContext('webgl');
    let weakGpu = false;
    if (gl) {
      // UNMASKED_RENDERER_WEBGL is gated behind this debug extension.
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      // KNOWN-weak families ONLY. Must NOT match modern Adreno 6xx/7xx, Apple GPUs,
      // or desktop cards — so the Adreno pattern is pinned to the 1xx–3xx range.
      weakGpu = /SwiftShader|Mali|Adreno [0-3]\d{2}\b|PowerVR/i.test(renderer);
    }
    // Best-effort: release the throwaway context immediately.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return { webgl2, weakGpu };
  } catch {
    return { webgl2: false, weakGpu: false };
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
  if (tier === 'low') return Math.min(dpr, 0.6);
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
  if (tier === 'low') return width < 480 ? 28_000 : 40_000;
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
): DensityCompensation {
  // OFF unless this is the low tier (and within the sanity bound) → high path and
  // every high-tier width bucket untouched, byte-identical.
  if (!lowTier || actualCount <= 0 || actualCount > LOW_TIER_MAX_PARTICLES) {
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
