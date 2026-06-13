import { clamp01, segment } from './scroll';
import {
  cameraBaseForLifecycleP,
  legacyStageForProgressFromTable,
  smoothstep,
} from './sceneTable';

// ===========================================================================
// LIFECYCLE DIRECTION — the single toggle that decides which way time runs.
//
// There are two distinct progress values, kept deliberately separate so the
// story can be reversed later without touching the renderer or the shaders:
//
//   userScrollProgress — the raw scroll position (0 at top, 1 at bottom). This
//     is what the visitor physically controls; it always increases as they
//     scroll DOWN. It is NEVER read directly by scene visuals.
//   lifecycleProgress  — the value the stellar-lifecycle renderer consumes. In
//     "normal" mode it equals userScrollProgress; in "reverse" mode it is
//     1 - userScrollProgress, so the SAME downward scroll walks the lifecycle
//     the other way.
//
// ACTIVE direction — the lifecycle now runs REVERSE as the visitor scrolls DOWN:
//     black hole -> reverse supernova -> red giant -> yellow star -> nebula ->
//     pale blue dot
// So the top of the page (userScrollProgress = 0) OPENS ON THE BLACK HOLE — the
// big hero you land on — and the bottom (userScrollProgress = 1) RESOLVES TO THE
// LONELY PALE BLUE DOT, the quiet speck the arc winds down to.
//
// The whole inversion is THIS ONE FLAG. Every downstream system (camera poses,
// the legacy "stage" mapping, scene selection, beats, HUD) reads lifecycleProgress
// through legacyStageForProgress / cameraPoseForProgress / sceneForProgress, so
// flipping LIFECYCLE_DIRECTION is the only edit it requires here. The shader
// "stage" coordinate stays untouched — lifecycle.ts remains a pure function of it.
// ===========================================================================
export type LifecycleDirection = 'normal' | 'reverse';
export const LIFECYCLE_DIRECTION: LifecycleDirection = 'reverse';

/** Map the raw scroll value (0..1, increases scrolling down) to the value the
 *  lifecycle renderer consumes. Normal = identity; reverse = mirror. This is the
 *  ONLY place direction is applied — keep it the single seam. */
export function lifecycleProgress(userScrollProgress: number): number {
  const p = clamp01(userScrollProgress);
  return LIFECYCLE_DIRECTION === 'reverse' ? 1 - p : p;
}

type Vec3Tuple = readonly [number, number, number];

export interface CameraPose {
  position: Vec3Tuple;
  target: Vec3Tuple;
  shake: number;
  parallax: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Re-exported for the few consumers (cursor/debug) that import smoothstep from the
// timeline; the implementation now lives in sceneTable.ts (one easing source).
export { smoothstep };

// RE-TIMED for the "one continuous mechanism" chapter grid (raw 0-14% black hole ...
// 88-100% content). These lifecycle-progress breakpoints stay in lockstep with the
// RE-TIMED SEGMENTS/CAMERA tables in sceneTable.ts (same numbers, same order).
const DOT_HOLD_END = 0.1;         // dot hold (content-unlock band, raw 90-100%)
const NEBULA_GROW_END = 0.26;     // dot->nebula grow ends; nebula proper begins
// SHIFTED +0.08 (3rd iteration): the nebula COLLAPSE span widened (seg 3b 0.12 -> 0.20) so
// the pinpoint-seed→full-star growth has more scroll to play out, pushing the four
// breakpoints after it forward by 0.08. These MUST stay in lockstep with STARTS[4..7] in
// sceneTable.ts ([0.51, 0.58, 0.61, 0.74]) or progressForLegacyStage's inverse drifts.
const STAR_IGNITION_START = 0.51; // was 0.43 — nebula collapse ends; yellow ignites
const YELLOW_SETTLE_END = 0.58;   // was 0.50 — yellow ignition resolves into the centred hold
// The yellow star HOLDS centred across YELLOW_SETTLE_END→YELLOW_HOLD_END so the dwell
// resolves into a real, still beat (headline reads on the blazing sun). Only AFTER this
// hold does the giant grow + the camera swing into the lateral orbit — so yellow→red
// reads as ONE move (grow + arc around the body) instead of "dive in, then reverse out".
const YELLOW_HOLD_END = 0.61;     // was 0.57 — yellow hold ends; the red-giant grow/orbit begins
// Red-giant hold band. Named so camera and stage use the same numbers.
const RED_HOLD_START = 0.74;      // was 0.70 — red grow ends; the settled red-giant close-up hold begins
const RED_HOLD_END = 0.77;        // red-giant hold ends; the reverse-collapse FLASH begins

// The public cinematic timeline. The existing shaders still understand the older
// reverse "stage" coordinates, so this is the single handoff from the new story
// into the proven morph machinery. `progress` is the RAW scroll value; the table
// walker runs it through lifecycleProgress() so LIFECYCLE_DIRECTION owns which
// way time flows.
//
// The former 11-band if-ladder now lives as the declarative SEGMENTS table in
// sceneTable.ts; this delegates to the generic band-walker over that table,
// which reproduces the same progress->stage curve numerically identically. Edit
// the table (one weight) to re-time a scene, not this function.
//
// Phase bands (in lifecycleProgress space), RE-TIMED to the ART-DIRECTION chapter
// grid (the raw-scroll band each occupies under the reverse flip is raw = 1 - lifecycle):
//   0.00-0.10 dot hold / content-unlock (raw 90-100) | 0.10-0.26 dot->nebula grow |
//   0.26-0.51 nebula (raw 49-74, collapse WIDENED) | 0.51-0.61 yellow ignite+hold (raw 39-49) |
//   0.61-0.77 red giant grow+orbit+close (raw 23-39) | 0.77-0.85 reverse collapse FLASH (raw 15-23) |
//   0.85-1.00 black-hole settle + event-horizon hold / portfolio lure (raw 0-15).
export function legacyStageForProgress(progress: number): number {
  return legacyStageForProgressFromTable(progress);
}

// Approximate inverse used only for HUD previews, where matching the selected
// object's camera family matters more than a mathematically exact eased inverse.
export function progressForLegacyStage(stage: number): number {
  // Inverse of legacyStageForProgress — keep the breakpoints in lockstep with it
  // (both derive from the same RE-TIMED progress->stage table). The leading dot bands
  // map the pale-blue-dot opening (stage 4.70 -> 3.42) onto lifecycle 0.00 -> 0.26.
  if (stage >= 4.7) return 0.0;
  if (stage >= 4.5) return lerp(0.0, DOT_HOLD_END, (4.7 - stage) / (4.7 - 4.5));
  if (stage >= 3.42) return lerp(DOT_HOLD_END, NEBULA_GROW_END, (4.5 - stage) / (4.5 - 3.42));
  if (stage >= 3.02) return lerp(NEBULA_GROW_END, STAR_IGNITION_START, (3.42 - stage) / (3.42 - 3.02));
  if (stage >= 2.88) return lerp(STAR_IGNITION_START, YELLOW_SETTLE_END, (3.02 - stage) / (3.02 - 2.88));
  // stage 2.88 holds across [YELLOW_SETTLE_END, YELLOW_HOLD_END]; the 2.88→2.05 growth
  // then maps onto [YELLOW_HOLD_END, RED_HOLD_START] (in lockstep with legacyStageForProgress).
  if (stage >= 2.05) return lerp(YELLOW_HOLD_END, RED_HOLD_START, (2.88 - stage) / (2.88 - 2.05));
  if (stage >= 1.05) return (RED_HOLD_START + RED_HOLD_END) / 2; // mid-hold approx (used for HUD preview)
  if (stage >= 0.5) return lerp(RED_HOLD_END, 0.81, (1.05 - stage) / (1.05 - 0.5));
  if (stage >= 0.32) return lerp(0.81, 0.85, (0.5 - stage) / (0.5 - 0.32));
  if (stage >= 0.08) return lerp(0.85, 0.93, (0.32 - stage) / (0.32 - 0.08));
  return lerp(0.93, 1.0, (0.08 - Math.max(0, stage)) / 0.08);
}

export function cameraPoseForProgress(progress: number, time: number, nova: number, reduced: boolean): CameraPose {
  // `progress` is the RAW scroll value; route through lifecycleProgress so the
  // camera arc inherits LIFECYCLE_DIRECTION along with everything else.
  const p = lifecycleProgress(progress);

  // The per-band base pose is generated from the CAMERA table in sceneTable.ts
  // (the former 10-band if-ladder). The red-hold micro-drift and the nova shake
  // below are applied as post-steps, exactly as before — they are NOT part of the
  // table (they depend on `time`/`nova`/`reduced`, not just progress).
  const base = cameraBaseForLifecycleP(p);
  let position = base.position;
  let target = base.target;
  const parallax = base.parallax;

  // RED-GIANT hold micro-drift — kept SUBORDINATE to the Step-2 lateral orbit (the
  // orbit swings x by ~14 units across this band; this is a ~0.12 wobble on top, so
  // it textures the hold without fighting the arc). Re-keyed automatically to the new
  // red band via RED_HOLD_START/END (0.64 -> 0.72).
  const redHold = segment(p, RED_HOLD_START, RED_HOLD_END);
  const redHoldDriftEnd = RED_HOLD_START + (RED_HOLD_END - RED_HOLD_START) * 0.94; // fade drift before hold ends
  const redHoldWindow = smoothstep(redHold) * (1 - smoothstep(segment(p, redHoldDriftEnd, RED_HOLD_END)));
  const micro = reduced ? 0 : redHoldWindow * Math.sin(time * 0.09) * 0.12;
  if (micro !== 0) {
    position = [position[0] + micro, position[1] - micro * 0.18, position[2] + micro * 0.22];
    target = [target[0] + micro * 0.42, target[1] - micro * 0.08, target[2]];
  }

  // NEBULA breathing drift — a TINY, low-frequency sine on position so the nebula
  // chapter (lifecycle 0.26 -> 0.42, raw 58-74%) reads alive without looking
  // artificial. Windowed to the nebula band so it never bleeds into the still yellow
  // hold or the dot. Off under reduced motion. Amplitude HALVED (0.5 -> 0.25): the
  // old swing made the cloud visibly wander; this keeps just enough loose drift to
  // read as living gas, not a static sprite, while the cloud essentially sits still.
  const nebulaBand =
    smoothstep(segment(p, NEBULA_GROW_END, NEBULA_GROW_END + 0.04)) *
    (1 - smoothstep(segment(p, STAR_IGNITION_START - 0.04, STAR_IGNITION_START)));
  const breathe = reduced ? 0 : nebulaBand * Math.sin(time * 0.21) * 0.25;
  if (breathe !== 0) {
    position = [position[0] + breathe * 0.6, position[1] + breathe * 0.35, position[2] + breathe * 0.8];
  }

  // FINAL — no lateral pan, no snap-back. The cloud stays CENTRED through the whole nebula
  // chapter (base poses zeroed in x) and the pale-blue-dot collapses straight in from centre.
  // The HUD/headline column is kept legible NOT by shoving the gas aside but by DIMMING around
  // the nebula — a stronger left-edge wash (the HUD rail lives at the left edge) plus a gentle
  // radial vignette so the gas can't bleed under the rail. That dimming lives in CSS
  // (.bh-root::before / ::after, data-scene='nebula'). Nothing to pan here.
  // (nebulaBand still drives the breathing drift above.)

  // REVERSE-SUPERNOVA shudder — eased to BUILD INTO the implosion rather than a
  // symmetric burst. `nova` is the Gaussian envelope (peaks mid-blast); the implosion
  // GATHERS as the lifecycle runs toward the black hole (p increases through the
  // supernova band 0.72 -> 0.86), so we bias the shake to ramp up on that gathering
  // side. implodeBias goes 0 at the red-giant edge -> 1 at the black-hole edge, so the
  // rumble swells inward (energy converging) instead of recoiling symmetrically out.
  const implodeBias = smoothstep(segment(p, RED_HOLD_END, 0.85));
  const shock = reduced ? 0 : clamp01(nova) * (0.35 + 0.65 * implodeBias);
  return {
    position,
    target,
    shake: shock * 0.3,
    parallax,
  };
}
