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
  /** nebula slot active (stage ≥ 3.5). uNebula. */
  nebula: boolean;
  /** pale-blue-dot slot active (stage ≥ 4.5). uDot. */
  dot: boolean;

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
  /** final disk in-shader saturation (after sun/nebula overrides). uSat (disk). */
  diskSat: number;

  // --- camera scale story ---
  /** dezoom distance factor (NEAR_FACTOR → 1 across the intro). */
  distFactor: number;
  /** lifecycle zoom choreography multiplier. */
  zoom: number;
  /** subtle outward shove timed to the blast (rides nova). */
  novaKick: number;
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

  // --- yellow star → red giant: FLASH-SWAP transition ----------------------
  // Direction (lifecycle plays in reverse on scroll-down): the YELLOW STAR
  // (mesh sun rig — small, gold, textured) becomes the RED GIANT (point cloud —
  // big, deep red, grainy) as `stage` falls 3 → 2. The two bodies have totally
  // different textures, so they DON'T crossfade co-located. Instead a subtle
  // light flash fires at SWAP_STAGE and the mesh hands off to a gold particle
  // sphere that grows + cools to the red giant.
  const SWAP_STAGE = 2.7; // flash peak / mesh↔cloud crossover
  const inYRWindow = stage > 2.05 && stage < 3.5 && !nebula; // the whole yellow→red slot
  const meshSide = inYRWindow && stage > SWAP_STAGE; // 2.70 .. 3.5 → yellow mesh
  const cloudSide = inYRWindow && stage <= SWAP_STAGE; // 2.05 .. 2.70 → particle body

  // subtle flash envelope (its own stage-space gaussian, separate from the
  // supernova flash which lives in morph space and is tied to stage 0→1).
  const YR_FLASH_SIGMA = 0.05;
  const yrFlash = inYRWindow ? Math.exp(-Math.pow((stage - SWAP_STAGE) / YR_FLASH_SIGMA, 2.0)) : 0;

  // grow + colour curves (single monotonic smoothsteps of the falling stage;
  // colour LEADS grow slightly so it cools then settles — "light leads size").
  const yrGrow = smoothstep01((SWAP_STAGE - stage) / (SWAP_STAGE - 2.2)); // 0@2.70 → 1@2.20
  const yrColor = smoothstep01((SWAP_STAGE + 0.02 - stage) / (SWAP_STAGE + 0.02 - 2.3)); // → 1@~2.30

  // Mesh visible across its side, plus a short overhang into the bright flash so
  // the handoff cross-dissolves under the bloom rather than hard-cutting.
  const sunRigVisible = inYRWindow && stage > SWAP_STAGE - 0.05;
  // Inside the slot, the cloud body only shows on the cloud side (the opaque mesh
  // owns the yellow side); outside the slot the cloud renders everything.
  const cloudShown = inYRWindow ? cloudSide : true;
  // Hide the lensed background starfield while the opaque mesh body is present;
  // ALSO hide it across the NEBULA (the remnant sits alone against pure black).
  const starPtsVisible = (inYRWindow ? cloudSide : true) && !nebula;

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

  // bloom radius defaults to the resting value; the branches below override it.
  let bloomRadius = cfg.bloomRad;

  // --- sun grade: bold, saturated, un-washed. The yellow star reads as vivid
  // gold; the RED GIANT reads as a big, deep, matte red star. The red giant is
  // crossfaded in over the gather so the explosion grade hands off cleanly.
  const redGiantPhase = cloudSide || (giantHeld > 0.5 && !yellow && !nebula && !dot);
  const yrPunch = yrFlash; // 0..1 subtle swap-flash envelope
  if (sunWindow) {
    // The yellow star is the MESH sun rig (bright, opaque, real photosphere). Push
    // exposure + bloom UP and keep the grade out of the way: no tone-map crush, no
    // olive, no desaturation — let the bright gold body and white-hot limb survive.
    bloomStrength = 0.7 + 0.12 * yrPunch; // bright limb/corona halo + subtle swap flash
    bloomRadius = 0.5; // tighter so the solid sphere edge stays defined
    exposure = 1.0 * (1 + 0.05 * yrPunch);
    olive = 0.0;
    warmth = 0.0;
    gradeSat = 1.0; // full saturation → vivid gold
  } else if (redGiantPhase) {
    // rg crossfades the grade from the bright gold swap-in (rg=0, still flashing)
    // to the settled dim matte red giant (rg=1). On the cloud side it follows
    // yrColor; below the slot it is pinned to 1.
    const rg = cloudSide ? yrColor : 1;
    bloomStrength = (0.7 + 0.12 * yrPunch) * (1 - rg) + 0.22 * rg; // subtle flash → dim halo
    bloomRadius = cfg.bloomRad;
    exposure = 1.0 * (1 + 0.05 * yrPunch) * (1 - rg) + cfg.exposure * 0.7 * rg;
    olive = 0.0; // no olive cast on the star
    warmth = 0.14 * rg; // warm the matte red
    gradeSat = 1.0; // full saturation throughout
    diskSat = 1.0;
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
    const ZOOM_HERO = 0.6; // close at the hero BH → dist≈12 (BH fills the frame)
    const ZOOM_SEED = 2.6; // far at the seed     → dist≈52 (speck in a vast field)
    const ZOOM_BLAST = 2.0; // pulled back across the blast → dist≈40 (big remnant fits)
    const ZOOM_OUT = 1.0; // resting at the red giant
    // hero push-in eases out as the implosion gets underway (stage 0 → 0.18)
    const heroT = smoothstep01(stage / 0.18);
    // seed pull-back, IN SYNC with the world-space seed collapse (0.18 → 0.46)
    const shrinkT = smoothstep01((stage - 0.18) / (0.46 - 0.18));
    // hold WAY back across the blast so the now-much-bigger ejecta stays framed —
    // ease from the seed distance to the blast hold as the shell breaks out
    // (0.46 → 0.62), then keep it wide through the blast.
    const blastT = smoothstep01((stage - 0.46) / (0.62 - 0.46));
    // grow back to resting only ABOVE the collapse window (stage 1.05 → 1.5), so the
    // camera stays pulled WAY back across the whole surface-collapse/spike window
    // (stage 0.5–1.05) — the finger-spikes reach ~10 units and would clip the frame
    // at the resting distance, so they need the blast hold to stay framed.
    const growT = easeOut(Math.min(Math.max((stage - 1.05) / 0.45, 0), 1));
    const heroZoom = ZOOM_HERO + (1.0 - ZOOM_HERO) * heroT; // 0.6 → 1.0
    const seedZoom = heroZoom + (ZOOM_SEED - heroZoom) * shrinkT; // → 2.6
    const blastZoom = seedZoom + (ZOOM_BLAST - seedZoom) * blastT; // 2.6 → 2.0
    zoom = blastZoom + (ZOOM_OUT - blastZoom) * growT; // → 1.0
    // nebula: view the sprawling cloud from OUTSIDE so it reads as a SHAPE sitting in
    // the frame (like a real Eagle/Carina image) rather than radiating from the centre
    // — sitting inside it made every wisp read as a spoke. Pull back a touch so the
    // whole irregular cloud is framed with dark space around it. Ease in as the nebula
    // arrives (3.1 → 3.7), hold, then pull further OUT toward the pale blue dot
    // (4.3 → 4.7) so the dot reads tiny.
    const ZOOM_NEBULA = 1.32; // dist≈26 → the sprawling cloud fills most of the frame
    const ZOOM_DOT = 2.4; // pull back out so the pale blue dot is a far speck
    const nebIn = smoothstep01((stage - 3.1) / 0.6);
    const nebOut = smoothstep01((stage - 4.3) / 0.4);
    zoom = zoom + (ZOOM_NEBULA - zoom) * nebIn; // ease into the cloud
    zoom = zoom + (ZOOM_DOT - zoom) * nebOut; // ease back out for the dot
  }
  // a subtle outward shove timed to the blast (rides the TIME envelope, so a fast
  // scroller still feels the world recoil from the detonation). Kept tiny so the
  // scroll-coupled zoom choreography stays the primary camera language.
  const novaKick = 1 + 0.06 * nova;

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
    dot,
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
    diskSat,
    distFactor,
    zoom,
    novaKick,
    introSweep,
    rotation,
  };
}
