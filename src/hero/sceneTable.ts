// ===========================================================================
// sceneTable.ts — the single declarative source of truth for the hero's
// stellar-lifecycle state machine.
//
// The hero choreography (scroll -> scene -> shader "stage") used to be expressed
// imperatively and scattered across timeline.ts (an 11-band if-ladder + the
// camera keyframes), createScene.ts + HudNavigation.tsx (duplicated idle/settled
// windows), HudNavigation.tsx (HUD nav + on-screen markers), beats.ts (manifesto
// copy) and lifecycle.ts (per-state stage thresholds).
//
// This module collapses that into ONE table. Two tiers:
//   1. SEGMENTS — a flat timing array. Each row is one timed span ("band") on the
//      lifecycle timeline: a relative `weight`, the shader-stage endpoints it
//      walks, the easing, and whether it is an idle hold or a transition. The
//      prefix-sum of the weights reproduces the OLD breakpoints exactly, and a
//      generic band-walker over SEGMENTS regenerates the forward progress->stage
//      curve numerically identically to the former if-ladder.
//   2. SCENES — a colocated, per-scene view. Each scene groups its HUD nav row,
//      its on-screen markers and its manifesto beat so the scattered exports
//      (HUD_NAV_ITEMS / MARKER_PLACEMENTS / BEATS) become simple projections.
//
// This file is PURE data + logic: NO three.js, NO React, NO DOM. It must not
// import any component (HudNavigation.tsx / beats.ts re-export FROM here, so a
// reverse import would create a cycle). The easing instances are the same math
// as timeline.ts so the regenerated curve is bit-for-bit identical.
// ===========================================================================
import { clamp01, segment } from './scroll';
import { lifecycleProgress } from './timeline';

// --------------------------------------------------------------------------
// Easing (the SAME instances the timeline used — identical math, so the
// regenerated curve matches the old if-ladder to floating-point exactness).
// --------------------------------------------------------------------------
const linear = (t: number): number => clamp01(t);
export const smoothstep = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOutCubic = (t: number): number => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const easeInQuart = (t: number): number => {
  const x = clamp01(t);
  return x * x * x * x;
};
const easeOutExpo = (t: number): number => {
  const x = clamp01(t);
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
};

export type Easing =
  | 'linear'
  | 'smoothstep'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInQuart'
  | 'easeOutExpo';

/** Easing name -> the easing function. Linear is `clamp01` so a flat idle band
 *  (stageStart === stageEnd) is a no-op either way, but it keeps the mapping
 *  total and explicit. */
const EASE: Record<Easing, (t: number) => number> = {
  linear,
  smoothstep,
  easeOutCubic,
  easeInOutCubic,
  easeInQuart,
  easeOutExpo,
};

export type Phase = 'idle' | 'transition';

// Colocation key: which lifecycle scene a span / nav row / marker belongs to.
export type HudTargetId = 'beginning' | 'nebula' | 'yellow' | 'red' | 'end';

/** One timed span ("band") on the lifecycle timeline. */
export interface Segment {
  /** Which lifecycle scene this span belongs to. */
  sceneId: HudTargetId;
  /** RELATIVE length of the span; all SEGMENTS weights sum to 1.0. */
  weight: number;
  /** Shader-stage at the span start. */
  stageStart: number;
  /** Shader-stage at the span end. MAY differ from the next span's stageStart
   *  (the band 7 -> 8 discontinuity 2.05 -> 1.05 is intentional — do not assume
   *  contiguity). */
  stageEnd: number;
  /** Easing applied across the span. */
  easing: Easing;
  /** Idle hold vs. moving transition. Idle = stageStart === stageEnd. */
  phase: Phase;
  /** Idle-only: the hand-tuned STAGE tolerance the marker gate uses for this
   *  scene. NOT derivable from stageStart/stageEnd (e.g. the nebula holds stage
   *  3.42 but its window is [3.38, 3.50]). Present on exactly one idle segment
   *  per scene. */
  settledWindow?: readonly [number, number];
}

// --------------------------------------------------------------------------
// THE TABLE. Eleven spans, authored top-of-page -> bottom-of-page. The weights
// prefix-sum to the EXACT former breakpoints:
//   [0, 0.055, 0.195, 0.33, 0.395, 0.47, 0.524, 0.678, 0.748, 0.82, 0.946, 1.0]
// Two facts encoded honestly (both reproduce today's curve; do NOT "tidy"):
//   1. Band 7 ends stage 2.05, band 8 STARTS stage 1.05 — a real discontinuity.
//   2. settledWindow is a hand-tuned tolerance, not the idle band's stage span.
// --------------------------------------------------------------------------
export const SEGMENTS: readonly Segment[] = [
  // 1 — BEGINNING: the lone pale blue dot holds, barely moving (4.7 -> 4.5).
  {
    sceneId: 'beginning',
    weight: 0.055,
    stageStart: 4.7,
    stageEnd: 4.5,
    easing: 'smoothstep',
    phase: 'idle',
    settledWindow: [4.5, 4.72],
  },
  // 2 — NEBULA grow: dot blooms into the cloud, linear on purpose (4.5 -> 3.42).
  {
    sceneId: 'nebula',
    weight: 0.14,
    stageStart: 4.5,
    stageEnd: 3.42,
    easing: 'linear',
    phase: 'transition',
  },
  // 3 — NEBULA collapse: gas streams inward feeding the star (3.42 -> 3.02).
  // The nebula idle/settled window rides this nebula span (placement among a
  // scene's segments is free; settledIdForStage scans them all).
  {
    sceneId: 'nebula',
    weight: 0.135,
    stageStart: 3.42,
    stageEnd: 3.02,
    easing: 'easeInOutCubic',
    phase: 'transition',
    settledWindow: [3.38, 3.5],
  },
  // 4 — YELLOW ignition: finish into the settled gold (3.02 -> 2.88).
  {
    sceneId: 'yellow',
    weight: 0.065,
    stageStart: 3.02,
    stageEnd: 2.88,
    easing: 'easeOutCubic',
    phase: 'transition',
  },
  // 5 — YELLOW hold: stay at the settled gold (flat 2.88).
  {
    sceneId: 'yellow',
    weight: 0.075,
    stageStart: 2.88,
    stageEnd: 2.88,
    easing: 'linear',
    phase: 'idle',
    settledWindow: [2.86, 2.9],
  },
  // 6 — RED grow: the giant grows, one continuous move (2.88 -> 2.05).
  {
    sceneId: 'red',
    weight: 0.054,
    stageStart: 2.88,
    stageEnd: 2.05,
    easing: 'easeInOutCubic',
    phase: 'transition',
  },
  // 7 — RED hold: the flat red-giant beat (flat 2.05).
  {
    sceneId: 'red',
    weight: 0.154,
    stageStart: 2.05,
    stageEnd: 2.05,
    easing: 'linear',
    phase: 'idle',
    settledWindow: [2.0, 2.12],
  },
  // 8 — END collapse: stage JUMPS to 1.05 here (band 7 ended 2.05) then falls
  // to 0.5 — the intentional discontinuity. easeInQuart.
  {
    sceneId: 'end',
    weight: 0.07,
    stageStart: 1.05,
    stageEnd: 0.5,
    easing: 'easeInQuart',
    phase: 'transition',
  },
  // 9 — END supernova: 0.5 -> 0.32, easeOutCubic.
  {
    sceneId: 'end',
    weight: 0.072,
    stageStart: 0.5,
    stageEnd: 0.32,
    easing: 'easeOutCubic',
    phase: 'transition',
  },
  // 10 — END black-hole settle: 0.32 -> 0.08, easeOutExpo.
  {
    sceneId: 'end',
    weight: 0.126,
    stageStart: 0.32,
    stageEnd: 0.08,
    easing: 'easeOutExpo',
    phase: 'transition',
  },
  // 11 — END event horizon: the settled black hole at the bottom (0.08 -> 0.0).
  {
    sceneId: 'end',
    weight: 0.054,
    stageStart: 0.08,
    stageEnd: 0.0,
    easing: 'smoothstep',
    phase: 'idle',
    settledWindow: [0.0, 0.12],
  },
];

/** Prefix-sum of the segment weights — the progress breakpoints. Length is
 *  SEGMENTS.length + 1: STARTS[i] is span i's start progress, STARTS[i + 1] its
 *  end. Computed once at module load. Equals (to float precision)
 *  [0, 0.055, 0.195, 0.33, 0.395, 0.47, 0.524, 0.678, 0.748, 0.82, 0.946, 1.0]. */
export const STARTS: readonly number[] = (() => {
  const out: number[] = [0];
  let acc = 0;
  for (const seg of SEGMENTS) {
    acc += seg.weight;
    out.push(acc);
  }
  return out;
})();

/**
 * The forward progress -> shader-stage curve, generated from SEGMENTS. Replaces
 * the former 11-band if-ladder in timeline.ts. `progress` is the RAW scroll
 * value; it is routed through lifecycleProgress() exactly ONCE here (the single
 * direction seam), then the band-walker mirrors the if-ladder: it finds the
 * first span whose end the value falls below (defaulting to the last span) and
 * lerps stageStart -> stageEnd through that span's easing of its local segment
 * position. Numerically identical to the old ladder.
 */
export function legacyStageForProgressFromTable(progress: number): number {
  const p = lifecycleProgress(progress);
  // Find the active span: the first whose end-progress the value is below. The
  // earlier `if (p < STARTS[i + 1])` ladder excluded p < STARTS[i] already, so a
  // forward scan reproduces the same selection; the last span is the `else`.
  let i = SEGMENTS.length - 1;
  for (let k = 0; k < SEGMENTS.length; k += 1) {
    if (p < STARTS[k + 1]) {
      i = k;
      break;
    }
  }
  const seg = SEGMENTS[i];
  const localT = segment(p, STARTS[i], STARTS[i + 1]);
  const eased = EASE[seg.easing](localT);
  return seg.stageStart + (seg.stageEnd - seg.stageStart) * eased;
}

export interface SceneSelection {
  sceneId: HudTargetId;
  phase: Phase;
  /** Local position within the active span (0..1, after segment() clamp). */
  localT: number;
}

/**
 * The "navigate clearly" primitive: which scene + phase a raw scroll value is
 * on, and how far through the active span it is. Walks SEGMENTS the same way as
 * the stage curve. Routes through lifecycleProgress() once (the single seam).
 */
export function sceneForProgress(progress: number): SceneSelection {
  const p = lifecycleProgress(progress);
  let i = SEGMENTS.length - 1;
  for (let k = 0; k < SEGMENTS.length; k += 1) {
    if (p < STARTS[k + 1]) {
      i = k;
      break;
    }
  }
  const seg = SEGMENTS[i];
  return {
    sceneId: seg.sceneId,
    phase: seg.phase,
    localT: segment(p, STARTS[i], STARTS[i + 1]),
  };
}

/**
 * Idle-hold-only marker gate, derived from the settledWindow tolerances on the
 * idle segments. A marker appears ONLY while the lifecycle is holding still on
 * its recognisable beat, NOT during the transitions in/out of that hold. Returns
 * the held scene's id for `stage`, or null mid-transition. This is the SINGLE
 * source of the windows that createScene.ts and HudNavigation.tsx both used to
 * hardcode (formerly required to stay byte-identical by hand).
 */
export function settledIdForStage(stage: number): HudTargetId | null {
  for (const seg of SEGMENTS) {
    const win = seg.settledWindow;
    if (win && stage >= win[0] && stage <= win[1]) return seg.sceneId;
  }
  return null;
}
