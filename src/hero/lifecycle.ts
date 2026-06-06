// ===========================================================================
// lifecycle.ts — legacy shader-state choreography, as a PURE function.
//
// The public scroll story now runs forward from nebula to black hole. This module
// still speaks the older shader "stage" coordinate system because the GPU morphs
// were built around it; timeline.ts owns the forward progress → legacy stage
// mapping. The BlackHole scene's per-frame
// loop used to compute ~48 named scalars from `stage`/`t` inline and immediately
// pour them into three.js uniforms, bloom, exposure, grade and camera. That made
// the actual SUBJECT MATTER — "how does the scroll position become the star's
// look this frame" — have no interface and no test surface; it was tangled with
// the renderer.
//
// This module is the deep-module model that `scroll.ts` is for input: it OWNS the
// decision of what every look scalar should be at a given lifecycle position, and
// it is PURE — no THREE, no DOM, no window, no uniform writes, no side effects.
// Given the inputs the frame loop already derives, it returns ALL the computed
// scalars (the look/bloom/exposure/grade/camera-shape values) as one typed
// `StarState`. The frame loop becomes a thin impure shell: it reads the genuinely
// STATEFUL clock (the eased `stage`, the time-based supernova `nova` envelope, the
// `intro` dezoom timing), passes those already-computed scalars in here, and then
// just WRITES the returned StarState into uniforms/bloom/grade/camera.
//
// IMPORTANT — what is NOT here: the irreducibly stateful clock stays in frame().
// Specifically the supernova `nova` trigger + envelope (novaStart/novaArmed/
// prevMorph), the `intro`/dezoom ramp, and the per-frame `stage` smoothing are
// time- and history-dependent, so they cannot be pure. Their already-resolved
// scalar RESULTS (`stage`, `t`, `nova`, `intro`) are passed IN; this function is a
// pure function of those inputs.
//
// The formulas below are a faithful, order-preserving extraction of the original
// inline math: every value is computed by the same expression, in the same order,
// from the same inputs, so the rendered hero is bit-for-bit identical.
// ===========================================================================

// --- easing helpers (the single source of truth; frame() imports these too) ---
// easeOutCubic — fast pull-back that settles softly into the resting pose.
export const easeOut = (x: number): number => 1 - Math.pow(1 - x, 3);
// clamped smoothstep over [0,1] — used throughout the lifecycle choreography.
export const smoothstep01 = (x: number): number => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
};

/**
 * The subset of CFG values the choreography reads. Passed in (rather than
 * imported) so this module stays decoupled from the scene's config object and
 * trivially testable — but the fields mirror CFG exactly, so behaviour is
 * unchanged.
 */
export interface LifecycleConfig {
  starBright: number;
  bloomStr: number;
  bloomRad: number;
  exposure: number;
  olive: number;
  warmth: number;
  saturation: number;
  grain: number;
  camDist: number;
}

/**
 * Inputs the frame loop derives BEFORE calling lifecycle(). `stage`, `nova` and
 * `intro` are the resolved outputs of the stateful clock that lives in frame();
 * everything downstream of them is pure.
 */
export interface LifecycleInput {
  /** eased lifecycle position (0..5); fractional part is the morph t. */
  stage: number;
  /** seconds since scene start, for the resting rotation drift. */
  t: number;
  /** prefers-reduced-motion → freeze to the settled frame. */
  reduced: boolean;
  /** supernova whiteout envelope (0..1) from the time-based clock in frame(). */
  nova: number;
  /** dezoom progress (0 close → 1 rest) from the intro ramp in frame(). */
  intro: number;
  /** resting azimuth drift rate (rad/s); ROTATE_SPEED in frame(). */
  rotateSpeed: number;
  /** how close the dezoom travelling begins, × resting distance; NEAR_FACTOR. */
  nearFactor: number;
  /** the CFG subset the formulas read. */
  cfg: LifecycleConfig;
}

/**
 * The full per-frame look of the star at a given lifecycle position. Every field
 * is a pure derivation of LifecycleInput; the frame loop writes them verbatim
 * into uniforms / bloom / exposure / grade / camera. Grouped by what they drive.
 */
export interface StarState {
  // --- core morph scalars ---
  /** transition-1 progress: min(1, stage). Drives uMorph on disk + ring. */
  morph: number;
  /** red-giant surface collapse (0 full sphere → 1 collapsed to the point). uCollapse. */
  kCollapse: number;
  /** raw "sphere-identity model active" ramp (stage 0.5→1.05). */
  giant: number;
  /** giant held at 1 once a later placeholder state takes over. uGiant. */
  giantHeld: number;
  /** red-giant size multiplier (× uGiantR) driving uGiantScale. Ramps from SMALL at the
   *  post-supernova reveal (the star looks tiny next to the huge black hole we just saw)
   *  up to the full bloated size as the camera comes in (the reveal that it's actually a
   *  massive star). Pinned to full outside the reveal window so the held giant / later
   *  states are unchanged. */
  giantScale: number;

  // --- later-state activation flags (review-mode hard swaps) ---
  /** yellow-star slot active (stage ≥ 2.5). */
  yellow: boolean;
  /** nebula slot active (stage ≥ 3.5). Gates the timeline/grade. */
  nebula: boolean;
  /** the shader's nebula geometry is active (the real nebula OR the collapse window). uNebula. */
  nebulaShader: boolean;
  /** pale-blue-dot slot active (stage ≥ 4.5). uDot. */
  dot: boolean;

  // --- nebula → yellow star: GPGPU gravitational collapse ---
  // Scrolling UP from the nebula (stage 3.5) toward the star (≈3.05), the gas
  // particles collapse inward under gravity and feed the mesh star. These drive
  // the stateful sim + the mesh handoff; they are pure functions of `stage`.
  /** collapse drive: 0 dispersed nebula (≥3.5) → 1 fully collapsed (≤3.05). uCollapseDrive. */
  collapse: number;
  /** how much the disk reads the sim position vs the analytic nebula. uSimBlend. */
  simBlend: number;
  /** mesh star reveal: 0 (no mesh) → 1 (full star) as the cloud finishes feeding it. */
  starFormed: number;
  /** cloud brightness multiplier across the collapse (bright infall → fade out). 1 outside. */
  cloudBright: number;

  // --- supernova flash (rides the time-based nova envelope) ---
  /** particle-side shock-breakout glow: 1.45 * nova. uFlash. */
  flash: number;

  // --- yellow ⇄ red flash-swap ---
  /** we are inside the yellow→red slot (mesh or cloud side). */
  inYRWindow: boolean;
  /** the opaque yellow MESH owns this side of the swap. */
  meshSide: boolean;
  /** the red-giant particle CLOUD owns this side of the swap. */
  cloudSide: boolean;
  /** subtle swap-flash envelope (stage-space gaussian). uYrFlash. */
  yrFlash: number;
  /** grow curve gold-radius → red-giant-radius. uYrGrow (1 outside cloudSide). */
  yrGrow: number;
  /** colour LERP gold → red. uYrMix (1 outside cloudSide). */
  yrColor: number;
  /** the yellow MESH sun rig is visible this frame. */
  sunRigVisible: boolean;
  /** the particle-cloud body is shown this frame. */
  cloudShown: boolean;
  /** the lensed background starfield is shown this frame. */
  starPtsVisible: boolean;
  /** the plain twinkling star backdrop (sun-rig dome) is shown this frame. It sits
   *  behind BOTH the yellow star and the red giant — the two states share one
   *  starfield background — and is hidden for the black hole (which keeps the
   *  warping lensed starfield), the nebula, the dot, and the collapse window. */
  starBackVisible: boolean;
  /** brightness multiplier for the shared star backdrop dome (sun-rig `uBright`).
   *  The red giant runs the post grade at a LOWER exposure than the yellow star, so
   *  the dim dome stars would crush to black behind it. We brighten the dome to
   *  compensate so the backdrop reads the SAME behind both star states. */
  starBackBright: number;

  // --- gravity teardown (a star bends no light) ---
  /** lens/warp fade as the hole exists → 0. */
  lensLive: number;
  /** plain starfield brightness behind the scene. uStarBright. */
  starBright: number;
  /** all gravity (warp arcs, lensed ghost, photon ring) is gone. */
  gravityGone: boolean;

  // --- disk emission + bloom + exposure beats ---
  /** post-breakout flare ramp (drives bloom taming). */
  flareAmt: number;
  /** dark-seed dip window (morph-keyed gaussian). */
  seedZone: number;
  /** compression-window emission cut (morph-keyed gaussian). */
  hotZone: number;
  /** disk base emission (pre dev-density multiply). uBright base. */
  baseBright: number;
  /** explosion grade envelope (blast window, decays as giant takes over). */
  exGrade: number;
  /** disk in-shader saturation across the blast. uSat (disk). */
  exSat: number;

  // --- resolved bloom + grade + disk-sat for THIS frame ---
  // The original code computed base bloom/grade values then overwrote them inside
  // the sun / red-giant / nebula branches (the nebula branch even blends the
  // freshly-written values). Those branches are resolved here so the frame loop
  // simply assigns the finals — same math, same order.
  /** final UnrealBloom strength. */
  bloomStrength: number;
  /** final UnrealBloom radius. */
  bloomRadius: number;
  /** final grade exposure. uExposure. */
  exposure: number;
  /** final grade olive cast. uOlive. */
  olive: number;
  /** final grade warmth. uWarmth. */
  warmth: number;
  /** final grade saturation. uSat (grade). */
  gradeSat: number;
  /** Reinhard tone-map compression denominator (uToneComp). Lower = brighter (less
   *  highlight crush). 0.78 default; the red giant lowers it so its deep-red surface
   *  isn't compressed toward black. */
  toneComp: number;
  /** final film-grain amount; per-state seam (e.g. 0 in the nebula). uGrain. */
  grain: number;
  /** final disk in-shader saturation (after sun/nebula overrides). uSat (disk). */
  diskSat: number;

  // --- hyperspace streaks (nebula → beginning dot) ---
  /** Star Wars "lightspeed jump" intensity (0..1) — the nebula's own particles
   *  smear into radial starlines across the dezoom, zero elsewhere. uStreak on the
   *  disk material. (The trail DIRECTION is latched in frame() from scroll velocity.) */
  streak: number;

  // --- camera scale story ---
  /** dezoom distance factor (NEAR_FACTOR → 1 across the intro). */
  distFactor: number;
  /** lifecycle zoom choreography multiplier. */
  zoom: number;
  /** detonation recoil: anticipation pull-in → hard kick → overshoot-settle (rides nova + morph). */
  novaKick: number;
  /** camera-shake "trauma" envelope (0..1) for the blast; frame() turns it into jitter+roll. */
  shakeAmp: number;
  /** transient FOV punch (degrees, added to base fov) on the detonation. */
  fovKick: number;
  /** extra azimuth sweep during the intro (eases out). */
  introSweep: number;
  /** resting azimuth rotation (t * rotateSpeed). */
  rotation: number;
  /** scroll-driven quarter-circle (90°) orbit of the CAMERA around the black hole as
   *  it shrinks (stage 0 → ~0.46), eased to rest before the breakout so the camera is
   *  still when the nova fires. Pure in stage → scrolling back up unwinds it exactly. */
  orbitSweep: number;
  /** red giant → yellow star recompose: a two-axis camera orbit (azimuth) that, with the
   *  park-out and the elevation term below, swings the off-centre limb comp round to a
   *  CENTRED, whole-ball view across stage 2.1→2.5. Added to the azimuth sum. */
  redYellowAz: number;
  /** the elevation/pitch half of that recompose orbit (radians, added to the camera
   *  inclination) — lifts the eye above the equator so the star reads as a whole ball,
   *  not an edge-on disc, by stage 2.5. */
  redYellowElev: number;
  /** black-hole-only geometry shrink: 1 at the hero → small fraction as the disk
   *  implodes toward the seed, reinforcing the collapse so the hole reads as visibly
   *  SMALLER (not just farther). Drives uBlackHoleScale; the shader gates it to the
   *  black-hole state so the red giant / nebula / dot / sim seed are untouched. */
  blackHoleScale: number;
}

/**
 * Pure: maps a lifecycle position (+ the resolved clock scalars) to the full
 * per-frame star look. No side effects.
 */
export function lifecycle(input: LifecycleInput): StarState {
  const { stage, t, reduced, nova, intro, rotateSpeed, nearFactor, cfg } = input;

  const morph = Math.min(1, stage); // transition 1 progress (0..1)

  // --- the unified surface collapse ---------------------------------------
  // The red-giant SURFACE collapse is one continuous beat: the textured sphere
  // shrinks non-homogeneously and its laggard regions stream off as the finger-
  // spikes (the "explosion" is the surface caving in, not a separate blast). It
  // runs across stage 1.05 (full red giant) → 0.5 (the surface reaches the point,
  // where the legacy supernova FLASH fires and the seed/black-hole machinery
  // below takes over). kCollapse drives the shader's per-region shrink.
  const COLLAPSE_HI = 1.6; // stage where the surface is still the full sphere (raised
                           // from 1.05 → the core-swallow takes ~2× the scroll distance,
                           // a slower, more deliberate collapse; still clear of the
                           // parked red-giant beat above)
  const COLLAPSE_LO = 0.5; // stage where the surface has shrunk to the point
  const kCollapse = Math.min(1, Math.max(0, (COLLAPSE_HI - stage) / (COLLAPSE_HI - COLLAPSE_LO)));
  // `giant` means the sphere-identity model is active. In the forward story it
  // must stay fully active through the whole red-giant collapse so uCollapse can
  // physically crush the surface; only after the breakout crossing do we hand off
  // to the black-hole machinery.
  const giant = smoothstep01((stage - 0.46) / 0.04);

  // --- supernova flash: time-based envelope, fired on the breakout crossing ---
  // the particle-side shock-breakout glow follows the SAME time envelope as the
  // whiteout, so the additive blast core peaks together with the screen flash.
  const flash = 1.45 * nova;

  // --- transitions 3-5: yellow star → nebula → pale blue dot ---
  // REVIEW MODE (placeholders, no real morph): the new states HARD-SWAP — each
  // slot snaps to that state's stand-in at the stage midpoint so its look + slot
  // can be reviewed in isolation.
  //   yellow star  : active across stage 2→3  (snap at 2.5)
  //   nebula       : active across stage 3→4  (snap at 3.5)
  //   pale blue dot: active across stage 4→5  (snap at 4.5)
  const yellow = stage >= 2.5;
  const nebula = stage >= 3.5;
  const dot = stage >= 4.5;
  // Once a later state is active the sphere is held (uGiant pinned to 1) so the
  // placeholder branch has a sphere to reshape; only the latest-reached state shows.
  const laterActive = yellow || nebula || dot;
  const giantHeld = laterActive ? 1 : giant;

  // --- nebula → yellow star: gravitational collapse window (scrolling UP) ----
  // The collapse runs across stage 3.5 (dispersed nebula) → 3.05 (fully-fed star).
  // `collapse` drives the GPGPU well/spring; `simBlend` morphs the disk from the
  // analytic nebula placement to the sim positions; `starFormed` reveals the mesh
  // star; `cloudBright` brightens then fades the converging cloud.
  //
  // CRITICAL: these are monotonic smoothsteps of the FALLING stage, so they
  // saturate to 1 for every stage BELOW the window — which would wrongly turn the
  // red giant / yellow star / dot into "collapsing nebula". So everything here is
  // hard-GATED to the window [NEB_COLLAPSE_LO, NEB_COLLAPSE_HI]: `inWindow` is 1
  // only inside it, and every scalar is multiplied by it → EXACTLY 0/1 (no-op)
  // outside. Below the window the normal yellow-mesh slot owns the geometry.
  const NEB_COLLAPSE_HI = 3.5; // dispersed nebula
  const NEB_COLLAPSE_LO = 3.0; // window floor (the yellow-mesh slot already owns 2.7–3.5)
  const inWindow = stage > NEB_COLLAPSE_LO && stage < NEB_COLLAPSE_HI ? 1 : 0;
  // ONE smooth window progress drives everything so density and star size move on
  // a single INVERTED scale (no field racing ahead of another): prog = 0 at the
  // dispersed nebula (3.5) → 1 right at the window floor (3.0). Spanning the WHOLE
  // window (not a narrow sub-band) makes the transition fluid — the star grows
  // gradually and the gas thins gradually across the entire scroll, in lockstep.
  const prog = inWindow * smoothstep01((NEB_COLLAPSE_HI - stage) / (NEB_COLLAPSE_HI - NEB_COLLAPSE_LO));
  // `collapse` is the GPGPU drive. It LEADS the star growth (prog^0.85 still ramps
  // faster than the star's prog^1.8) so the gas falls inward and piles onto the core
  // BEFORE the star reaches full size — the inflow visibly FEEDS the star. The 0.85
  // (eased up from 0.7) is less front-loaded so the convergence RAMPS IN gently as
  // you scroll into the window instead of the gas lurching inward at the first pixel.
  const collapse = Math.pow(prog, 0.85);
  // star GROWTH (prog^1.8): the seed becomes faintly visible EARLIER and grows on
  // a smoother, more continuous curve, so the yellow star reads as CONDENSING out
  // of the infalling gas rather than popping into existence in the final stretch.
  // It still lags the gas (which leads at prog^0.7), so the inflow visibly feeds a
  // growing core. Visual size is `0.05 + 0.95*starFormed` in frame() (small→full).
  const starFormed = Math.pow(prog, 1.8);
  // sim owns the disk just inside the window; fades as the mesh takes the core. The
  // analytic→sim morph eases in over a slightly WIDER edge band (/0.16, up from /0.1)
  // so the sim doesn't snap on in the first 0.1 stage units — softer collapse onset.
  const simBlend = inWindow * smoothstep01((NEB_COLLAPSE_HI - stage) / 0.16) * (1 - 0.85 * prog);
  // cloud DENSITY/brightness is the INVERSE of star size: as the star grows
  // (prog→1) the gas thins to almost nothing (mass moved INTO the star). The fade
  // is shaped (1-prog)^1.5 so the gas stays present through the first half (you see
  // it fall) then clears decisively in the second half so the forming gold star
  // reveals instead of being washed by additive gas in front. A STRONGER mid-window
  // glow bump (5.2× vs 4×, +0.8 weight) makes the "light pouring into the core" read
  // clearly as the gas agglomerates onto the star. 1 (no-op) outside the window.
  const feedBump = 5.2 * prog * (1 - prog); // 0→1→0, peaks mid-window (brighter convergence)
  // gas stays visibly present LONGER (^1.6, not ^2.2) so you watch MORE particles
  // stream inward and feed the star before the cloud finally clears.
  const invDensity = Math.pow(1 - prog, 1.6); // 1 → 0
  const cloudBright = 1 + inWindow * ((1 + 0.8 * feedBump) * invDensity - 1);
  // the shader runs its nebula geometry across the real nebula AND the collapse
  // window, so `pos` holds the analytic nebula placement (the sim's seed/home)
  // whenever the sim blend is active.
  const nebulaShader = nebula || simBlend > 0.001;

  // --- yellow star → red giant: FLASH-SWAP transition ----------------------
  // Direction (lifecycle plays in reverse on scroll-down): the YELLOW STAR
  // (mesh sun rig — small, gold, textured) becomes the RED GIANT (point cloud —
  // big, deep red, grainy) as `stage` falls 3 → 2. The two bodies have totally
  // different textures, so they DON'T crossfade co-located. Instead a subtle
  // light flash fires at SWAP_STAGE and the mesh hands off to a gold particle
  // sphere that grows + cools to the red giant.
  const SWAP_STAGE = 2.88; // mesh↔cloud crossover — AFTER the cloud has fully shrunk (≤2.85)
  const inYRWindow = stage > 2.05 && stage < 3.5 && !nebula; // the whole yellow→red slot
  const meshSide = inYRWindow && stage > SWAP_STAGE; // 2.88 .. 3.5 → yellow mesh
  const cloudSide = inYRWindow && stage <= SWAP_STAGE; // 2.05 .. 2.88 → particle body (owns the shrink)

  // subtle flash envelope (its own stage-space gaussian, separate from the
  // supernova flash which lives in morph space and is tied to stage 0→1).
  const YR_FLASH_SIGMA = 0.04; // tighter than before — a brief, faint cross-dissolve cue only
  const yrFlash = inYRWindow ? Math.exp(-Math.pow((stage - SWAP_STAGE) / YR_FLASH_SIGMA, 2.0)) : 0;

  // grow + colour curves. The red giant holds full size while parked, then — once the
  // recompose orbit + unzoom have centred it (stage ~2.5) — SMOOTHLY CONTRACTS from full
  // (~9 units) down to the yellow size (~1.6, = full × 0.18 in the shader) across a
  // GENEROUS window so it's a continuous shrink, not the old 0.18-stage snap. The colour
  // reddens→gold across the same window so it cools to a smooth gold ball exactly as it
  // reaches the small size — primed for a seamless mesh handoff. Decoupled from SWAP_STAGE
  // (explicit RED_SHRINK_END) so the cloud finishes shrinking BEFORE the mesh swaps in.
  const RED_EXIT_START = 2.5; // shrink begins right after the recompose lands
  const RED_COLOR_EXIT_START = 2.52; // colour cools just behind the size
  const RED_SHRINK_END = 2.85; // fully shrunk to yellow size before the 2.88 swap
  const yrGrow = 1 - smoothstep01((stage - RED_EXIT_START) / (RED_SHRINK_END - RED_EXIT_START));
  const yrColor = 1 - smoothstep01((stage - RED_COLOR_EXIT_START) / (RED_SHRINK_END - RED_COLOR_EXIT_START));

  // During the gravitational collapse (stage 3.05..3.5) the CLOUD shows the
  // nebula particles falling inward, and the mesh star fades IN via starFormed as
  // they reach the core — so this window overrides the plain yellow→red mesh slot
  // (which would otherwise hide the cloud and show the full mesh from 3.5 down).
  // Bounded to the window's lower edge so BELOW it (stage ≤ 3.04) the normal
  // yellow-mesh slot resumes (mesh at full size, cloud hidden) — clean handoff.
  const collapsing = inWindow === 1 && (simBlend > 0.001 || starFormed > 0.001);

  // Mesh visible across its side, plus a short overhang into the bright flash so
  // the handoff cross-dissolves under the bloom rather than hard-cutting. In the
  // collapse window the mesh only shows once the cloud has started feeding it.
  const sunRigVisible = collapsing ? starFormed > 0.01 : inYRWindow && stage > SWAP_STAGE - 0.05;
  // Inside the slot, the cloud body only shows on the cloud side (the opaque mesh
  // owns the yellow side); outside the slot the cloud renders everything. During
  // the collapse the cloud is ALWAYS shown (it IS the infalling gas feeding the star).
  const cloudShown = collapsing ? true : inYRWindow ? cloudSide : true;
  // The RED GIANT phase: the cloud-rendered big red star. It owns the shared star
  // dome (see starBackVisible), so the lensed/warp starfield (`starPts` — the BLACK
  // HOLE's background) must be OFF here, or its olive/red-graded speckle bleeds
  // through and the red giant ends up on the black hole's background. Defined here
  // (ahead of the grade block, which redeclares the same predicate) so the lensed-
  // starfield gate below can exclude it.
  const redGiantActive = cloudSide || (giantHeld > 0.5 && !yellow && !nebula && !dot);
  // Hide the lensed background starfield while the opaque mesh body is present;
  // ALSO hide it across the NEBULA, the collapse, and the RED GIANT (the gas / red
  // giant sit on the clean dome or pure black, never on the warping lensed field).
  const starPtsVisible = (inYRWindow ? cloudSide : true) && !nebula && !collapsing && !redGiantActive;

  // sunWindow drives the bright-gold grade below (mesh side); the cloud side is
  // handed to the red-giant grade, whose handoff is driven by yrColor.
  const sunWindow = meshSide;

  // the star/warp lensing only makes sense while the hole exists — fade it. Once
  // the SUN forms we drop the gravitational-warp background entirely and restore
  // the plain starfield to full brightness behind the star.
  const lensLive = 1 - Math.min(1, Math.max(0, (morph - 0.1) / 0.4));
  const starBright =
    cfg.starBright * (0.4 + 0.6 * lensLive) * (1 - 0.45 * giantHeld) + cfg.starBright * 0.45 * giantHeld;
  // Completely remove ALL gravity once the star forms (warp arcs, secondary lensed
  // disk image, photon ring). Below ~giant 0.02 these are gone entirely.
  const gravityGone = giantHeld > 0.02;

  // Tame the bloom as the remnant inflates; let the flash punch it briefly. The
  // red giant is meant to be DIM, so pull bloom right down once it forms.
  const flareAmt = Math.min(1, Math.max(0, (morph - 0.46) / 0.54));
  // SEED window (matches the shader's dark-core dip): the collapsed matter must
  // read as a small DARK point, not a bloomed glow. Narrow + EARLY (centred 0.45).
  const seedZone = Math.exp(-Math.pow((morph - 0.45) / 0.035, 2.0));
  // brief bloom spike at the breakout — the loudest visual beat — but suppressed
  // inside the seed window so it doesn't re-inflate the dark seed into a glow.
  let bloomStrength = cfg.bloomStr * (1 - 0.7 * flareAmt) + nova * 0.55 * (1 - 0.9 * seedZone);
  bloomStrength = bloomStrength * (1 - 0.6 * giantHeld) + 0.12 * giantHeld;
  bloomStrength *= 1 - 0.9 * seedZone; // kill bloom hard at the dark seed
  // The imploded core packs the whole disk into a small, dense, additively-blended
  // region — brightness there is enormous. Cut the disk's base emission hard across
  // the compression window so it never clips to an edge-to-edge whiteout.
  const hotZone = Math.exp(-Math.pow((morph - 0.5) / 0.15, 2.0));
  // The point-cloud red giant body renders at full base brightness; in the yellow→
  // red slot it simply appears under the swap flash (no ramp-in).
  // SHRINK COMPENSATION: as the cloud contracts from the full red giant toward yellow
  // size (yrGrow 1→0), the SAME ~1M additive points pack into a far smaller sphere, so
  // per-pixel brightness balloons — the cloud blob was spiking ABOVE both the red giant
  // and the yellow star (a "shiny" bump mid-transition). Cut base emission as it shrinks
  // so the cloud's apparent brightness stays on the monotonic red→yellow line. Only on
  // the cloud side (yrGrow is 1 everywhere else, so this is a no-op outside the slot).
  const shrinkComp = cloudSide ? 0.30 + 0.70 * yrGrow : 1;
  const baseBright = 1.25 * (1 - 0.92 * hotZone) * shrinkComp;

  // Auto-exposure: pull down across the flash, dip at the seed, settle lower for
  // the dim red giant. The over-exposure punch rides the TIME envelope (`nova`),
  // suppressed in the seed window so it never undoes the dark-core dip.
  const flashPunch = nova;
  let exposure =
    cfg.exposure *
    (1 - 0.58 * hotZone) *
    (1 - 0.18 * giantHeld) *
    (1 - 0.35 * seedZone) *
    (1 + 0.9 * flashPunch * (1 - 0.7 * seedZone));
  // Grade through the explosion: the blue-white→amber→red debris wants strong
  // warmth & saturation and the olive/green background tint pulled right back.
  // exGrade is a sharp envelope over the blast window, decaying as the giant takes over.
  const exGrade = Math.exp(-Math.pow((morph - 0.66) / 0.2, 2.0)) * (1 - giantHeld);
  let olive = cfg.olive * (1 - 0.85 * giantHeld) * (1 - 0.92 * exGrade);
  let warmth = cfg.warmth + 0.06 * giantHeld + 0.12 * exGrade;
  let gradeSat = cfg.saturation + 0.5 * giantHeld + 0.7 * exGrade;
  // lift the disk's IN-SHADER saturation across the blast so the explosion ramp
  // colours survive instead of being crushed toward grey by the global desaturation.
  const exSat = cfg.saturation + 0.55 * exGrade + 0.5 * giantHeld;
  let diskSat = exSat;
  // film grain: per-state seam. Defaults to the configured amount; a state branch
  // below can dial it (the nebula zeroes it so the immersed gas reads smooth).
  let grain = cfg.grain;
  // tone-map compression: 0.78 (filmic default, protects the nova white core). The
  // red-giant branch lowers it so the deep-red photosphere isn't crushed to black.
  let toneComp = 0.78;

  // bloom radius defaults to the resting value; the branches below override it.
  let bloomRadius = cfg.bloomRad;

  // shared-backdrop brightness: 1 = the dome's tuned base (set for the bright yellow
  // grade). The red-giant branch raises it to cancel that state's dimmer exposure so
  // the same star field reads identically behind both star states.
  let starBackBright = 1;

  // --- sun grade: bold, saturated, un-washed. The yellow star reads as vivid
  // gold; the RED GIANT reads as a big, deep, matte red star. The red giant is
  // crossfaded in over the gather so the explosion grade hands off cleanly.
  const redGiantPhase = redGiantActive; // (same predicate, defined above for the starfield gate)
  const yrPunch = yrFlash; // 0..1 subtle swap-flash envelope

  // --- red→yellow brightness line (single source of truth) ------------------
  // The brightness MUST rise monotonically from the dim red giant up to the bright
  // yellow star — no mid-transition bump (the old cloud-shrink blob spiked above both
  // ends and read as a "shiny" pop). These four constants are the two endpoints of
  // that line; both the settled-yellow `sunWindow` branch AND the cloud-side ramp in
  // `redGiantPhase` interpolate between them, so the whole transition is one straight
  // line. RED_GIANT is the DIM end, YELLOW is the BRIGHT end.
  const RED_GIANT_EXPOSURE = cfg.exposure * 0.86; // dim end of the ramp
  const RED_GIANT_BLOOM = 0.40;
  const YELLOW_EXPOSURE = 1.15; // BRIGHT end — the yellow star is the brightest star state (a blazing
  //   gold sun like the reference, not a dusky ball). The surface keeps detail because the granulation
  //   contrast + tight bloom land the brightness on the textured disc/rim, not a blown halo.
  const YELLOW_BLOOM = 0.34; // tight: the extra brightness lands on the disc/rim, not a halo

  // --- shared star backdrop (yellow star + red giant) ----------------------
  // The twinkling far star dome (the sun rig's dome) is the BACKGROUND for the
  // two star states. The yellow star always showed it (it rides the mesh rig);
  // the RED GIANT is drawn by the point cloud and so used to sit on flat black.
  // We now show the SAME dome behind both, so the red giant gets the yellow
  // star's background. It stays HIDDEN for: the black hole (it keeps the warping
  // lensed starfield), the nebula and the dot (gas/speck alone on black), and the
  // gravitational-collapse window (the infalling gas sits alone on black).
  const starBackVisible = redGiantPhase && !nebula && !dot && !collapsing;
  if (sunWindow) {
    // The yellow star is a PROPER, bright main-sequence beat (cf. the reference): a
    // blazing gold-white sun in a wide luminous halo. Graded HOT — high exposure, a
    // broad soft bloom for the halo, full warm saturation — so it reads as radiant,
    // not the old fragile ember. It is now meant to be the brightest star state.
    // BUT: the bright grade must back off once the gravitational-collapse gas engages
    // (stage > 3.0, `collapsing`) — the close camera + infalling cloud + this hot
    // grade would blow out to a white blob. `settled` is 1 across the gas-free yellow
    // band (2.88→3.0) and ramps to 0 as the collapse takes over, handing the
    // brightness story to the collapse/nebula logic below.
    const settled = collapsing ? 1 - smoothstep01((stage - 3.0) / 0.15) : 1;
    // The yellow star is the BRIGHT END of the red→yellow ramp: brightness rises
    // monotonically from the dim red giant up to here. Exposure lifted to YELLOW_EXPOSURE
    // (the brightest star state) while bloom stays TIGHT (0.34) so the extra brightness
    // lands on the detailed granulated disc + rim, not a broad halo — i.e. brighter, but
    // still the solid textured sphere of the reference, not a blown-out white ball.
    // (YELLOW_EXPOSURE / YELLOW_BLOOM are defined above the branch so the cloud-side ramp
    //  in redGiantPhase can interpolate UP to exactly these values — keeping the whole
    //  transition a single monotonic brightness line with no mid-transition bump.)
    bloomStrength = (YELLOW_BLOOM + 0.05 * yrPunch) * settled + 0.32 * (1 - settled);
    bloomRadius = 0.42; // tighter falloff → rim glow hugs the disc, no broad wash
    exposure = (YELLOW_EXPOSURE * settled + 0.58 * (1 - settled)) * (1 + 0.03 * yrPunch);
    olive = 0.0;
    warmth = 0.04; // a touch more gold so the surface reads amber, not pale-white
    gradeSat = 1.0;
    // THE key brightness lever: the shared tone-map col/(col+uToneComp) compresses hard
    // at the 0.78 default — that's what kept the disc dusky (median ~110/255) no matter how
    // high exposure/luminance went. Drop it to 0.42 (like the red giant uses 0.34) so the
    // bright gold photosphere reads as a LUMINOUS glowing surface like the reference, while
    // the granulation contrast keeps the lava detail. `settled` keeps the collapse calm.
    toneComp = 0.42 * settled + 0.78 * (1 - settled);
  } else if (redGiantPhase) {
    // rg crossfades the grade from the bright gold swap-in (rg=0, still flashing)
    // to the settled dim matte red giant (rg=1). On the cloud side it follows
    // yrColor; below the slot it is pinned to 1.
    const rg = cloudSide ? yrColor : 1;
    // BRIGHTNESS RAMP: rg=1 is the full red giant (DIM end), rg=0 is the cloud shrunk to
    // yellow size right before the swap. We interpolate LINEARLY between the endpoints so
    // brightness climbs monotonically from red giant → swap with no mid-transition bump.
    //
    // CRUCIAL: the cloud is ~1M ADDITIVE points; when shrunk to a small sphere it blooms
    // far hotter than the textured MESH for the SAME grade exposure (the dense additive
    // core clips). So the cloud's bright end is NOT YELLOW_EXPOSURE — it's CLOUD_YELLOW
    // (about half), tuned so the smooth pre-swap blob reads a touch DIMMER than the mesh
    // yellow star that swaps in. The swap is then a small step UP into the bright,
    // detailed sun — never the old bright-blob → dim-mesh DROP. Bloom is held tight too.
    const CLOUD_YELLOW_EXPOSURE = 0.50; // additive cloud blooms hot → kept well below the mesh's 1.15
    //   so the smooth pre-swap blob stays clearly DIMMER than the detailed yellow star it swaps into.
    const CLOUD_YELLOW_BLOOM = 0.22; // tighter than the mesh so the blob doesn't grow a wide halo
    const yellowExposure = CLOUD_YELLOW_EXPOSURE * (1 + 0.03 * yrPunch);
    const redExposure = RED_GIANT_EXPOSURE; // dim end
    bloomStrength = (CLOUD_YELLOW_BLOOM + 0.03 * yrPunch) * (1 - rg) + RED_GIANT_BLOOM * rg;
    bloomRadius = 0.42 * (1 - rg) + 0.54 * rg; // yellow halo radius (0.42) → wider matte red (0.54)
    exposure = yellowExposure * (1 - rg) + redExposure * rg;
    olive = 0.0; // no olive cast on the star
    warmth = 0.10 * rg; // warm the matte red — eased back (0.14 → 0.10) so the gold highlights
    //   sit slightly cooler/quieter and don't compete with the headline.
    gradeSat = 1.0; // full saturation throughout
    diskSat = 1.0;
    // The REAL fix for the dim red giant: the shared grade tone-map (col/(col+0.78))
    // compresses highlights hard, and the deep-red palette's tiny green/blue channels
    // get crushed toward black — no amount of disk brightness survives it. Drop the
    // compression denominator for the red giant so its surface reads as a solid glowing
    // wall. Ramps with rg so the bright gold swap-in keeps the filmic 0.78.
    toneComp = 0.42 * (1 - rg) + 0.34 * rg; // rg=0 end (≈yellow 0.42) → red giant 0.34: low
    //   compression both ends so the swap is seamless and both star bodies read as luminous walls.
    // The dome was tuned to read at the yellow grade; the red giant now grades at a
    // DIFFERENT exposure, which would shift the dim backdrop stars. Compensate by the
    // inverse exposure ratio so the SAME star field reads behind both states. Ramps with
    // rg (the swap-in is still the yellow grade → no boost needed there).
    starBackBright = 1 + ((yellowExposure / redExposure) - 1) * rg;
  } else if (nebula && !dot) {
    // nebula grade: a soft, luminous gas cloud. Eased in as the state arrives
    // (nebula snaps at 3.5) so the handoff from yellow isn't a hard pop. We view the
    // cloud from OUTSIDE, so keep bloom moderate (a soft halo on the gas, not a frame-
    // filling wash) and exposure modest so the teal→rust SHO colour ramp survives
    // instead of clipping to cream/white; push saturation UP so the narrowband palette
    // (teal OIII ↔ gold Hα ↔ rust SII) reads vividly.
    const ne = smoothstep01((stage - 3.5) / 0.35);
    bloomStrength = bloomStrength * (1 - ne) + 0.38 * ne; // soft gas/wisp glow
    bloomRadius = cfg.bloomRad * (1 - ne) + 0.75 * ne; // wide soft halo
    exposure = exposure * (1 - ne) + 0.58 * ne;
    olive *= 1 - ne; // no olive cast
    warmth *= 1 - ne; // no warm cast (let teal/cyan show)
    gradeSat = gradeSat * (1 - ne) + 1.55 * ne; // vivid SHO palette
    diskSat = diskSat * (1 - ne) + 1.4 * ne;
    grain = grain * (1 - ne); // fade film grain out → smooth immersed gas (no speckle)
  } else if (dot) {
    // beginning: a near-pixel star in a very large black field.
    bloomStrength = 0.03;
    bloomRadius = 0.10;
    exposure = 0.28;
    olive = 0.0;
    warmth = -0.03;
    gradeSat = 0.72;
    diskSat = 0.7;
  } else {
    bloomRadius = cfg.bloomRad;
  }

  // dezoom distance factor (0 close → 1 rest). Reduced motion lands at the rest frame.
  const distFactor = nearFactor + (1 - nearFactor) * intro;

  // --- black-hole geometric shrink (drives uBlackHoleScale on the disk) -------
  // The HOLE physically CONTRACTS as it implodes (stage ~0.10 → 0.46): full disk down
  // to a small fraction, reinforcing the seed collapse so the hole reads as visibly
  // SMALLER rather than merely farther. It holds at the floor through the brief flash;
  // past the breakout the blast ejecta (computed from coreR, already a speck) owns the
  // geometry and the shader gates the scale off above uGiant>0 — so a held floor is a
  // no-op there. Pure in stage → scrolling up un-shrinks it. Reduced motion = 1 (no
  // shrink, the static settled frame). Window matches the lensing/shadow fade so the
  // fixed screen-space shadow radii never fight the shrinking disk (see the shader).
  const SHRINK_START = 0.1;
  const SHRINK_END = 0.46;
  const SHRINK_MIN = 0.18; // disk contracts to ~18% of full size at the seed
  const shrinkK = smoothstep01((stage - SHRINK_START) / (SHRINK_END - SHRINK_START));
  const blackHoleScale = reduced ? 1 : 1 - (1 - SHRINK_MIN) * shrinkK;

  // --- red-giant size (drives uGiantScale) ----------------------------------
  // Forward scroll tells the growth through the yellow→red shader handoff
  // (uYrGrow/uYrMix), then holds the red giant at a stable radius. Do not reuse
  // the old reverse "tiny newborn red star" reveal here; that made the held giant
  // shrink while its headline was readable and broke the physical lifecycle.
  const GIANT_FULL = 8.5 / 4.2; // medium, dense held size, trimmed ~6% (9.0 → 8.5) — matches
  //   buildDisk uGiantScale AND createScene's RED_GIANT_RADIUS; keep all three in sync.
  const giantScale = GIANT_FULL;

  // --- lifecycle zoom choreography (the scale story) ---
  // DEPRECATED / DEAD CAMERA SCALARS: the values computed from here down that feed
  // the camera (zoom, orbitSweep, novaKick, shakeAmp, fovKick, introSweep, rotation,
  // redYellowAz, redYellowElev) are NO LONGER CONSUMED by the render loop. The active
  // camera is the progress-based keyframe rig in timeline.ts (cameraPoseForProgress),
  // which createScene writes directly to camera.position/lookAt. These remain only so
  // StarState's shape is unchanged; they are safe to delete in a dedicated cleanup
  // pass (out of scope for this cinematic-polish change). Do NOT wire them back into
  // the camera — timeline.ts owns the camera grammar.
  // The camera story (scrolling DOWN, stage rising):
  //   1. HERO → SEED (0 → 0.46): the black hole SHRINKS geometrically (blackHoleScale),
  //      so the camera holds a steady frame (the shrink + orbit carry the "gets small").
  //   2. BLAST (0.46 → ~0.95): SAME ZOOM. The supernova fires on a locked frame (the
  //      subtle shake/novaKick still ride on top — see shakeAmp/novaKick), no zoom move.
  //   3. RED REVEAL (1.0 → 1.7): the star is born SMALL (giantScale above) in a wide
  //      frame → tiny vs the black hole; the camera then comes IN modestly while the star
  //      GROWS to full, landing on the off-centre limb comp (RED_GIANT_PARK). The SIZE
  //      ramp does the scale reveal; the camera move is a gentle accompanying push-in.
  // Reduced motion = 1.
  let zoom = 1.0;
  if (!reduced) {
    const ZOOM_HERO = 0.56; // close at the hero BH → dist≈11 (BH fills the frame)
    const ZOOM_HOLD = 1.0; // steady frame from the implosion through the blast
    const ZOOM_RED_WIDE = 2.7; // the small newborn star (radius ~4.5) sits in a WIDE frame
    //   (dist≈54) → small disc with lots of black margin (tiny vs the huge black hole).
    const ZOOM_RED_HOLD = 1.65; // come IN to the medium star (dist≈33) as it grows to ~9 — it
    //   fills more of the frame as a solid, dense red star; the GROWTH does the scale reveal.
    const ZOOM_RED_UNZOOM = 2.4; // red→yellow: pull BACK (dist≈48) so the whole red giant
    //   recedes and sits small-and-whole, ready to CONTRACT into the yellow star. (Replaces
    //   the old zoom-IN wipe — the transition is now unzoom-then-shrink, not a close push-in.)
    // hero push-in eases out as the implosion gets underway (stage 0 → 0.18), settling to
    // the steady ZOOM_HOLD — no big seed pull-back (the geometric shrink carries the scale).
    const heroT = smoothstep01(stage / 0.18);
    const heroZoom = ZOOM_HERO + (ZOOM_HOLD - ZOOM_HERO) * heroT; // 0.56 → 1.0, then HOLD
    // RED REVEAL: pull to the WIDE newborn frame as the giant forms (0.95 → 1.15), HOLD
    // wide through the scale-contrast beat, then come IN to the limb comp (1.25 → 1.7) as
    // the star grows — a gentle push-in accompanying the growth, not a big dolly.
    const wideT = smoothstep01((stage - 0.95) / 0.2); // ease out to the wide newborn frame
    const inT = easeOut(smoothstep01((stage - 1.25) / 0.45)); // gentle come-in as it grows
    const revealZoom = heroZoom + (ZOOM_RED_WIDE - heroZoom) * wideT; // HOLD → WIDE
    const redHoldZoom = revealZoom + (ZOOM_RED_HOLD - revealZoom) * inT; // WIDE → IN (comp)
    // RED → YELLOW unzoom: pull back from the held comp (1.65) to ZOOM_RED_UNZOOM (2.4)
    // across 2.0→2.5, in lockstep with the recompose orbit, then HOLD steady through the
    // shrink (2.5→2.9) so the contraction reads as the STAR shrinking, not the camera.
    const unzoomT = smoothstep01((stage - 2.0) / (2.5 - 2.0));
    zoom = redHoldZoom + (ZOOM_RED_UNZOOM - redHoldZoom) * unzoomT;
    // YELLOW-STAR push-in: once the cloud has shrunk + handed off to the gold mesh
    // (≈2.85) the star sits TINY at the unzoom distance (dist≈48). The yellow star is
    // now its OWN proper beat — a blazing sun that should FILL the frame like the
    // reference — so come IN to frame it close (ZOOM_YELLOW → dist≈11). It is a HUMP,
    // not a hold: IN across 2.85→2.95, hold on the close blazing star through the
    // gas-free settled band (2.95→3.0), then ease back OUT across 3.0→3.15 BEFORE the
    // collapse gas (inWindow, from 3.0) brightens — so the close frame never coincides
    // with the infalling cloud (which would over-bloom to a white blob). Above 3.15 the
    // nebula immersion (nebIn) owns the camera.
    const ZOOM_YELLOW = 0.55; // close on the full-size yellow star (dist≈11) → fills the frame
    const yellowIn = smoothstep01((stage - 2.85) / 0.1); // come IN across 2.85→2.95
    const yellowOut = smoothstep01((stage - 3.0) / 0.15); // ease back OUT across 3.0→3.15
    const yellowInT = yellowIn * (1 - yellowOut); // hump: 0 → 1 (2.95–3.0) → 0
    zoom = zoom + (ZOOM_YELLOW - zoom) * yellowInT;
    // nebula: fly the camera DEEP INSIDE the cloud so the gas fills the whole frame
    // and wraps past every edge — immersed, like flying through it. (The old radial-
    // spoke problem that once forced us back outside is gone: the geometry is now a
    // fully-hashed, domain-warped volume with no radial banding, so from inside it
    // reads as turbulent gas all around, not spokes.) Ease in as the nebula arrives
    // (3.1 → 3.7), hold immersed, then make a HYPERSPACE JUMP out to the dot.
    const ZOOM_NEBULA = 0.72; // slower, calmer immersion; gas still fills the frame
    const ZOOM_DOT = 4.6; // pull far out so the beginning is nearly a single pixel
    const nebIn = smoothstep01((stage - 3.1) / 0.6);
    zoom = zoom + (ZOOM_NEBULA - zoom) * nebIn; // ease into the cloud
    // The jump to the dot is an AGGRESSIVE dezoom (Star Wars lightspeed): instead
    // of a gentle late ease, the pull-back ENGAGES as we leave the nebula (≈3.6)
    // and ACCELERATES — a cubic ease-in (jumpRaw²·…) front-loads almost no motion
    // then whips outward, so the camera's velocity peaks together with the streak
    // field (lifecycle.streak), selling the punch into lightspeed. It tops out a
    // touch before the dot (4.4) so the final speck rests still, not still flying.
    const jumpRaw = Math.min(Math.max((stage - 3.6) / (4.4 - 3.6), 0), 1);
    const jumpT = jumpRaw * jumpRaw * (3.0 - 2.0 * jumpRaw) * jumpRaw; // smoothstep × extra ease-in → whip
    zoom = zoom + (ZOOM_DOT - zoom) * jumpT; // jump out for the dot
  }
  // --- detonation recoil: anticipation → kick → overshoot-settle -------------
  // A restrained three-act recoil on the blast (distance multiplier on top of the
  // zoom story). It rides BOTH:
  //   • morph  — the scroll-space approach to the breakout (the "charge up"), and
  //   • nova   — the TIME envelope of the blast itself (so a fast scroller still
  //              feels the kick fire and ring out after the wheel has stopped).
  //
  //   1. ANTICIPATION: as morph climbs toward the breakout (0.5), pull the camera
  //      slightly IN — the world holds its breath, drawing inward before the blast.
  //   2. KICK: when nova fires, a modest outward shove (the shockwave nudges the
  //      camera back). nova rises fast then decays, so this is the gentle punch.
  //   3. SETTLE: the kick decays with nova's tail; a damped sinusoid on the tail
  //      gives one small outward overshoot that rings back to rest, so it doesn't
  //      just deflate — it recoils and settles like a soft impact.
  // Kept subtle: a hint of pull-in, a modest outward shove, a barely-there ring —
  // enough to feel the world recoil from the blast without a big lurch.
  const charge = smoothstep01((morph - 0.34) / 0.16) * (1 - smoothstep01((morph - 0.5) / 0.06));
  const anticipation = -0.025 * charge; // pull IN up to 2.5% just before breakout
  // nova² front-loads the punch into the rise/peak; the damped ring lives on the tail.
  const kickPunch = 0.12 * nova * nova;
  const ring = 0.018 * nova * Math.sin(nova * 22.0) * (1 - nova); // one faint bounce on the decay
  const novaKick = reduced ? 1 : 1 + anticipation + kickPunch + ring;

  // camera-shake "trauma" envelope. CRUCIAL TIMING: the whiteout pass is opaque
  // while nova is near its peak (rise+hold+early decay), so a rattle that peaked
  // WITH nova would happen entirely behind the white and be invisible. Instead we
  // shape it as a hump that is ZERO at nova=1 (hidden) and PEAKS as the whiteout
  // CLEARS — nova falling through ≈0.5 — so the camera is visibly rattling exactly
  // when the remnant is first revealed, then rings out as nova → 0. 4·n·(1−n)
  // peaks at n=0.5 (=1.0) and is 0 at both ends. 0 under reduced motion.
  const shakeAmp = reduced ? 0 : 4 * nova * (1 - nova);
  // a gentle FOV breath on the detonation — the lens widens a touch then settles,
  // a faint blast-wave cue. Rides the same reveal-timed hump as the shake (peaks
  // as the whiteout clears, not behind it) so the breath is seen on the reveal.
  const fovKick = reduced ? 0 : 3.0 * shakeAmp;

  // --- hyperspace streaks (nebula → beginning dot) --------------------------
  // The dezoom from the immersed nebula (stage 3.5) out to the tiny pale-blue dot
  // (stage 4.5) is staged as a Star Wars "jump to lightspeed": radial light
  // streaks rush past a central vanishing point. The intensity is a hump over the
  // window — it punches IN fast as we leave the gas (the jump engages), holds
  // through the fastest stretch of the pull-back, then eases out as the dot
  // arrives and the field settles to stillness. Zero (rig hidden) everywhere else.
  // Reduced motion never jumps. Direction (in/out) is latched in frame() from the
  // scroll velocity, since it needs history this pure function doesn't carry.
  const STREAK_LO = 3.5; // immersed nebula (jump engages just as we leave it)
  const STREAK_HI = 4.5; // beginning dot (smear gone before the dot snaps in)
  const streakIn = smoothstep01((stage - STREAK_LO) / 0.32); // engage: fast ramp up
  const streakOut = smoothstep01((stage - (STREAK_HI - 0.42)) / 0.42); // disengage near the dot
  const streak = reduced ? 0 : streakIn * (1 - streakOut);

  // azimuth: a small extra sweep during the intro, then steady rotation.
  const introSweep = reduced ? 0 : (1 - intro) * 0.45; // eases out as we settle
  const rotation = reduced ? 0 : t * rotateSpeed;
  // quarter-circle (90°) CAMERA orbit around the shrinking black hole across stage
  // 0 → ~0.46, eased to rest so the camera is STILL when the nova fires at the
  // breakout. It saturates to a constant +π/2 well before the red-giant park begins
  // (stage 1.35), so across the park it is just a fixed azimuth baseline and never
  // fights the RED_GIANT_PARK positional slide. Pure in stage → scrolling up reverses
  // the orbit exactly (no latch, no history). Reduced motion never orbits.
  const ORBIT_END = 0.46;
  const ORBIT_MAG = Math.PI / 2;
  const orbitSweep = reduced ? 0 : ORBIT_MAG * smoothstep01(stage / ORBIT_END);

  // --- red giant → yellow star: recompose orbit (two-axis) ------------------
  // From the held off-centre limb comp, swing the camera AROUND the star on two axes
  // (azimuth + elevation) so it ends CENTRED and whole, in lockstep with the park-out
  // (createScene's parkOut runs 2.1→2.5) and the unzoom below — one combined "pull back
  // and roll to centre" gesture. The park-out removes the lateral OFFSET (translation);
  // this orbit changes the VIEWING ANGLE (which side of the sphere we see) — different
  // DOF, sharing the same 2.1→2.5 window, so they resolve to centred-and-whole exactly
  // once (no double-recentre / overshoot). Pure in stage → scrolls both ways.
  const RY_ORBIT_LO = 2.1;
  const RY_ORBIT_HI = 2.5;
  const RY_AZ_MAG = (22 * Math.PI) / 180; // ~22° azimuth swing
  const RY_ELEV_MAG = (14 * Math.PI) / 180; // ~14° pitch up (above the fixed 5° incl)
  const ryOrbitT = reduced ? 0 : smoothstep01((stage - RY_ORBIT_LO) / (RY_ORBIT_HI - RY_ORBIT_LO));
  const redYellowAz = ryOrbitT * RY_AZ_MAG;
  const redYellowElev = ryOrbitT * RY_ELEV_MAG;

  return {
    morph,
    kCollapse,
    giant,
    giantHeld,
    giantScale,
    yellow,
    nebula,
    nebulaShader,
    dot,
    collapse,
    simBlend,
    starFormed,
    cloudBright,
    flash,
    inYRWindow,
    meshSide,
    cloudSide,
    yrFlash,
    yrGrow,
    yrColor,
    sunRigVisible,
    cloudShown,
    starPtsVisible,
    starBackVisible,
    starBackBright,
    lensLive,
    starBright,
    gravityGone,
    flareAmt,
    seedZone,
    hotZone,
    baseBright,
    exGrade,
    exSat,
    bloomStrength,
    bloomRadius,
    exposure,
    olive,
    warmth,
    gradeSat,
    toneComp,
    grain,
    diskSat,
    streak,
    distFactor,
    zoom,
    novaKick,
    shakeAmp,
    fovKick,
    introSweep,
    rotation,
    orbitSweep,
    redYellowAz,
    redYellowElev,
    blackHoleScale,
  };
}
