// ===========================================================================
// transitions.ts — the yellow-star ⇄ red-giant renderer handoff, as ONE named,
// colocated, PURE module.
//
// THE PROBLEM THIS SOLVES. The hardest beat in the hero is the swap between two
// *different renderers*: the yellow star is a textured MESH "sun rig"
// (buildSunRig.ts) and the red giant is the ~1.2M-point GPU "cloud" (buildDisk.ts
// + disk.glsl.ts). Because they're different renderers they can't cross-fade
// co-located; the handoff is instead a flash-swap whose timing + sizing was
// spread across FOUR files whose constants had to agree BY HAND:
//   • the size factor 0.18 (dying-star radius ÷ red-giant radius) was hardcoded
//     THREE times independently — createScene's SUN_RIG_RADIUS, the gravity sim's
//     coreR, and the disk vertex shader's `mix(0.18, 1.0, uYrGrow)`;
//   • the giant size scale 10.5/4.2 ("keep all three in sync") lived in lifecycle
//     (GIANT_FULL), createScene (RED_GIANT_RADIUS) and buildDisk (uGiantScale);
//   • the 6-branch body-ownership ladder (which renderer owns each frame) lived
//     inline in lifecycle().
//
// This module gives that handoff ONE home. It is PURE — no THREE, no DOM, no
// React, no uniform writes — so it stays trivially testable and the relocation is
// provably behaviour-preserving. lifecycle.ts CALLS the functions here instead of
// inlining the math; createScene.ts and the shader IMPORT / comment-link the
// de-duplicated constants. Every smoothstep, threshold and branch boundary is
// byte-identical to the former inline code — this is RELOCATION + DE-DUPLICATION,
// never a re-timing.
// ===========================================================================
import { smoothstep01 } from './lifecycle';
import {
  NEBULA_ACTIVE_STAGE,
  NEB_COLLAPSE_LO,
  RED_COLOR_EXIT_START,
  RED_EXIT_START,
  RED_SHRINK_END,
  SWAP_STAGE,
  SWAP_XFADE,
} from './sceneTable';

// ---------------------------------------------------------------------------
// DE-DUPLICATED CONSTANTS — the values that several files used to hardcode and
// keep in agreement by hand. ONE definition each; the consumers import from here.
// ---------------------------------------------------------------------------

/**
 * The dying-star size factor: the yellow mesh's radius ÷ the red-giant radius.
 *
 * SINGLE SOURCE OF TRUTH for the 0.18 that used to be hardcoded independently in:
 *   • createScene.ts  — `SUN_RIG_RADIUS = RED_GIANT_RADIUS * 0.18` (mesh size)
 *   • createScene.ts  — the gravity sim seed `coreR: SUN_RIG_RADIUS`
 *   • disk.glsl.ts    — the cloud vertex shader's `mix(0.18, 1.0, uYrGrow)` grow
 *
 * createScene imports this directly. The SHADER is raw GLSL, so it interpolates
 * this value into its template at assembly time (see disk.glsl.ts) — verified to
 * produce the byte-identical literal `0.18`. They MUST match or the gold particle
 * sphere is not size-matched to the mesh at the swap (a visible pop).
 */
export const YELLOW_RED_RADIUS_RATIO = 0.18;

/**
 * The held red-giant size scale (× uGiantR=4.2 → world radius 10.5). The comment
 * trio "keep all three in sync" referred to:
 *   • lifecycle.ts    — `GIANT_FULL = 10.5 / 4.2`
 *   • createScene.ts  — `RED_GIANT_RADIUS = 4.2 * (10.5 / 4.2)`
 *   • buildDisk.ts    — the `uGiantScale` default `10.5 / 4.2`
 *
 * lifecycle and createScene import this as their single source. (buildDisk's
 * uniform default is comment-linked to here — see buildDisk.ts — because it is a
 * plain default that must read at a glance next to the other uGiant* uniforms.)
 */
export const GIANT_RADIUS_SCALE = 10.5 / 4.2;

// ---------------------------------------------------------------------------
// YELLOW ⇄ RED SWAP — window membership + flash/grow/colour curves.
//
// Relocated verbatim from lifecycle.ts (the block around lines 380-401). Same
// thresholds (SWAP_STAGE etc.), same gaussian, same smoothsteps — only moved.
// ---------------------------------------------------------------------------

/** The window/side flags + flash/grow/colour curves of the yellow⇄red handoff. */
export interface YellowRedSwap {
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
}

/**
 * Pure: the yellow-star → red-giant flash-swap state for a lifecycle `stage`.
 *
 * Direction (lifecycle plays in reverse on scroll-down): the YELLOW STAR (mesh sun
 * rig — small, gold, textured) becomes the RED GIANT (point cloud — big, deep red,
 * grainy) as `stage` falls 3 → 2. The two bodies have totally different textures,
 * so they DON'T crossfade co-located. Instead a subtle light flash fires at
 * SWAP_STAGE and the mesh hands off to a gold particle sphere that grows + cools
 * to the red giant.
 *
 * @param nebula whether the nebula slot is active (lifecycle's `nebula`); the YR
 *   window is gated off once the nebula owns the geometry.
 */
export function yellowRedSwap(stage: number, nebula: boolean): YellowRedSwap {
  const inYRWindow = stage >= 2.05 && stage < 3.5 && !nebula; // the whole yellow→red slot (inclusive lower bound so the held red-giant beat at exactly stage 2.05 is interactive)
  const meshSide = inYRWindow && stage > SWAP_STAGE; // 2.88 .. 3.5 → yellow mesh
  const cloudSide = inYRWindow && stage <= SWAP_STAGE; // 2.05 .. 2.88 → particle body (owns the shrink)

  // SWAP FLASH — REMOVED. The cloud→mesh handoff used to be a HARD FLIP at SWAP_STAGE
  // masked by a stage-space gaussian whiteout (this field). The flip is now a real,
  // tight CROSS-DISSOLVE (see bodyOwnership): across a narrow band the cloud (by now a
  // small gold ball, size-matched + co-located with the mesh) fades out as the mesh
  // fades in, so there is no longer a hard pop to mask. We pin the flash to 0 so the
  // dissolve is NOT accompanied by a whiteout. The field is KEPT (uYrFlash still reads
  // it, and the grade's `yrPunch` term still multiplies it) so the wiring stays intact
  // and re-enabling a faint cue is a one-line change — it is simply 0 now, which makes
  // every `yrPunch`/`uYrFlash` consumer a clean no-op.
  const yrFlash = 0;

  // grow + colour curves. The red giant holds full size while parked, then — once the
  // recompose orbit + unzoom have centred it (stage ~2.5) — SMOOTHLY CONTRACTS from full
  // (~9 units) down to the yellow size (~1.6, = full × 0.18 in the shader) across a
  // GENEROUS window so it's a continuous shrink, not the old 0.18-stage snap. The colour
  // reddens→gold across the same window so it cools to a smooth gold ball exactly as it
  // reaches the small size — primed for a seamless mesh handoff. Decoupled from SWAP_STAGE
  // (explicit RED_SHRINK_END) so the cloud finishes shrinking BEFORE the mesh swaps in.
  // RED_EXIT_START (2.5, shrink begins right after the recompose lands),
  // RED_COLOR_EXIT_START (2.52, colour cools just behind the size) and
  // RED_SHRINK_END (2.85, fully shrunk to yellow size before the 2.88 swap) live in
  // sceneTable.ts.
  const yrGrow = 1 - smoothstep01((stage - RED_EXIT_START) / (RED_SHRINK_END - RED_EXIT_START));
  const yrColor = 1 - smoothstep01((stage - RED_COLOR_EXIT_START) / (RED_SHRINK_END - RED_COLOR_EXIT_START));

  return { inYRWindow, meshSide, cloudSide, yrFlash, yrGrow, yrColor };
}

// ---------------------------------------------------------------------------
// BODY OWNERSHIP — which renderer owns each frame.
//
// Relocated verbatim from lifecycle.ts (the 6-branch ladder around lines 422-458).
// Same constants, same branch boundaries, same smoothsteps — only moved. The
// helper inputs the ladder reads (`starFormed`, `meshFormIn`) are PASSED IN so
// this stays pure and the values are computed once in lifecycle().
// ---------------------------------------------------------------------------

/** Per-renderer presence weights. A body renders iff its weight > 0; both are > 0
 *  only in the two declared crossfade bands. */
export interface BodyOwnership {
  /** the point CLOUD (nebula / dot / red giant / collapse gas) presence weight. */
  cloudW: number;
  /** the MESH yellow star presence weight. */
  meshW: number;
}

/**
 * Pure: decides which foreground body (the point CLOUD or the MESH yellow star)
 * owns this frame, as a TOTAL banded function of `stage`.
 *
 * Exactly two foreground bodies can render: the point CLOUD (nebula / dot / red
 * giant / collapse gas) and the MESH yellow star. Which one owns each frame used
 * to be decided by several overlapping predicates whose boundaries only ALMOST
 * lined up — every mismatch was a gap (wrong fallthrough body flashes) or a bleed
 * (two bodies at once). This is the ONE place that decides ownership: every stage
 * maps to a body, and the two bodies are mutually exclusive except in the TWO
 * short, DECLARED crossfade bands (the collapse floor at 3.0, and the yellow↔red
 * swap at SWAP_STAGE).
 *
 * The yellow↔red swap used to be a HARD FLIP masked by a yrFlash whiteout, because
 * the ~1.2M-point red-giant cloud rendering BEHIND the still-opaque yellow mesh
 * flashed reddish grain behind the small gold sun. It is now a real but VERY TIGHT
 * CROSS-DISSOLVE over [SWAP_STAGE - SWAP_XFADE, SWAP_STAGE] (≈ stage 2.86→2.88). The
 * grain risk is contained because the overlap band sits ABOVE RED_SHRINK_END (2.85):
 * by the time the two bodies coexist the cloud is ALREADY fully shrunk to yellow size
 * (yrGrow→0) and fully cooled to gold (yrColor→0), co-located with the mesh at the
 * origin — so the dissolve just trades one small gold ball for another, never a big
 * red cloud behind the sun. lifecycle()'s cloudShown / sunRigVisible (booleans) and
 * the sun-rig opacity / cloud brightness are projected from these weights, so the two
 * bodies render PARTIALLY TRANSPARENT in the overlap (a true dissolve, not on/off).
 *
 * Bands (high stage = top of page):
 *   stage >= 3.5                       CLOUD       nebula + dot
 *   3.0  <  stage < 3.5                 CLOUD (+mesh fades in UNDER it near the floor)
 *   2.95 <  stage <= 3.0                CLOUD->MESH collapse-floor crossfade
 *   SWAP        <  stage <= 2.95        MESH        settled yellow star
 *   SWAP-XFADE  <  stage <= SWAP        CLOUD<->MESH yellow↔red CROSS-DISSOLVE
 *   stage <= SWAP-XFADE                 CLOUD       red giant / below
 *
 * @param starFormed the mesh-star reveal ramp (lifecycle's `starFormed`); used to
 *   reveal the forming mesh under the dense gas only as the star nears completion.
 */
export function bodyOwnership(stage: number, starFormed: number): BodyOwnership {
  const COLLAPSE_FLOOR_XFADE = 0.05; // 3.00 -> 2.95: cloud yields to the formed mesh
  // mesh reveal INSIDE the collapse window: make the forming mesh VISIBLE as soon as a
  // SEED exists, so the small star is on screen for the WHOLE growth arc (tiny blue dot →
  // grows → warms to gold → textures into the full sun).
  //
  // REVEAL PULLED WAY EARLY (was starFormed 0.80→1.0): the prior late gate kept the star
  // INVISIBLE until starFormed ≥ 0.80, which is exactly the slice where it is ALSO warming
  // to gold + texturing — so the brief blue/clean window happened while opacity was ~0, and
  // by the time the mesh was visible it already read as a gold textured star. There was no
  // visible tiny-blue-dot-grows arc at all. Revealing at LOW starFormed (full opacity by
  // ≈0.12, i.e. ~12% size — see the starFormed = prog^1.5 map: stage 3.34) fades the dot in
  // quickly but smoothly the moment the seed lights up, then leaves it on screen for the
  // entire blue→gold growth. The blue (uBlue) and clean-sphere (uDetail) ramps in
  // createScene are re-keyed to span this same now-VISIBLE growth (full-blue+clean while
  // small, warming+texturing only as it nears full size).
  //
  // The star now renders UNDER/THROUGH the gas while small (a young star embedded in its
  // nebula — accepted): the cloud still owns cloudW=1 across the collapse window, so the gas
  // stays IN FRONT, but the bright seed + seedGlow reads through it as a dot peeking out. The
  // cloud (cloudW) logic, the COLLAPSE_FLOOR_XFADE band, and the yellow↔red swap below are
  // ALL UNCHANGED — only this reveal timing moves. The nebula manifesto copy fades by
  // ~stage 3.05, well below where the dot first lights up (stage ≈3.45), and since the star
  // starts as a TINY bright point (≈1–4% scale up there, not a gold body) a small speck in
  // the gas under the tail of the copy reads as a forming star, not a wrong warm body. The
  // cloud density (lifecycle's invDensity) still reaches ~0 only in the final stretch, so the
  // floor handoff stays a clean simultaneous cross-fade, never a gap or double-body.
  const meshFormIn = smoothstep01(starFormed / 0.12);
  // Per-body presence weights. A body renders iff its weight > 0; both are > 0 only
  // in the two declared crossfade bands (handoffs that dissolve under bloom). Across
  // those bands the weights are now true OPACITIES (0..1), not just booleans — the
  // sun-rig opacity rides meshW and the cloud brightness rides cloudW.
  let cloudW: number;
  let meshW: number;
  if (stage >= NEBULA_ACTIVE_STAGE) {
    // nebula + dot: pure cloud
    cloudW = 1;
    meshW = 0;
  } else if (stage > NEB_COLLAPSE_LO) {
    // collapse window: cloud owns; mesh fades in UNDER it near the floor
    cloudW = 1;
    meshW = meshFormIn;
  } else if (stage > NEB_COLLAPSE_LO - COLLAPSE_FLOOR_XFADE) {
    // collapse-FLOOR crossfade: cloud fades out, mesh (already full) takes over
    cloudW = 1 - smoothstep01((NEB_COLLAPSE_LO - stage) / COLLAPSE_FLOOR_XFADE);
    meshW = 1;
  } else if (stage > SWAP_STAGE) {
    // settled yellow star: pure mesh
    cloudW = 0;
    meshW = 1;
  } else if (stage > SWAP_STAGE - SWAP_XFADE) {
    // yellow↔red CROSS-DISSOLVE band (≈ 2.86→2.88). As stage RISES toward SWAP_STAGE
    // the mesh fades IN and the cloud fades OUT, so scrolling DOWN (stage rising here)
    // the small gold cloud ball dissolves into the gold mesh. `m` is 0 at the band's
    // low edge (pure cloud) → 1 at SWAP_STAGE (pure mesh); smoothstep for a soft S-curve.
    // Mirrors the collapse-floor crossfade pattern above. Both bodies are gold + yellow
    // size + co-located here (the cloud finished shrinking at RED_SHRINK_END=2.85, below
    // this band), so the overlap is a clean gold-on-gold dissolve with minimal grain.
    const m = smoothstep01((stage - (SWAP_STAGE - SWAP_XFADE)) / SWAP_XFADE);
    cloudW = 1 - m;
    meshW = m;
  } else {
    // red giant / below: pure cloud (the cloud owns the whole shrink down to 2.86).
    cloudW = 1;
    meshW = 0;
  }
  return { cloudW, meshW };
}
