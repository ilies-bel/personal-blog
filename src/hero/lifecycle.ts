// ===========================================================================
// lifecycle.ts — the reverse stellar-lifecycle choreography, as a PURE function.
//
// The hero plays the stellar lifecycle BACKWARDS as the visitor scrolls:
//
//     black hole → supernova bridge → red giant → yellow star → nebula → dot
//
// (see CLAUDE.md for the full stage→state map). The BlackHole scene's per-frame
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
  const COLLAPSE_HI = 1.05; // stage where the surface is still the full sphere
  const COLLAPSE_LO = 0.5; // stage where the surface has shrunk to the point
  const kCollapse = Math.min(1, Math.max(0, (COLLAPSE_HI - stage) / (COLLAPSE_HI - COLLAPSE_LO)));
  // `giant` now means "the sphere-identity model is active" — it must be 1 across
  // the ENTIRE collapse window so the unified surface block owns the geometry (no
  // co-existing radial blast → no two-scale artifact). It rises as we leave the
  // black-hole side (stage 0.5 → 1.05) and stays 1 for the red giant and above.
  const giant = Math.min(1, Math.max(0, (stage - COLLAPSE_LO) / (COLLAPSE_HI - COLLAPSE_LO)));

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
  // `collapse` is the GPGPU drive. It LEADS the star growth (prog^0.7 ramps faster
  // than prog) so the gas physically falls inward and piles onto the core BEFORE
  // the star reaches full size — the inflow visibly FEEDS the star rather than the
  // star appearing and the gas catching up.
  const collapse = Math.pow(prog, 0.7);
  // star GROWTH is deliberately SLOW: prog^2.4 keeps the star tiny through the
  // first ~two-thirds of the window and grows it mostly in the final stretch, so
  // you watch a small seed being fed for a long time before it inflates. Visual
  // size is `0.05 + 0.95*starFormed` in frame() (small → full).
  const starFormed = Math.pow(prog, 2.4);
  // sim owns the disk just inside the window; fades as the mesh takes the core.
  const simBlend = inWindow * smoothstep01((NEB_COLLAPSE_HI - stage) / 0.1) * (1 - 0.85 * prog);
  // cloud DENSITY/brightness is the INVERSE of star size: as the star grows
  // (prog→1) the gas thins to almost nothing (mass moved INTO the star). The fade
  // is shaped (1-prog)^1.5 so the gas stays present through the first half (you see
  // it fall) then clears decisively in the second half so the forming blue star
  // reveals instead of being washed by additive gas in front. A small mid-window
  // glow bump reads as light pouring in. 1 (no-op) outside the window.
  const feedBump = 4 * prog * (1 - prog); // 0→1→0, peaks mid-window
  // gas stays visibly present LONGER (^1.6, not ^2.2) so you watch MORE particles
  // stream inward and feed the star before the cloud finally clears.
  const invDensity = Math.pow(1 - prog, 1.6); // 1 → 0
  const cloudBright = 1 + inWindow * ((1 + 0.55 * feedBump) * invDensity - 1);
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
  const SWAP_STAGE = 2.74; // flash peak / mesh↔cloud crossover
  const inYRWindow = stage > 2.05 && stage < 3.5 && !nebula; // the whole yellow→red slot
  const meshSide = inYRWindow && stage > SWAP_STAGE; // 2.74 .. 3.5 → yellow mesh
  const cloudSide = inYRWindow && stage <= SWAP_STAGE; // 2.05 .. 2.74 → particle body

  // subtle flash envelope (its own stage-space gaussian, separate from the
  // supernova flash which lives in morph space and is tied to stage 0→1).
  const YR_FLASH_SIGMA = 0.05;
  const yrFlash = inYRWindow ? Math.exp(-Math.pow((stage - SWAP_STAGE) / YR_FLASH_SIGMA, 2.0)) : 0;

  // grow + colour curves. On scroll-down the red giant must HOLD as a composed
  // sphere while its copy is readable, then shrink/cool into the yellow handoff
  // only after the red text has left. The close-up transition can therefore use a
  // full red sphere as the wipe instead of racing the copy.
  const RED_EXIT_START = 2.56;
  const RED_COLOR_EXIT_START = 2.60;
  const yrGrow = 1 - smoothstep01((stage - RED_EXIT_START) / (SWAP_STAGE - RED_EXIT_START));
  const yrColor = 1 - smoothstep01((stage - RED_COLOR_EXIT_START) / (SWAP_STAGE - RED_COLOR_EXIT_START));

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
  const baseBright = 1.25 * (1 - 0.92 * hotZone);

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
    // The dying star is deliberately fragile: smaller, darker, and isolated on
    // black. It should not compete with the red giant or the nebula release.
    bloomStrength = 0.34 + 0.08 * yrPunch;
    bloomRadius = 0.34;
    exposure = 0.62 * (1 + 0.04 * yrPunch);
    olive = 0.0;
    warmth = -0.02;
    gradeSat = 0.76;
  } else if (redGiantPhase) {
    // rg crossfades the grade from the bright gold swap-in (rg=0, still flashing)
    // to the settled dim matte red giant (rg=1). On the cloud side it follows
    // yrColor; below the slot it is pinned to 1.
    const rg = cloudSide ? yrColor : 1;
    bloomStrength = (0.34 + 0.08 * yrPunch) * (1 - rg) + 0.32 * rg; // fragile star → broad dim halo
    bloomRadius = cfg.bloomRad * (1 - rg) + 0.68 * rg;
    const yellowExposure = 0.62 * (1 + 0.04 * yrPunch);
    const redExposure = cfg.exposure * 0.78;
    exposure = yellowExposure * (1 - rg) + redExposure * rg;
    olive = 0.0; // no olive cast on the star
    warmth = 0.14 * rg; // warm the matte red
    gradeSat = 1.0; // full saturation throughout
    diskSat = 1.0;
    // The dome was tuned to read at the bright yellow grade; the red giant grades
    // DARKER (redExposure < yellowExposure), which would crush the dim backdrop
    // stars to black. Brighten the dome by the inverse exposure ratio so the SAME
    // star field survives behind the red giant exactly as it does behind the yellow
    // star. Ramps with rg (the swap-in is still bright → no boost needed there).
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
    grain = 0.035;
  } else {
    bloomRadius = cfg.bloomRad;
  }

  // dezoom distance factor (0 close → 1 rest). Reduced motion lands at the rest frame.
  const distFactor = nearFactor + (1 - nearFactor) * intro;

  // --- lifecycle zoom choreography (the scale story) ---
  // A black hole is tiny-but-massive; a star is huge-but-diffuse. The scale story
  // is told by the CAMERA: sit CLOSE on the hero black hole, rocket WAY BACK as the
  // matter collapses to its speck, then ease back to resting for the red giant. The
  // size ranking reads BH(close) > red giant > seed(far). Reduced motion = 1.
  let zoom = 1.0;
  if (!reduced) {
    const ZOOM_HERO = 0.56; // close at the hero BH → dist≈11 (BH fills the frame)
    const ZOOM_SEED = 2.6; // far at the seed     → dist≈52 (speck in a vast field)
    const ZOOM_BLAST = 2.0; // pulled back across the blast → dist≈40 (big remnant fits)
    const ZOOM_RED_HOLD = 4.10; // composed red giant hold with room for lower-left copy
    const ZOOM_RED_WIPE = 1.15; // close transition after red copy has faded
    // hero push-in eases out as the implosion gets underway (stage 0 → 0.18)
    const heroT = smoothstep01(stage / 0.18);
    // seed pull-back, IN SYNC with the world-space seed collapse (0.18 → 0.46)
    const shrinkT = smoothstep01((stage - 0.18) / (0.46 - 0.18));
    // hold WAY back across the blast so the now-much-bigger ejecta stays framed —
    // ease from the seed distance to the blast hold as the shell breaks out
    // (0.46 → 0.62), then keep it wide through the blast.
    const blastT = smoothstep01((stage - 0.46) / (0.62 - 0.46));
    // Above the collapse window, pull farther back into a stable, composed red-giant
    // hold. Only after the red copy fades do we push in for a short texture wipe.
    const growT = easeOut(Math.min(Math.max((stage - 1.05) / 0.50, 0), 1));
    const redWipeT = smoothstep01((stage - 2.30) / (2.56 - 2.30));
    const heroZoom = ZOOM_HERO + (1.0 - ZOOM_HERO) * heroT; // 0.6 → 1.0
    const seedZoom = heroZoom + (ZOOM_SEED - heroZoom) * shrinkT; // → 2.6
    const blastZoom = seedZoom + (ZOOM_BLAST - seedZoom) * blastT; // 2.6 → 2.0
    const redHoldZoom = blastZoom + (ZOOM_RED_HOLD - blastZoom) * growT;
    zoom = redHoldZoom + (ZOOM_RED_WIPE - redHoldZoom) * redWipeT;
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

  return {
    morph,
    kCollapse,
    giant,
    giantHeld,
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
  };
}
