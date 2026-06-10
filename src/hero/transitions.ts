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
 * maps to a body, and the two bodies are mutually exclusive except in the two
 * short, DECLARED crossfade bands (the collapse floor at 3.0, and the yellow↔red
 * swap at SWAP_STAGE). lifecycle()'s cloudShown / sunRigVisible are projected from
 * the returned weights, so they can never gap or bleed by construction.
 *
 * Bands (high stage = top of page):
 *   stage >= 3.5            CLOUD            nebula + dot
 *   3.0  <  stage < 3.5     CLOUD (+mesh fades in UNDER it near the floor)
 *   2.95 <  stage <= 3.0    CLOUD->MESH      collapse-floor crossfade
 *   SWAP <  stage <= 2.95   MESH             settled yellow star
 *   SWAP-0.03 < stage <=SWAP MESH->CLOUD     flash-swap crossfade
 *   stage <= SWAP-0.03      CLOUD            red giant / below
 *
 * @param starFormed the mesh-star reveal ramp (lifecycle's `starFormed`); used to
 *   reveal the forming mesh under the dense gas only as the star nears completion.
 */
export function bodyOwnership(stage: number, starFormed: number): BodyOwnership {
  const COLLAPSE_FLOOR_XFADE = 0.05; // 3.00 -> 2.95: cloud yields to the formed mesh
  const SWAP_XFADE = 0.03; // 2.88 -> 2.85: mesh yields to the red-giant cloud
  // mesh reveal INSIDE the collapse window: hold the forming mesh hidden under
  // the dense gas until the star is nearly complete (starFormed ramps 0.85->1.0,
  // i.e. ~stage 3.08->3.00) — AFTER the nebula text has faded (~stage 3.05) — so
  // it reveals as a clean cross-fade, never a warm body under the nebula copy.
  const meshFormIn = smoothstep01((starFormed - 0.85) / 0.15);
  // Per-body presence weights. cloudW/meshW are booleans-as-weights here; a body
  // renders iff its weight > 0. The only places BOTH are > 0 are the two declared
  // crossfade bands (handoffs that dissolve under bloom).
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
    // flash-SWAP crossfade: mesh yields to the red-giant cloud
    meshW = 1 - smoothstep01((SWAP_STAGE - stage) / SWAP_XFADE);
    cloudW = 1 - meshW;
  } else {
    // red giant / below: pure cloud
    cloudW = 1;
    meshW = 0;
  }
  return { cloudW, meshW };
}
