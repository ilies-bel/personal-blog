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
// STATEFUL clock (the eased `stage`, the `intro` dezoom timing), resolves the
// scroll-anchored supernova `nova`, passes those already-computed scalars in here,
// and then just WRITES the returned StarState into uniforms/bloom/grade/camera.
//
// IMPORTANT — what is NOT here: the irreducibly stateful clock stays in frame().
// Specifically the `intro`/dezoom ramp and the per-frame `stage` smoothing are
// time- and history-dependent, so they cannot be pure. The supernova `nova` is now
// a PURE function of `stage` (a clockless, scroll-anchored Gaussian), resolved in
// frame() and passed IN the same way. Their already-resolved scalar RESULTS
// (`stage`, `t`, `nova`, `intro`) are passed IN; this function is a pure function
// of those inputs.
//
// The formulas below are a faithful, order-preserving extraction of the original
// inline math: every value is computed by the same expression, in the same order,
// from the same inputs, so the rendered hero is bit-for-bit identical.
// ===========================================================================
import {
  DOT_ACTIVE_STAGE,
  NEBULA_ACTIVE_STAGE,
  NEB_COLLAPSE_HI,
  NEB_COLLAPSE_LO,
  YELLOW_ACTIVE_STAGE,
} from './sceneTable';
// The yellow↔red renderer handoff lives in its own colocated, pure module.
import { GIANT_RADIUS_SCALE, bodyOwnership, yellowRedSwap } from './transitions';

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
  /** the shader's nebula geometry is active (the real nebula OR the collapse window AND its
   *  floor crossfade — held via inWindowGeo so the cloud reads as converging gas through the
   *  floor, never the shader's red-giant default). uNebula. */
  nebulaShader: boolean;
  /** pale-blue-dot slot active (stage ≥ 4.5). uDot. */
  dot: boolean;
  /** dot → nebula linear growth, 0 at the point and 1 at the settled cloud. uNebulaGrow. */
  nebulaGrow: number;

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
  const { stage, reduced, nova, cfg } = input;

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

  // --- supernova flash: scroll-anchored envelope (Gaussian in stage), so the
  // particle blast is deterministic and reversible ---
  // the particle-side shock-breakout glow follows the SAME envelope as the
  // whiteout, so the additive blast core peaks together with the screen flash.
  const flash = 1.45 * nova;

  // --- transitions 3-5: yellow star → nebula → pale blue dot ---
  // REVIEW MODE (placeholders, no real morph): the new states HARD-SWAP — each
  // slot snaps to that state's stand-in at the stage midpoint so its look + slot
  // can be reviewed in isolation.
  //   yellow star  : active across stage 2→3  (snap at 2.5)
  //   nebula       : active across stage 3→4  (snap at 3.5)
  //   pale blue dot: active across stage 4→5  (snap at 4.5)
  const yellow = stage >= YELLOW_ACTIVE_STAGE;
  const nebula = stage >= NEBULA_ACTIVE_STAGE;
  const dot = stage >= DOT_ACTIVE_STAGE;
  const nebulaGrow = Math.min(Math.max((DOT_ACTIVE_STAGE - stage) / (DOT_ACTIVE_STAGE - 3.42), 0), 1);
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
  // NEB_COLLAPSE_HI (3.5, dispersed nebula) / NEB_COLLAPSE_LO (3.0, window floor —
  // the yellow-mesh slot already owns 2.7–3.5) now live in sceneTable.ts.
  const inWindow = stage > NEB_COLLAPSE_LO && stage < NEB_COLLAPSE_HI ? 1 : 0;
  // The collapse GEOMETRY scalars (prog/collapse/simBlend) use an EXTENDED gate that
  // also covers the floor CROSSFADE band (NEB_COLLAPSE_LO-0.05 → NEB_COLLAPSE_LO, i.e.
  // 2.95→3.0, where bodyOwnership dissolves the cloud into the formed yellow mesh).
  // Without this, those scalars hard-snapped to 0 at the floor — so the sim-collapsed
  // (converged, blue) gas reverted to the analytic DISPERSED nebula for the few eased
  // frames the cloud is still shown there, a visible "gas re-expands / turns orange"
  // pop right where the old red-giant flashed. Holding the geometry gate across the
  // crossfade keeps the gas CONVERGED on the forming core (collapse≈1, simBlend held)
  // so it dissolves cleanly under the mesh. The DERIVED consumers (`collapsing`, the
  // grade, the starfield gate) still key off the unextended `inWindow` so their timing
  // is byte-identical — only the cloud's own geometry/density is held through the floor.
  const FLOOR_XFADE = 0.05; // mirror transitions.ts' COLLAPSE_FLOOR_XFADE (the bodyOwnership band)
  const inWindowGeo = stage > NEB_COLLAPSE_LO - FLOOR_XFADE && stage < NEB_COLLAPSE_HI ? 1 : 0;
  // ONE smooth window progress drives everything so density and star size move on
  // a single INVERTED scale (no field racing ahead of another): prog = 0 at the
  // dispersed nebula (3.5) → 1 right at the window floor (3.0), then HELD at 1 across
  // the floor crossfade (the smoothstep clamps ≥1 below 3.0, gated by inWindowGeo so it
  // still zeroes out for the yellow star / red giant below the crossfade). Spanning the
  // WHOLE window (not a narrow sub-band) makes the transition fluid — the star grows
  // gradually and the gas thins gradually across the entire scroll, in lockstep.
  const prog = inWindowGeo * smoothstep01((NEB_COLLAPSE_HI - stage) / (NEB_COLLAPSE_HI - NEB_COLLAPSE_LO));
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
  // sim owns the disk across the window and HOLDS near full through the deep end so
  // the accreting gas keeps reading right up to the floor (no bare-core frame). It
  // eases in over a wide edge band (/0.16) and only tapers in the final stretch
  // (1 - 0.45*prog, not 0.85) so the sim-driven infall doesn't thin out early.
  // simBlend uses the EXTENDED geo gate too, so the sim-collapsed (converged) gas is
  // held through the floor crossfade instead of snapping back to the analytic dispersed
  // nebula. At the floor prog≈1, so it sits at its window-floor value (≈0.55) across the
  // band — the gas stays piled on the core as it dissolves under the mesh.
  const simBlend = inWindowGeo * smoothstep01((NEB_COLLAPSE_HI - stage) / 0.16) * (1 - 0.45 * prog);
  // cloud DENSITY/brightness fades the gas as the star forms — but the OLD curve
  // ((1-prog)^1.6) crashed to ~0 by prog≈0.85 while the star (prog^1.8) was only ~0.7
  // formed, leaving a frame with the gas GONE and a bare bright core on black (the
  // "nebula vanishes at the start of star creation" bug). Now the gas HOLDS near full
  // through prog≈0.6 then fades out only across 0.6→0.99, so it clears exactly as the
  // star completes — a true cross-fade, never a gap. feedBump still glows the
  // mid-window convergence (light pouring into the core). 1 (no-op) outside the window.
  const feedBump = 5.2 * prog * (1 - prog); // 0→1→0, peaks mid-window (brighter convergence)
  const invDensity = 1 - smoothstep01((prog - 0.6) / (0.99 - 0.6)); // 1 until 0.6, then →0 by 0.99
  const cloudBright = 1 + inWindow * ((1 + 0.8 * feedBump) * invDensity - 1);
  // the shader runs its nebula geometry across the real nebula AND the collapse
  // window, so `pos` holds the analytic nebula placement (the sim's seed/home)
  // whenever the sim blend is active.
  const nebulaShader = nebula || simBlend > 0.001;

  // --- yellow star → red giant: FLASH-SWAP transition ----------------------
  // The yellow↔red renderer handoff (window/side flags + flash/grow/colour curves)
  // is owned by transitions.ts — the colocated, pure module for this swap. The math
  // is unchanged (same SWAP_STAGE etc.); it just lives in one home now.
  const { inYRWindow, meshSide, cloudSide, yrFlash, yrGrow, yrColor } = yellowRedSwap(stage, nebula);

  // --- BODY OWNERSHIP (single source of truth) -----------------------------
  // Exactly two foreground bodies can render: the point CLOUD (nebula / dot /
  // red giant / collapse gas) and the MESH yellow star. Which one owns each
  // frame used to be decided by several overlapping predicates whose boundaries
  // only ALMOST lined up — every mismatch was a gap (wrong fallthrough body
  // flashes) or a bleed (two bodies at once). This block is the ONE place that
  // decides ownership, as a TOTAL banded function of `stage`: every stage maps
  // to a body, and the two bodies are mutually exclusive except in the two
  // short, DECLARED crossfade bands (the collapse floor at 3.0, and the
  // yellow<->red swap at SWAP_STAGE). cloudShown / sunRigVisible are projected
  // from it, so they can never gap or bleed by construction.
  //
  // Bands (high stage = top of page):
  //   stage >= 3.5            CLOUD            nebula + dot
  //   3.0  <  stage < 3.5     CLOUD (+mesh fades in UNDER it near the floor)
  //   2.95 <  stage <= 3.0    CLOUD->MESH      collapse-floor crossfade
  //   SWAP <  stage <= 2.95   MESH             settled yellow star
  //   SWAP-0.03 < stage <=SWAP MESH->CLOUD     flash-swap crossfade
  //   stage <= SWAP-0.03      CLOUD            red giant / below
  // Per-body presence weights, owned by transitions.ts. cloudW/meshW are
  // booleans-as-weights; a body renders iff its weight > 0. The only places BOTH
  // are > 0 are the two declared crossfade bands (handoffs that dissolve under
  // bloom). The 6-branch ladder is identical — just relocated to its colocated
  // home; `starFormed` (computed above) is passed in so the value is computed once.
  const { cloudW, meshW } = bodyOwnership(stage, starFormed);
  // `collapsing` retained as a DERIVED alias for the grade/dome/starfield
  // consumers below (they ask "are we inside the gas-collapse window?"). It is
  // now simply the collapse window membership — no density-epsilon gate, so it
  // can't dead-band against the nebula threshold.
  const collapsing = inWindow === 1;

  // Projected from the single ownership model above — gap-free and bleed-free by
  // construction. A body renders iff its presence weight is non-zero.
  const cloudShown = cloudW > 0.001;
  const sunRigVisible = meshW > 0.001;
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
  // read as a small DARK point, not a bloomed glow. Narrow + EARLY (centred 0.42)
  // so it releases by the breakout and stops cancelling the flash.
  const seedZone = Math.exp(-Math.pow((morph - 0.42) / 0.035, 2.0));
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
  // medium, dense held size (world radius 10.5). The "keep all three in sync" scale
  // (buildDisk uGiantScale, createScene RED_GIANT_RADIUS, this) now has ONE source:
  // GIANT_RADIUS_SCALE in transitions.ts.
  const GIANT_FULL = GIANT_RADIUS_SCALE;
  const giantScale = GIANT_FULL;

  // --- hyperspace streaks (dot ⇄ nebula) -----------------------------------
  // Radial light streaks live across the dot approach and linger into the small-
  // nebula arrival, so the first cloud frame reads as a lightspeed destination
  // growing toward us. In the reverse read, the same envelope still eases away
  // before the dot parks. Reduced motion never jumps. Direction (in/out) is
  // latched in frame() from scroll velocity, since this pure function has no
  // history.
  const STREAK_LO = 3.32; // fade across the first nebula-arrival frames
  const STREAK_HI = 4.72; // top dot frame; keeps the first still point mostly clean
  const STREAK_IN_WIDTH = 0.36;
  const STREAK_DOT_FADE = 0.4;
  const streakIn = smoothstep01((stage - STREAK_LO) / STREAK_IN_WIDTH);
  const streakOut = smoothstep01((stage - (STREAK_HI - STREAK_DOT_FADE)) / STREAK_DOT_FADE);
  const streak = reduced ? 0 : streakIn * (1 - streakOut);

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
    nebulaGrow,
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
    blackHoleScale,
  };
}
