// ===========================================================================
// lifecycleMachine.ts — the single selector for "where am I on the lifecycle".
//
// "Which lifecycle state am I in, and how far through it?" used to have NO single
// module. It was re-derived from raw `stage` thresholds in FOUR independent
// readers that had to agree by hand:
//   1. sceneForProgress(progress)        — {sceneId, phase, localT} for the HUD.
//   2. settledIdForStage(stage)          — the idle-hold marker gate.
//   3. hudIdForStage(stage)              — the rail's scroll-spy (defined twice:
//                                           once in HudNavigation.tsx).
//   4. legacyStageForProgress(progress)  — the progress -> shader-stage curve.
// Each read THREE coordinate axes (progress 0..1, shader `stage` 0..5, and the
// localT/phase within a segment) and re-typed a band boundary in every reader.
//
// This module is the ONE place that composes those reads. `resolve(progress)`
// walks the SAME SEGMENTS/STARTS table the existing functions walk, returning the
// full lifecycle position in one shot. It adds NO new math: it is literally
// `sceneForProgress` + `legacyStageForProgressFromTable` + `settledIdForStage`
// composed once, so it is behaviour-preserving by construction. The centralised
// `hudIdForStage` (moved here from HudNavigation.tsx, which now re-exports it) is
// the single scroll-spy implementation.
//
// PURE: no THREE, no DOM, no React. Imports only the pure data/logic layer
// (sceneTable.ts) and the direction seam is already applied inside the table
// walkers via lifecycleProgress(), so this module never touches direction itself.
// ===========================================================================
import {
  HUD_NAV_ITEMS,
  legacyStageForProgressFromTable,
  sceneForProgress,
  settledIdForStage,
  type HudNavItem,
  type HudTargetId,
  type Phase,
} from './sceneTable';

/** The lifecycle state granularity is the existing scene id set
 *  ('beginning' | 'nebula' | 'yellow' | 'red' | 'end'). This pass keeps that
 *  granularity deliberately — a finer-grained enum would change behaviour. */
export type LifecycleState = HudTargetId;

/** The full position on the lifecycle for a raw scroll value, composed once from
 *  the existing table walkers. Every field equals what its old standalone reader
 *  returned for the same input:
 *   - {state, phase, localT} = sceneForProgress(progress)   (state := sceneId)
 *   - stage                  = legacyStageForProgress(progress)
 *   - settledId              = settledIdForStage(stage)
 *   - progress               = the raw input, echoed for convenience. */
export interface LifecyclePosition {
  /** Which lifecycle scene the scroll value is on (the active SEGMENT's scene). */
  state: LifecycleState;
  /** Idle hold vs. moving transition for the active segment. */
  phase: Phase;
  /** Position within the active segment (0..1, after the segment() clamp). */
  localT: number;
  /** The settled-hold scene for `stage`, or null mid-transition (marker gate). */
  settledId: LifecycleState | null;
  /** The shader-stage coordinate (0..5) for this progress. */
  stage: number;
  /** The raw scroll value passed in (0..1), echoed back. */
  progress: number;
}

/**
 * Resolve the full lifecycle position for a RAW scroll value. This is a pure
 * COMPOSITION of the existing table functions — no new thresholds, no new math —
 * so it returns exactly what the four scattered reads returned, in one object.
 */
export function resolve(progress: number): LifecyclePosition {
  const scene = sceneForProgress(progress);
  const stage = legacyStageForProgressFromTable(progress);
  return {
    state: scene.sceneId,
    phase: scene.phase,
    localT: scene.localT,
    settledId: settledIdForStage(stage),
    stage,
    progress,
  };
}

// HUD nav rows in ascending `stage` order. The source list is already authored
// in this order, but the scroll-spy below depends on it, so the contract is made
// explicit rather than relying on authoring order (mirrors the former
// HUD_NAV_BY_STAGE in HudNavigation.tsx).
const HUD_NAV_BY_STAGE: readonly HudNavItem[] = [...HUD_NAV_ITEMS].sort((a, b) => a.stage - b.stage);

/**
 * Scroll-spy: map a lifecycle `stage` (0..5) to the HUD target the visitor is
 * currently "on" — the last stage they have scrolled past. Returns the first item
 * while still above it, so the top of the rail (BLACK HOLE / stage 0) lights up at
 * the very top of the page.
 *
 * This is the SINGLE implementation; HudNavigation.tsx re-exports it (its former
 * local copy is gone) so the rail's scroll-spy and any other caller share one
 * definition that can never drift.
 */
export function hudIdForStage(stage: number): HudTargetId {
  let current = HUD_NAV_BY_STAGE[0];
  for (const item of HUD_NAV_BY_STAGE) {
    if (stage >= item.stage) current = item;
    else break;
  }
  return current.id;
}
