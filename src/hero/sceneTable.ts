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
// lifecycleProgress is imported from scroll.ts (the leaf module), NOT timeline.ts:
// importing it from timeline created a sceneTable ⇄ timeline cycle that made a
// server-rendered consumer (BaseLayout's sub-nav importing HUD_NAV_ITEMS) hit a
// TDZ during the Astro prerender. scroll.ts now owns the direction seam; this file
// stays free of any timeline import, so it has no inbound cycle.
import { clamp01, segment, lifecycleProgress } from './scroll';

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
// A GENTLER symmetric in/out than cubic — the sine S-curve has shallower endpoints, so
// it eases in AND OUT more softly. Used by the WIDENED nebula collapse (seg 3b): over the
// longer span a cubic tail snapped to full a touch hard near the floor; the sine tail glides
// the last frames of the pinpoint→full-star growth into the mesh lock-in (R4 "stops too soon /
// botched" fix). cos form keeps it in [0,1] with f(0)=0, f(0.5)=0.5, f(1)=1.
const easeInOutSine = (t: number): number => {
  const x = clamp01(t);
  return -(Math.cos(Math.PI * x) - 1) / 2;
};
// Exported so the scene engine (createScene.ts) can reuse the SAME accelerating
// fall curve for the cinematic dive plunge — no second, drifting copy of the
// easing. Still backs the END-collapse band's stage curve below (band 8).
export const easeInQuart = (t: number): number => {
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
  | 'easeInOutSine'
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
  easeInOutSine,
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
// THE TABLE. Twelve spans, authored in LIFECYCLE order (pale-blue-dot first ->
// black hole last). Under the active REVERSE direction the visitor walks this from
// the BACK as they scroll down, so it now reads bottom-of-page -> top-of-page
// physically.
//
// RE-TIMED for the "one continuous cosmic mechanism" chapter grid. The weights
// prefix-sum to breakpoints that place each scene's RAW-scroll band (raw = 1 -
// lifecycle under the reverse flip) on the ART-DIRECTION target grid. The marker
// branch's 3a/3b nebula idle-hold split is folded in (one extra intermediate
// breakpoint at lifecycle 0.31), so the table is now TWELVE spans while keeping the
// art-direction chapter boundaries exactly:
//   raw 0-15%   black hole        (lifecycle 0.85-1.00, segs 10-11)
//   raw 15-23%  reverse collapse  (lifecycle 0.77-0.85, segs 8-9 — SHORTENED to a
//               transition FLASH, not a chapter: collapse is ~8% of scroll, was 14%)
//   raw 23-39%  red giant         (lifecycle 0.61-0.77, segs 6-7)
//   raw 39-49%  yellow star       (lifecycle 0.51-0.61, segs 4-5)
//   raw 49-74%  nebula            (lifecycle 0.26-0.51, segs 3a-3b: idle hold + collapse)
//   raw 74-90%  pale dot          (lifecycle 0.10-0.26, seg 2 dot->nebula grow)
//   raw 90-100% content/settled   (lifecycle 0.00-0.10, seg 1 the dot hold — the
//               HUD arms across this band; see HeroIsland's at-end edge).
// NEBULA→YELLOW LENGTHENED (3rd iteration): the nebula COLLAPSE span (3b) was WIDENED
// 0.12 -> 0.20 (+0.08 scroll) so the pinpoint-seed → full-star growth is a slow, legible
// build, not a quick snap. To keep the HARD INVARIANT (all weights sum to exactly 1.0 so
// STARTS lands on 1.0), the +0.08 is taken back from the two FLAT IDLE HOLDS — dead-time
// pauses whose LOOK is unchanged, only their scroll duration shrinks: YELLOW hold (seg 5)
// 0.07 -> 0.03 and RED hold (seg 7) 0.07 -> 0.03 (−0.04 each = −0.08). No TRANSITION span
// that does visible work was touched. The nebula chapter's single collapse span is still
// SPLIT into a short idle held-frame (3a, 0.05, flat stage 3.42) + the remaining collapse
// (3b, now 0.20); that idle hold is what the strict idle-only marker gate
// (settledIdForStage) anchors the nebula markers to, so they never show across the collapse
// transition. The yellow ignition span (seg 4) stays 0.07. Widening 3b pushes the four
// breakpoints AFTER it forward by 0.08 (STARTS[4..7]: 0.43→0.51, 0.50→0.58, 0.57→0.61,
// 0.70→0.74), so the named beat-progress constants pinned to them (STAR_IGNITION_START,
// YELLOW_SETTLE_END, YELLOW_HOLD_END, RED_HOLD_START in the CAMERA block below + timeline.ts)
// move in lockstep. NEW STARTS prefix-sum (lifecycle):
//   [0, 0.10, 0.26, 0.31, 0.51, 0.58, 0.61, 0.74, 0.77, 0.81, 0.85, 0.93, 1.0]
// The curve stays continuous + monotonic (stage falls 4.7 -> 0.0 as lifecycle
// rises 0 -> 1); only WHICH scroll position maps to WHICH stage changed.
// Two facts encoded honestly (both reproduce the curve; do NOT "tidy"):
//   1. Band 7 ends stage 2.05, band 8 STARTS stage 1.05 — a real discontinuity.
//   2. settledWindow is a hand-tuned tolerance, not the idle band's stage span.
// --------------------------------------------------------------------------
export const SEGMENTS: readonly Segment[] = [
  // 1 — BEGINNING: the lone pale blue dot holds, barely moving (4.7 -> 4.5). This
  // is the CONTENT-UNLOCK band (raw 88-100%): near-static dot, HUD fully armed so
  // projects/articles read as primary.
  {
    sceneId: 'beginning',
    weight: 0.1,
    stageStart: 4.7,
    stageEnd: 4.5,
    easing: 'smoothstep',
    phase: 'idle',
    settledWindow: [4.5, 4.7],
  },
  // 2 — NEBULA grow: dot blooms into the cloud, linear on purpose (4.5 -> 3.42).
  // The PALE-DOT chapter (raw 74-88%): the simple far dot loosening toward the cloud.
  {
    sceneId: 'nebula',
    weight: 0.16,
    stageStart: 4.5,
    stageEnd: 3.42,
    easing: 'linear',
    phase: 'transition',
  },
  // 3a — NEBULA held frame: a brief IDLE micro-hold at the fullest, most-settled
  // cloud (stage 3.42, where bloom ends and collapse begins). This is the ONLY
  // nebula idle hold, so it is where the nebula writing markers may appear — the
  // strict idle-only gate (settledIdForStage) refuses to show them across the
  // collapse transition below. Tight window around the pinch. Its weight (0.05)
  // is carved out of main's re-timed single collapse span (0.16); 3a + 3b = 0.16,
  // so the NEBULA-chapter breakpoint in the prefix-sum is preserved exactly.
  {
    sceneId: 'nebula',
    weight: 0.05,
    stageStart: 3.42,
    stageEnd: 3.42,
    easing: 'linear',
    phase: 'idle',
    settledWindow: [3.39, 3.45],
  },
  // 3b — NEBULA collapse: gas streams inward feeding the star (3.42 -> 3.02). The
  // NEBULA chapter proper (raw 49-74%). Pure transition (the held-frame idle window
  // is 3a above), so NO marker shows while the gas is collapsing. Weight WIDENED
  // 0.12 -> 0.20 (3rd iteration): this is the SCROLL SPAN of the collapse, so a longer
  // span gives the visitor more scroll distance to watch the pinpoint seed grow into the
  // full star — a slow, legible build instead of a snap. The +0.08 is taken back from the
  // two flat idle HOLDS (segs 5 + 7, −0.04 each) so the weights still sum to 1.0; the
  // easeInOutCubic tail is softened to a longer-S easeInOutSine (below) so the final
  // lock-in onto the formed star doesn't feel abrupt at the end of the now-longer span.
  {
    sceneId: 'nebula',
    weight: 0.2,
    stageStart: 3.42,
    stageEnd: 3.02,
    easing: 'easeInOutSine',
    phase: 'transition',
  },
  // 4 — YELLOW ignition: finish into the settled gold (3.02 -> 2.88). Weight is the
  // documented-grid 0.07 (an earlier art-direction draft shipped 0.08, which pushed the
  // prefix-sum to 1.01 and let the terminal band spill past p=1.0; 0.07 lands STARTS on
  // exactly 1.0 — see the table header).
  {
    sceneId: 'yellow',
    weight: 0.07,
    stageStart: 3.02,
    stageEnd: 2.88,
    easing: 'easeOutCubic',
    phase: 'transition',
  },
  // 5 — YELLOW hold: stay at the settled gold (flat 2.88). Weight TRIMMED 0.07 -> 0.03
  // (3rd iteration): this is a flat IDLE pause — shrinking its scroll duration frees 0.04
  // for the widened nebula collapse (3b) WITHOUT changing the hold's LOOK (same stage 2.88,
  // same settledWindow). It still holds long enough to read the yellow beat; the dwell makes
  // it feel longer than 0.03 of scroll alone.
  {
    sceneId: 'yellow',
    weight: 0.03,
    stageStart: 2.88,
    stageEnd: 2.88,
    easing: 'linear',
    phase: 'idle',
    settledWindow: [2.875, 2.9],
  },
  // 6 — RED grow: the giant grows, one continuous move (2.88 -> 2.05). WIDENED
  // (0.07 -> 0.13) so the red-giant band owns raw 23-43%: this is the "reveal the
  // full mass" + "limb orbit/drift along the surface" stretch (ITEM 1's first two
  // beats), giving the camera room to arc around the body instead of snapping to the
  // hold. The hold below then becomes the "close on the surface/active region" beat.
  {
    sceneId: 'red',
    weight: 0.13,
    stageStart: 2.88,
    stageEnd: 2.05,
    easing: 'easeInOutCubic',
    phase: 'transition',
  },
  // 7 — RED hold: the flat red-giant beat (flat 2.05). The settled close-up beat —
  // the camera has pushed in to the active region by here (ITEM 1's third beat).
  // Weight TRIMMED 0.07 -> 0.03 (3rd iteration): like the yellow hold, this is a flat IDLE
  // pause — shrinking its scroll duration frees the other 0.04 for the widened nebula
  // collapse (3b) with NO change to its LOOK (same stage 2.05, same settledWindow). The
  // tight settledWindow [2.03, 2.07] is the strict idle-only gate (this is where the red
  // marker shows); the red dwell keeps the beat reading despite the shorter span.
  {
    sceneId: 'red',
    weight: 0.03,
    stageStart: 2.05,
    stageEnd: 2.05,
    easing: 'linear',
    phase: 'idle',
    settledWindow: [2.03, 2.07],
  },
  // 8 — END collapse: stage JUMPS to 1.05 here (band 7 ended 2.05) then falls
  // to 0.5 — the intentional discontinuity. easeInQuart. SHORTENED (0.07 -> 0.04):
  // the reverse-collapse is a TRANSITION FLASH, not a chapter (ITEM 3) — it should
  // read as the black-hole lensing line compressing inward into the red-giant surface
  // in well under a second of scroll, not a held sunburst beat.
  {
    sceneId: 'end',
    weight: 0.04,
    stageStart: 1.05,
    stageEnd: 0.5,
    easing: 'easeInQuart',
    phase: 'transition',
  },
  // 9 — END supernova: 0.5 -> 0.32, easeOutCubic. SHORTENED (0.07 -> 0.04) — see seg 8.
  {
    sceneId: 'end',
    weight: 0.04,
    stageStart: 0.5,
    stageEnd: 0.32,
    easing: 'easeOutCubic',
    phase: 'transition',
  },
  // 10 — END black-hole settle: 0.32 -> 0.08, easeOutExpo. WIDENED slightly
  // (0.07 -> 0.08) to absorb the scroll the shortened collapse gave back, so the
  // settle onto the centred hole stays smooth.
  {
    sceneId: 'end',
    weight: 0.08,
    stageStart: 0.32,
    stageEnd: 0.08,
    easing: 'easeOutExpo',
    phase: 'transition',
  },
  // 11 — END event horizon: the settled black hole — now at the physical TOP of the
  // page (lifecycle end, reverse-direction start) (0.08 -> 0.0).
  {
    sceneId: 'end',
    weight: 0.07,
    stageStart: 0.08,
    stageEnd: 0.0,
    easing: 'smoothstep',
    phase: 'idle',
    settledWindow: [0.0, 0.08],
  },
];

/** Prefix-sum of the segment weights — the progress breakpoints. Length is
 *  SEGMENTS.length + 1: STARTS[i] is span i's start progress, STARTS[i + 1] its
 *  end. Computed once at module load. Equals (to float precision)
 *  [0, 0.10, 0.26, 0.31, 0.51, 0.58, 0.61, 0.74, 0.77, 0.81, 0.85, 0.93, 1.0]. */
export const STARTS: readonly number[] = (() => {
  const out: number[] = [0];
  let acc = 0;
  for (const seg of SEGMENTS) {
    acc += seg.weight;
    out.push(acc);
  }
  return out;
})();

// ---------------------------------------------------------------------------
// NAMED PROGRESS BREAKPOINTS — the lifecycle-progress chapter edges, DERIVED from
// STARTS so they can never drift from the SEGMENTS table. These are the seven
// values the camera ramp (cameraPoseForProgress) and the HUD-preview inverse
// (progressForLegacyStage) key off; they USED to be hand-typed a second time in
// timeline.ts with a "MUST stay in lockstep" comment. Binding them to STARTS makes
// the lockstep structural instead of clerical: re-time a scene (edit one weight)
// and every consumer follows automatically. The index → meaning map:
//   STARTS[1]=dot hold end · [2]=nebula grow end · [4]=yellow ignition start ·
//   [5]=yellow settle end · [6]=yellow hold end · [7]=red hold start · [8]=red hold end.
export const DOT_HOLD_END = STARTS[1]; // 0.10 — dot hold / content-unlock band end
export const NEBULA_GROW_END = STARTS[2]; // 0.26 — dot->nebula grow ends; nebula proper begins
export const STAR_IGNITION_START = STARTS[4]; // 0.51 — nebula collapse ends; yellow ignites
export const YELLOW_SETTLE_END = STARTS[5]; // 0.58 — yellow ignition resolves into the centred hold
export const YELLOW_HOLD_END = STARTS[6]; // 0.61 — yellow hold ends; the red-giant grow/orbit begins
export const RED_HOLD_START = STARTS[7]; // 0.74 — red grow ends; the settled red-giant close-up hold begins
export const RED_HOLD_END = STARTS[8]; // 0.77 — red-giant hold ends; the reverse-collapse FLASH begins

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
 *
 * STRICT idle-only: the gate matches ONLY segments whose `phase === 'idle'`. A
 * settledWindow that happens to sit on a transition span is IGNORED — a marker
 * is structurally impossible to show during any morph. (Every scene that owns a
 * marker therefore carries its settledWindow on a real idle hold; the nebula's
 * fullest-cloud "held frame" is a dedicated idle micro-hold so it still shows.)
 */
export function settledIdForStage(stage: number): HudTargetId | null {
  for (const seg of SEGMENTS) {
    if (seg.phase !== 'idle') continue; // STRICT: never during a transition
    const win = seg.settledWindow;
    if (win && stage >= win[0] && stage <= win[1]) return seg.sceneId;
  }
  return null;
}

// ===========================================================================
// LIFECYCLE STAGE THRESHOLDS
//
// lifecycle.ts is a PURE stage->look function keyed on the shader "stage"
// coordinate (a separate axis from progress). These are the per-state activation
// + transition thresholds it reads, colocated here as named exports so the
// timing/state knobs all live in one table. lifecycle.ts imports them; the values
// and the way it applies them are unchanged (a colocation/naming win only — NOT a
// behavior change, the choreography stays in lifecycle.ts).
// ===========================================================================

/** Pale-blue-dot slot active at/above this stage (lifecycle.ts `dot`). */
export const DOT_ACTIVE_STAGE = 4.5;
/** Nebula slot active at/above this stage (lifecycle.ts `nebula`). */
export const NEBULA_ACTIVE_STAGE = 3.5;
/** Yellow-star slot active at/above this stage (lifecycle.ts `yellow`). */
export const YELLOW_ACTIVE_STAGE = 2.5;

/** nebula -> yellow gravitational-collapse window (scrolling UP): dispersed
 *  nebula at the HI edge, fully-fed star at the LO edge. */
export const NEB_COLLAPSE_HI = 3.5;
export const NEB_COLLAPSE_LO = 3.0;

/** yellow <-> red mesh/cloud crossover stage (the cross-dissolve centre). */
export const SWAP_STAGE = 2.88;
/** Width of the cloud→mesh CROSS-DISSOLVE band, in stage units. The handoff is no
 *  longer a hard flip masked by a whiteout: across [SWAP_STAGE - SWAP_XFADE, SWAP_STAGE]
 *  the cloud fades out (cloudW 1→0) and the mesh fades in (meshW 0→1) so the two gold
 *  bodies trade places continuously. Kept DELIBERATELY TIGHT (0.02 stage units, ≈ the
 *  sliver stage 2.86→2.88) to MINIMISE the window in which the ~1.2M-point cloud and the
 *  opaque mesh coexist — the smaller the overlap, the lower the residual reddish-grain
 *  risk. The band sits ENTIRELY at/below SWAP_STAGE and starts at 2.86, which is ABOVE
 *  RED_SHRINK_END (2.85): so by the time any overlap begins the cloud is ALREADY fully
 *  shrunk to yellow size (yrGrow→0) AND fully cooled to gold (yrColor→0), i.e. a small
 *  gold ball the same size/position as the mesh. Above the band: pure mesh. Below it:
 *  pure cloud. */
export const SWAP_XFADE = 0.02;
/** red giant -> yellow size contraction window (the cloud shrinks to gold size). */
export const RED_EXIT_START = 2.5;
/** red giant -> yellow colour cool window (just behind the size contraction). */
export const RED_COLOR_EXIT_START = 2.52;
/** red giant fully shrunk to yellow size before the SWAP_STAGE handoff. The cross-
 *  dissolve band (SWAP_XFADE) starts at 2.86, just ABOVE this, so the cloud is fully
 *  size-matched + gold BEFORE any overlap with the mesh begins. */
export const RED_SHRINK_END = 2.85;

// ===========================================================================
// COLOCATED PER-SCENE DATA
//
// The scattered HUD nav rows (HUD_NAV_ITEMS), on-screen markers (MARKER_PLACEMENTS)
// and manifesto copy (BEATS) are colocated here per scene, then projected back out
// (see the bottom of this file) under their original names + shapes + order so the
// importers compile unchanged. These types live here (the pure data layer) and are
// re-exported from HudNavigation.tsx / beats.ts; the React components must not own
// the data or sceneTable.ts would import a component (a cycle).
// ===========================================================================

export interface HudNavItem {
  id: HudTargetId;
  /** Public path to the row's mask glyph SVG (painted with the link's currentColor). */
  glyphSrc: string;
  motion: 'pulse' | 'breathe' | 'drift' | 'flicker' | 'still';
  label: string;
  destination: string;
  stage: number;
  href: string;
}

export interface MarkerPlacement {
  /** Stable per-marker id (also the lock-ownership token — must be unique). */
  id: string;
  /** Which settled lifecycle state shows this marker. */
  state: HudTargetId;
  /** Viewport-fraction X (0..1 of innerWidth). Ignored when `anchored`. */
  vx: number;
  /** Viewport-fraction Y (0..1 of innerHeight). Ignored when `anchored`. */
  vy: number;
  /** Ride the projected star origin instead of vx/vy (pale blue dot only). */
  anchored?: boolean;
  /** Path appended to BASE_URL for the link + card navigation. */
  href: string;
  /** Card title line (already in the casing it should render). Still drives the
   *  aiming-compass copy and the link a11y label; the richer card uses it as the
   *  fallback for `eyebrow`/`headline` when those are absent. */
  title: string;
  /** Card subtitle line. Compass dest copy; the richer card's `body` fallback. */
  subtitle: string;
  /** Background class under this marker — drives the adaptive 3-layer treatment
   *  (stroke colour, halo direction, blurred backing plate). Static per placement
   *  (authored, not sampled): the canvas is a separate stacking context so per-frame
   *  luminance is not cheaply available. */
  bg: 'dark' | 'bright' | 'noisy';
  /** Per-destination-type inner glyph (public/glyphs path). Painted with the
   *  marker's adaptive currentColor via CSS mask — same mechanism as the HUD rail. */
  glyph: string;
  // --- Richer card copy (all optional; each falls back to title/subtitle) ----
  /** The mono uppercase, letter-spaced gold label at the top of the card (e.g.
   *  'ABOUT'). Falls back to `title` when absent. */
  eyebrow?: string;
  /** The big bone headline — the dominant element (e.g. 'Hi, I’m Iliès.'). Falls
   *  back to `title` when absent. */
  headline?: string;
  /** The short description line under the headline (1–2 lines, dim). Falls back
   *  to `subtitle` when absent. */
  body?: string;
  /** Keyword chips, rendered joined by ' · '. Omitted entirely when absent/empty. */
  tags?: readonly string[];
  /** The CTA link text (e.g. 'Read about me'); the component appends the ' →'
   *  arrow. Falls back to the legacy '[ OPEN ]' affordance when absent. */
  cta?: string;
  /** When true, clicking this marker triggers the cinematic camera dive instead of
   *  a plain navigation: the live camera plunges toward the marker's OWN on-screen
   *  position (so an off-centre nebula speck is dived INTO, not lurched-to-centre)
   *  while a soft, capped bloom in the marker's lifecycle-state tint washes over the
   *  frame, then SPA-navigates at the apex. Set on ALL markers now (each scene's
   *  state colours its own bloom). Absent/false markers would navigate normally. */
  dive?: boolean;
}

export interface ManifestoBeat {
  /** Scroll-progress centre of the beat (it owns a ~1/6 slot around this). */
  at: number;
  /** Explicit scroll band for the live overlay copy. */
  text: {
    inStart: number;
    inEnd: number;
    outStart: number;
    outEnd: number;
  };
  /** The lifecycle state this beat narrates (for the label / a11y). */
  state: string;
  /** Primary line. `up` is kept for the existing crossfade component API. */
  down: string;
  up: string;
  /** Small dim elaboration. Shared across both directions; never swaps. */
  whisper: string;
}

/** A scene's optional "linger here" knob. While the active scene declares dwell,
 *  the morph's internal follow-ease is DAMPED (see createScene) so the lifecycle
 *  position lags the raw scroll target a little — the visitor "dwells" on the beat
 *  for a beat longer. It is a damping of the existing ease, NOT a scroll hijack:
 *  the page scrollbar stays fully native (no preventDefault, no scrollTo, scrollY
 *  is never touched), so it remains accessible and reversible. Under reduced motion
 *  it is ignored (the ease is already instant). */
export interface SceneDwell {
  /** How strongly to linger on this scene. 0 = no slowdown (same as absent);
   *  ~1 = strongest lingering. Values are gentle by design — keep below ~0.6 unless
   *  a beat genuinely wants to feel sticky. */
  strength: number;
}

/** One lifecycle scene: its HUD nav row, on-screen markers, and manifesto beat,
 *  colocated so re-timing or re-copying a scene happens in ONE place. */
export interface LifecycleScene {
  id: HudTargetId;
  hud: HudNavItem;
  markers: readonly MarkerPlacement[];
  beat?: ManifestoBeat;
  /** Optional scroll-slowdown for this scene. Absent = no dwell (strength 0). When
   *  present, the morph eases more slowly while this scene is active so the visitor
   *  lingers on the beat — a damping of the internal ease, never a scroll hijack
   *  (see SceneDwell). */
  dwell?: SceneDwell;
  /** When true, reaching this scene REQUESTS the HUD power-on (and leaving it
   *  requests power-off). Declared on the terminal black-hole scene so the bottom
   *  hero ignites the HUD. Absent elsewhere. The actual edge-detect + event dispatch
   *  lives in HeroIsland; this flag is the single source of "which scene arms the
   *  HUD" so it is no longer a hardcoded string test. */
  activatesHud?: boolean;
}

// The five scenes, authored in LIFECYCLE order (beginning/pale-blue-dot first ->
// end/black hole last). Under the active REVERSE direction this is walked from the
// back as the visitor scrolls down (black hole at the physical top, the lonely dot
// at the physical bottom). The projections below
// preserve the former HUD_NAV_ITEMS / MARKER_PLACEMENTS / BEATS order exactly:
// nav rows are one-per-scene in this order; markers are flattened in this order
// (one per scene); beats are one-per-scene in this order.
export const SCENES: readonly LifecycleScene[] = [
  {
    id: 'beginning',
    hud: {
      id: 'beginning',
      glyphSrc: 'glyphs/glyph-dot.svg',
      motion: 'still',
      label: 'THE BEGINNING',
      destination: 'About',
      stage: 4.7,
      href: 'about',
    },
    markers: [
      // BEGINNING / pale blue dot — ONE marker, projection-anchored so it stays
      // centred on the speck wherever the scene projects it.
      {
        id: 'beginning',
        state: 'beginning',
        vx: 0.5,
        vy: 0.5,
        anchored: true,
        href: 'about',
        title: 'ABOUT',
        subtitle: 'Who I am',
        bg: 'dark',
        glyph: 'glyphs/glyph-marker-about.svg',
        eyebrow: 'ABOUT',
        headline: 'Hi, I’m Iliès.',
        body: 'Web software, technical writing, understandable systems.',
        tags: ['Fast', 'Readable', 'Usable'],
        cta: 'Read about me',
        dive: true,
      },
    ],
    beat: {
      // PALE BLUE DOT — the lonely speck the reverse arc resolves to (stage ~4.7).
      // In LIFECYCLE space it is the first beat (these bands are lifecycleProgress
      // values), but under the active reverse direction it sits at the PHYSICAL
      // BOTTOM of the page. Copy is readable across the dot's hold (0.00 -> 0.12 =
      // raw 88-100%, the content-unlock band), then fades as the dot is left behind
      // into the nebula grow.
      //
      // "FADE COPY OUT AT THE VERY END": unlike the other beats (which hard-cut via
      // band()), the dot beat is rendered with a true IN/OUT fade (ManifestoOverlay
      // honours these four fields for the 'pale blue dot' state). The IN ramp is
      // WIDENED to 0.0 -> 0.05 so the line is near-ZERO at the very bottom frame
      // (lifecycleProgress ≈ 0.0) — the lone speck is alone in black — and rises to
      // readable only as the visitor scrolls UP slightly off the bottom. inEnd is the
      // tunable lever for how far up the line takes to bloom in (raise it to keep the
      // copy faint for longer; lower toward inStart to bring it back fast).
      at: 0.05,
      text: { inStart: 0.0, inEnd: 0.05, outStart: 0.12, outEnd: 0.17 },
      state: 'pale blue dot',
      down: 'I build software that stays understandable.',
      up: 'I build software that stays understandable.',
      whisper: 'understandable is a choice you make on purpose.',
    },
  },
  {
    id: 'nebula',
    hud: {
      id: 'nebula',
      glyphSrc: 'glyphs/glyph-nebula.svg',
      motion: 'breathe',
      label: 'NEBULA',
      destination: 'Writing',
      stage: 3.5,
      href: 'writing',
    },
    markers: [
      // NEBULA / writing — ONE marker in the upper-RIGHT sparse region (0.82, 0.22),
      // clear of the centred manifesto headline on all viewport sizes. A single neutral
      // entry point to the writing index rather than per-article placeholders.
      {
        id: 'nebula',
        state: 'nebula',
        vx: 0.82,
        vy: 0.22,
        href: 'writing',
        title: 'WRITING',
        subtitle: 'Notes & essays',
        bg: 'noisy',
        glyph: 'glyphs/glyph-marker-writing.svg',
        eyebrow: 'WRITING',
        headline: 'Notes from the build.',
        body: 'Essays on software that stays readable as it grows.',
        tags: ['Essays', 'Craft'],
        cta: 'Read the writing',
        dive: true,
      },
    ],
    // NEBULA — a gentle dwell so the bloom/collapse around the held frame slow down
    // and the visitor lingers on the fullest cloud rather than blinking past it.
    dwell: { strength: 0.45 },
    beat: {
      // NEBULA — the cloud settles into its held frame around stage 3.42 (~0.26 now)
      // and dwells through the WIDENED collapse band (raw 49-74%). The headline fades in
      // as the cloud settles (~0.27) and out before the yellow ignition; outStart/outEnd
      // shift +0.08 with the collapse span so the copy still clears just before ignition
      // (STAR_IGNITION_START 0.51). `at` re-centred on the longer band.
      at: 0.39,
      text: { inStart: 0.28, inEnd: 0.31, outStart: 0.49, outEnd: 0.51 },
      state: 'nebula',
      // ITEM 8: a clear boundary in the raw material saves a thousand future decisions.
      down: 'One clear boundary can save a thousand future decisions.',
      up: 'One clear boundary can save a thousand future decisions.',
      whisper: 'prompts, diffs, failing tests, half-ideas. raw material, not magic.',
    },
  },
  {
    id: 'yellow',
    hud: {
      id: 'yellow',
      glyphSrc: 'glyphs/glyph-yellow-star.svg',
      motion: 'flicker',
      label: 'YELLOW STAR',
      destination: 'Projects',
      stage: 2.9,
      href: 'projects',
    },
    markers: [
      // YELLOW STAR / projects — ONE marker in the DARK orbital zone upper-RIGHT of
      // the photosphere, NOT on the blazing disc. The settled sun fills the centre /
      // centre-right of the frame; sitting the marker ON it washed the reticle out
      // (the near-black bright-flip strokes vanish on the glowing surface). Per the
      // reference's yellow guidance ("stable orbital zone, off-centre, keep AWAY from
      // the brightest core, label in clean space") it now sits on the faint orbital
      // ring against the clean dark sky upper-right, where it reads crisply and the
      // card opens into empty space. bg is 'noisy' (NOT 'bright'): off the disc it
      // wants LIGHT strokes (bright would flip them near-black and they'd vanish into
      // the dark sky), plus 'noisy' gives the strongest dark backing plate to carve
      // the reticle out of any orbital-ring glow that spills into the corner.
      {
        id: 'yellow',
        state: 'yellow',
        vx: 0.74,
        vy: 0.32,
        href: 'projects',
        title: 'PROJECTS',
        subtitle: 'Things I build',
        bg: 'noisy',
        glyph: 'glyphs/glyph-marker-projects.svg',
        eyebrow: 'PROJECTS',
        headline: 'Things I build.',
        body: 'Shipped software, side projects, and tools that earned their keep.',
        tags: ['Shipped', 'Tools'],
        cta: 'See the projects',
        dive: true,
      },
    ],
    beat: {
      // YELLOW STAR — ignites by ~0.51 (STAR_IGNITION_START) and HOLDS centred across
      // 0.58 -> 0.61 (raw 39-42%). The headline sits in that stable, still window. The band
      // shifts +0.08 in lockstep with the holds moving forward (the hold's LOOK is unchanged,
      // only its scroll position), so the copy still reads on the blazing settled sun.
      at: 0.595,
      text: { inStart: 0.58, inEnd: 0.59, outStart: 0.6, outEnd: 0.61 },
      state: 'yellow star',
      down: 'Systems grow. Interfaces drift. Complexity compounds.',
      up: 'Systems grow. Interfaces drift. Complexity compounds.',
      whisper: "tests, review, small units, boring choices. that's the craft.",
    },
  },
  {
    id: 'red',
    hud: {
      id: 'red',
      glyphSrc: 'glyphs/glyph-red-giant.svg',
      motion: 'drift',
      // The HUD label is the CELESTIAL body (matching NEBULA / YELLOW STAR / BLACK
      // HOLE / THE BEGINNING); the destination is the section it links to. This scene's
      // section happens to be the graveyard, so label MUST be 'RED GIANT' (not
      // 'GRAVEYARD') — otherwise the readout renders the redundant 'GRAVEYARD · GRAVEYARD'.
      label: 'RED GIANT',
      destination: 'Graveyard',
      stage: 2.05,
      href: 'graveyard',
    },
    markers: [
      // RED GIANT / graveyard — ONE marker in the DARK space upper-LEFT, NOT on the
      // limb. The giant is camera-parked and GROWS/drifts LEFT across its settled
      // window (f≈0.23→0.28): its leftmost edge creeps from ~0.42 to ~0.30 of the
      // frame, so the old vx 0.3 ended up sitting ON the orange limb by the end of the
      // hold. Pulled left+up (0.20 / 0.22) into the wedge of black that stays clear
      // across the WHOLE window — below the top-left identity, above the manifesto
      // headline, and RIGHT of the HUD rail (vx 0.20 not 0.15 so the reticle clears
      // the WIDER rail on tablet — rail right edge ≈ 94px / vx 0.12 at 768px). bg
      // 'dark' (light strokes + glow) so it reads on black.
      {
        id: 'red',
        state: 'red',
        vx: 0.225,
        vy: 0.22,
        href: 'graveyard',
        title: 'GRAVEYARD',
        subtitle: 'Things I abandoned',
        bg: 'dark',
        glyph: 'glyphs/glyph-marker-graveyard.svg',
        eyebrow: 'GRAVEYARD',
        headline: 'Things I abandoned.',
        body: 'Dead repos, false starts, and what each one was trying to teach.',
        tags: ['Dead repos', 'Lessons'],
        cta: 'Walk the graveyard',
        dive: true,
      },
    ],
    // RED GIANT — the contemplative beat. A modest dwell so the morph lingers a
    // touch longer here than the brighter nebula/yellow beats. Gentle by design.
    dwell: { strength: 0.5 },
    beat: {
      // RED GIANT — the settled close-up hold band (stage 2.05, progress ~0.74 -> 0.77,
      // raw 23-26%). RED_HOLD_START shifted 0.70 -> 0.74 (the red hold is shorter now, its
      // LOOK unchanged), so the headline window is re-fitted INSIDE the new [0.74, 0.77]
      // hold — it still reads on the surface/active-region close-up beat (ITEM 1's third
      // stage), AFTER the reveal + limb orbit.
      at: 0.755,
      text: { inStart: 0.74, inEnd: 0.75, outStart: 0.76, outEnd: 0.77 },
      state: 'red giant',
      // ITEM 8: complexity expands as the giant bloats — the work is to keep the centre readable.
      down: 'Complexity expands. My work is to keep the center readable.',
      up: 'Complexity expands. My work is to keep the center readable.',
      whisper: 'The AI keeps adding. Nobody is left who understands it.',
    },
  },
  {
    id: 'end',
    hud: {
      id: 'end',
      glyphSrc: 'glyphs/glyph-black-hole.svg',
      motion: 'pulse',
      label: 'BLACK HOLE',
      // The section the black-hole row links to. "Inspiration" — the same word the
      // black-hole MARKER card uses (eyebrow 'INSPIRATION', "Why this site
      // exists") so the rail, the reading-page nav and the on-scene marker all name
      // this destination identically. (Was 'Colophon', which drifted from the marker.)
      destination: 'Inspiration',
      stage: 0,
      href: 'posts/thanks-for-scrolling-to-the-bottom',
    },
    markers: [
      // END / black hole — ONE marker near the event horizon but LIFTED off the
      // brightest beam. The horizontal accretion beam + photon ring blaze straight
      // through the dead centre (0.5, 0.5), where the reticle's dotted idle hex
      // washes out into the ring glow. Per the reference's black-hole guidance
      // ("anchor near event horizon; AVOID the brightest beam; label in negative
      // space"), sit it just ABOVE the disk in the darker sky: still hugging the
      // event horizon, but clear of the beam so all four states read and the card
      // opens into negative space. Horizontally centred over the hole.
      {
        id: 'end',
        state: 'end',
        vx: 0.5,
        vy: 0.34,
        href: 'posts/thanks-for-scrolling-to-the-bottom',
        title: 'INSPIRATION',
        subtitle: 'Why this site exists',
        bg: 'dark',
        glyph: 'glyphs/glyph-marker-story.svg',
        eyebrow: 'INSPIRATION',
        headline: 'Why this site exists.',
        body: 'The idea behind the black hole, and thanks for scrolling this far.',
        tags: ['Story', 'Colophon'],
        cta: 'Read the story',
        // Clicking the black-hole marker flies the live camera INTO it, blooms a
        // soft capped veil (the black-hole/warm-bone tint), then SPA-navigates at
        // the apex. The dive is now on EVERY marker (each in its own state tint).
        dive: true,
      },
    ],
    // BLACK HOLE — the terminal hero. A light dwell so the final settle reads as
    // slightly stickier than the brighter beats above it. Gentle by design.
    dwell: { strength: 0.4 },
    // The ONLY scene that arms the HUD: reaching the black hole requests HUD
    // power-on (leaving it requests power-off). This replaces the former hardcoded
    // `=== 'end'` test in HeroIsland with a table-driven flag.
    activatesHud: true,
    beat: {
      // BLACK HOLE — enters after the easeOutExpo settle has visually completed
      // (~0.86 -> 0.93 in lifecycleProgress). This is the lifecycle's terminal state,
      // so the line holds through lifecycleProgress=1 instead of fading away. Under
      // the active reverse direction that maps to the PHYSICAL TOP of the page (raw
      // 0-14%), so this is the hero line the visitor opens on.
      at: 0.965,
      text: { inStart: 0.94, inEnd: 0.95, outStart: 1.02, outEnd: 1.02 },
      state: 'black hole',
      // ITEM 8: the cinematic opening line — quiet, gravitational, not a direct CTA.
      // ("Explore the projects." moves to the unlocked HUD/project state — see the
      // black-hole HUD nav row's destination below.)
      down: 'Under pressure, structure remains.',
      up: 'Under pressure, structure remains.',
      whisper: 'software engineer building systems that stay readable as they grow.',
    },
  },
];

// --------------------------------------------------------------------------
// Projections — the scattered exports, regenerated from SCENES. Same names,
// shapes and ORDER as the former hand-written literals, so every importer
// (HudNavigation, ManifestoOverlay, index.astro, ExplorationHud, StarMarker,
// HeroIsland) resolves unchanged. The SSR <noscript> mirrors BEATS, so it can
// no longer drift from the live copy.
// --------------------------------------------------------------------------
// The HUD rail reads TOP→BOTTOM in physical SCROLL order — BLACK HOLE (scroll 0,
// top of page) down to THE BEGINNING (scroll 1, bottom of page). That is the
// REVERSE of the lifecycle-ordered SCENES array, so the projection is reversed
// here. `.map()` returns a fresh array, so `.reverse()` does NOT mutate SCENES;
// MARKER_PLACEMENTS and BEATS below keep lifecycle order (other systems key off
// it). Every HUD_NAV_ITEMS consumer is id-keyed or re-sorts, so the reordering
// only affects render order on the rail.
export const HUD_NAV_ITEMS: readonly HudNavItem[] = SCENES.map((s) => s.hud).reverse();

export const MARKER_PLACEMENTS: readonly MarkerPlacement[] = SCENES.flatMap((s) => s.markers);

export const BEATS: ManifestoBeat[] = SCENES.flatMap((s) => (s.beat ? [s.beat] : []));

/** Scene id -> its full LifecycleScene. The single index used by the per-scene
 *  property accessors below (dwell / activatesHud) so a reader never re-finds a
 *  scene by hand. Built once at module load. */
const SCENE_BY_ID: Record<HudTargetId, LifecycleScene> = SCENES.reduce(
  (acc, scene) => {
    acc[scene.id] = scene;
    return acc;
  },
  {} as Record<HudTargetId, LifecycleScene>,
);

/** The dwell STRENGTH (0..1) declared by a scene, or 0 when it has none. This is
 *  the single read of the `dwell` field — lifecycleMachine.resolve() folds it into
 *  the resolved position so createScene can damp its follow-ease. Pure. */
export function dwellForScene(id: HudTargetId): number {
  return SCENE_BY_ID[id]?.dwell?.strength ?? 0;
}

/** Whether a scene arms the HUD (its `activatesHud` flag). The single read of the
 *  flag — HeroIsland's HUD-power edge-detector uses it instead of a hardcoded id.
 *  Only the 'end' scene is flagged today, so the request still fires exactly there. */
export function sceneActivatesHud(id: HudTargetId): boolean {
  return SCENE_BY_ID[id]?.activatesHud === true;
}

// ===========================================================================
// CAMERA TABLE
//
// The per-scene camera framing. cameraPoseForProgress (timeline.ts) used to be a
// second 10-band if-ladder keyed to the SAME breakpoints/easings as the stage
// curve; it is regenerated here from this table. Each band stores its selection
// boundary (endProgress), the interp window the original passed to segment(), the
// easing, the start/end pose (position + target), and the band's parallax.
//
// NOTE the camera bands are NOT 1:1 with SEGMENTS: the stage curve splits the
// dot-hold (band 1) and the dot->nebula grow (band 2), but the CAMERA holds
// DOT_VIEW across the dot-hold and only moves across the grow. The original
// expressed this as a single `p < NEBULA_GROW_END` band whose interp window was
// [DOT_HOLD_END, NEBULA_GROW_END] (so segment() returns 0 — DOT_VIEW — for the
// dot-hold). The table preserves that exactly: band 1 selects `p < 0.195` but
// interps over [0.055, 0.195]. Flat-hold bands set posStart === posEnd (and
// targetStart === targetEnd), so the easing/interp is a no-op there.
//
// The red-hold micro-drift and the nova shake are NOT in this table — they stay
// post-steps applied after the generated base pose in cameraPoseForProgress.
// ===========================================================================
export type Vec3Tuple = readonly [number, number, number];

// PALE DOT (raw 74-100%): a simple, near-static FAR shot, centred on the speck.
const DOT_VIEW_POS: Vec3Tuple = [0.0, 0.0, 78.0];
const DOT_VIEW_TGT: Vec3Tuple = [0.0, 0.0, 0.0];
// NEBULA (raw 58-74%): pulled BACK with breathing room so the cloud reads loose
// (z widened 39 -> 44 / 34 -> 40 vs the old tight push so the gas has air around it).
// FINAL — x zeroed (was -0.7 / 0.18) so the cloud sits CENTRED the whole chapter; clearing
// for the left HUD/text column is done by CSS dimming, NOT a lateral camera pan or a snap-back.
const NEBULA_START_POS: Vec3Tuple = [0.0, 0.14, 44.0];
const NEBULA_START_TGT: Vec3Tuple = [0.0, 0.0, 0.0];
const NEBULA_GATHERED_POS: Vec3Tuple = [0.0, 0.035, 40.0];
const NEBULA_GATHERED_TGT: Vec3Tuple = [0.0, 0.0, 0.0];
// YELLOW STAR (raw 43-58%): a symmetric, centred, low-motion framing — target on
// the origin (no off-axis lean), steady z. Stillness vs the red orbit either side.
const YELLOW_HOLD_POS: Vec3Tuple = [0.0, 0.0, 17.4];
const YELLOW_HOLD_TGT: Vec3Tuple = [0.0, 0.0, 0.0];
// RED GIANT (raw 23-43%): a single settled close-up resting pose — the surface /
// active-region framing the red beat rests on (aimed nearer the surface, upper-left,
// so the granulation/active region reads big). The orb stays at the world origin
// (radius ≈ 10.5) the whole time; only the camera moves (no re-geometry). There is no
// separate "reveal" arrival pose or limb-orbit beat: red->yellow is ONE continuous
// camera move DIRECTLY between the two resting poses (yellow hold <-> this close-up),
// then a flat hold here.
const RED_CLOSE_POS: Vec3Tuple = [-5.6, -0.4, 24.5];
const RED_CLOSE_TGT: Vec3Tuple = [-7.0, -1.6, 8.6];
// REVERSE SUPERNOVA (raw 14-28%): compress inward — the camera eases toward the core
// as the particles pull in. COLLAPSE_PULL (outer, p~0.72) -> SUPERNOVA_RECOIL (inner,
// p~0.86), recentring on the implosion.
const COLLAPSE_PULL_POS: Vec3Tuple = [-4.4, -3.6, 33.0];
const COLLAPSE_PULL_TGT: Vec3Tuple = [-5.6, -3.0, 4.6];
const SUPERNOVA_RECOIL_POS: Vec3Tuple = [-2.6, -1.7, 27.0];
const SUPERNOVA_RECOIL_TGT: Vec3Tuple = [-2.6, -1.4, 2.2];
// BLACK HOLE (raw 0-14%): a tense, close-ish HELD framing at load. The autonomous
// dolly-back (createScene) pulls it away over a few seconds; these are the base
// poses it departs from. EVENT_HORIZON is the terminal hero you open on (closest).
const BLACK_HOLE_SETL_POS: Vec3Tuple = [0.0, 0.05, 23.2];
const BLACK_HOLE_SETL_TGT: Vec3Tuple = [0.0, 0.0, 0.0];
const EVENT_HORIZON_POS: Vec3Tuple = [0.02, 0.08, 21.0];
const EVENT_HORIZON_TGT: Vec3Tuple = [0.0, 0.0, 0.0];

/** One camera band: selected while progress is below `endProgress`, interpolated
 *  over `interp` (the segment() window) through `easing`, mixing pose start->end. */
interface CameraBand {
  /** Selection boundary — this band owns p < endProgress (forward scan). The last
   *  band is the fallthrough (endProgress is Infinity). */
  endProgress: number;
  /** [a, b] window passed to segment() for the local interpolation parameter. */
  interp: readonly [number, number];
  easing: Easing;
  posStart: Vec3Tuple;
  posEnd: Vec3Tuple;
  targetStart: Vec3Tuple;
  targetEnd: Vec3Tuple;
  parallax: number;
}

// The breakpoints reused by the camera bands below (DOT_HOLD_END … RED_HOLD_END)
// are the SAME named consts the stage table exports near STARTS — DERIVED from the
// SEGMENTS prefix-sum, so the camera pose moves in lockstep with the morph by
// construction. They used to be re-typed here (and a third time in timeline.ts) as
// hand-kept-in-sync literals; both copies are gone now that they're table-derived.

// CAMERA_BANDS are keyed to lifecycle p; scrolling DOWN, p decreases 1 -> 0, so the
// visitor walks these bands 10 -> 1. Each band's chapter (raw-scroll band noted) and
// motion character is re-authored for the "one continuous mechanism" grid. Selection
// boundaries (endProgress) and interp windows reuse the RE-TIMED breakpoints above so
// the pose moves in lockstep with the morph. The red-hold micro-drift, the nebula
// breathing drift and the nova shake are post-steps in cameraPoseForProgress.
const CAMERA_BANDS: readonly CameraBand[] = [
  // 1 — PALE DOT (raw 74-100%). Holds DOT_VIEW across the dot-hold/content band
  // (interp starts at DOT_HOLD_END so p < 0.12 sits at DOT_VIEW — calm/held while
  // the HUD is armed), then loosens toward the nebula. Linear, near-static.
  {
    endProgress: NEBULA_GROW_END,
    interp: [DOT_HOLD_END, NEBULA_GROW_END],
    easing: 'linear',
    posStart: DOT_VIEW_POS,
    posEnd: NEBULA_START_POS,
    targetStart: DOT_VIEW_TGT,
    targetEnd: NEBULA_START_TGT,
    parallax: 0.04,
  },
  // 2 — NEBULA (raw 58-74%). Loose, pulled-back framing with breathing room: a slow
  // shallow drift between the two roomy nebula poses (the gentle low-freq breathing
  // sine is added as a post-step). easeInOutCubic = soft in/out.
  {
    endProgress: STAR_IGNITION_START,
    interp: [NEBULA_GROW_END, STAR_IGNITION_START],
    easing: 'easeInOutCubic',
    posStart: NEBULA_START_POS,
    posEnd: NEBULA_GATHERED_POS,
    targetStart: NEBULA_START_TGT,
    targetEnd: NEBULA_GATHERED_TGT,
    parallax: 0.05,
  },
  // 3 — NEBULA -> YELLOW ignition (raw 42-49%): ease in to the centred yellow hold.
  {
    endProgress: YELLOW_SETTLE_END,
    interp: [STAR_IGNITION_START, YELLOW_SETTLE_END],
    easing: 'easeInOutCubic',
    posStart: NEBULA_GATHERED_POS,
    posEnd: YELLOW_HOLD_POS,
    targetStart: NEBULA_GATHERED_TGT,
    targetEnd: YELLOW_HOLD_TGT,
    parallax: 0.04,
  },
  // 4 — YELLOW STAR hold (raw 39-42%): symmetric, centred, low-motion beat (flat).
  // Stillness — the idle roll/shake are reduced across this band (see createScene).
  {
    endProgress: YELLOW_HOLD_END,
    interp: [YELLOW_SETTLE_END, YELLOW_HOLD_END],
    easing: 'linear',
    posStart: YELLOW_HOLD_POS,
    posEnd: YELLOW_HOLD_POS,
    targetStart: YELLOW_HOLD_TGT,
    targetEnd: YELLOW_HOLD_TGT,
    parallax: 0.03,
  },
  // 5 — YELLOW -> RED GIANT (raw 33-43%): the WHOLE red->yellow camera move — ONE
  // continuous travel DIRECTLY between the two resting poses, from the centred yellow
  // hold to the settled red-giant close-up (no intermediate reveal arrival). The orb
  // never leaves the origin (pure camera move). easeInOutCubic so it eases between the
  // two rests without a snap.
  {
    endProgress: RED_HOLD_START,
    interp: [YELLOW_HOLD_END, RED_HOLD_START],
    easing: 'easeInOutCubic',
    posStart: YELLOW_HOLD_POS,
    posEnd: RED_CLOSE_POS,
    targetStart: YELLOW_HOLD_TGT,
    targetEnd: RED_CLOSE_TGT,
    parallax: 0.025,
  },
  // 6 — RED GIANT HOLD (raw 23-33%): a true still hold on the settled close-up resting
  // pose (flat: start === end === RED_CLOSE). Band 5 already did the whole move into
  // it; there is no limb-orbit / second beat. The red-hold micro-drift rides on top.
  {
    endProgress: RED_HOLD_END,
    interp: [RED_HOLD_START, RED_HOLD_END],
    easing: 'easeInOutCubic',
    posStart: RED_CLOSE_POS,
    posEnd: RED_CLOSE_POS,
    targetStart: RED_CLOSE_TGT,
    targetEnd: RED_CLOSE_TGT,
    parallax: 0.015,
  },
  // 7 — REVERSE COLLAPSE, outer (raw 19-23%): from the red-giant CLOSE-UP the camera
  // compresses inward toward the collapse core as the particles pull in. SHORTENED
  // band (ITEM 3) — the inward compress is brief, the collapse is a flash not a beat.
  {
    endProgress: 0.81,
    interp: [RED_HOLD_END, 0.81],
    easing: 'easeInOutCubic',
    posStart: RED_CLOSE_POS,
    posEnd: COLLAPSE_PULL_POS,
    targetStart: RED_CLOSE_TGT,
    targetEnd: COLLAPSE_PULL_TGT,
    parallax: 0.0,
  },
  // 8 — REVERSE COLLAPSE, inner (raw 15-19%): continue the inward compress, recoiling
  // toward the recentred implosion as the energy gathers in. SHORTENED band (ITEM 3).
  {
    endProgress: 0.85,
    interp: [0.81, 0.85],
    easing: 'easeInOutCubic',
    posStart: COLLAPSE_PULL_POS,
    posEnd: SUPERNOVA_RECOIL_POS,
    targetStart: COLLAPSE_PULL_TGT,
    targetEnd: SUPERNOVA_RECOIL_TGT,
    parallax: 0.0,
  },
  // 9 — BLACK HOLE settle (raw 7-15%): finish the recentre onto the now-centred hole.
  {
    endProgress: 0.93,
    interp: [0.85, 0.93],
    easing: 'easeOutExpo',
    posStart: SUPERNOVA_RECOIL_POS,
    posEnd: BLACK_HOLE_SETL_POS,
    targetStart: SUPERNOVA_RECOIL_TGT,
    targetEnd: BLACK_HOLE_SETL_TGT,
    parallax: 0.025,
  },
  // 10 — EVENT HORIZON (raw 0-7%): the terminal black-hole hero you open on — a
  // tense, close, almost-frozen hold (fallthrough band). The autonomous dolly-back
  // (createScene) pulls the camera away from here over a few seconds, then settles.
  {
    endProgress: Number.POSITIVE_INFINITY,
    interp: [0.93, 1.0],
    easing: 'smoothstep',
    posStart: BLACK_HOLE_SETL_POS,
    posEnd: EVENT_HORIZON_POS,
    targetStart: BLACK_HOLE_SETL_TGT,
    targetEnd: EVENT_HORIZON_TGT,
    parallax: 0.018,
  },
];

const mixVec = (a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** The base camera pose (position, target, parallax) for a lifecycle-space value
 *  `p` (already routed through lifecycleProgress by the caller). Walks CAMERA_BANDS
 *  exactly as the former if-ladder did. The red-hold micro-drift and nova shake
 *  are applied by the caller as post-steps; they are intentionally NOT here. */
export function cameraBaseForLifecycleP(p: number): {
  position: Vec3Tuple;
  target: Vec3Tuple;
  parallax: number;
} {
  let band = CAMERA_BANDS[CAMERA_BANDS.length - 1];
  for (const b of CAMERA_BANDS) {
    if (p < b.endProgress) {
      band = b;
      break;
    }
  }
  const t = EASE[band.easing](segment(p, band.interp[0], band.interp[1]));
  return {
    position: mixVec(band.posStart, band.posEnd, t),
    target: mixVec(band.targetStart, band.targetEnd, t),
    parallax: band.parallax,
  };
}
