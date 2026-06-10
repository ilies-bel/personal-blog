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

/** yellow <-> red mesh/cloud crossover stage (the flash-swap point). */
export const SWAP_STAGE = 2.88;
/** red giant -> yellow size contraction window (the cloud shrinks to gold size). */
export const RED_EXIT_START = 2.5;
/** red giant -> yellow colour cool window (just behind the size contraction). */
export const RED_COLOR_EXIT_START = 2.52;
/** red giant fully shrunk to yellow size before the SWAP_STAGE handoff. */
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
   *  'ABOUT / 01'). Falls back to `title` when absent. */
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

// The five scenes, authored top-of-page -> bottom-of-page. The projections below
// preserve the former HUD_NAV_ITEMS / MARKER_PLACEMENTS / BEATS order exactly:
// nav rows are one-per-scene in this order; markers are flattened in this order
// (nebula owns three); beats are one-per-scene in this order.
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
        eyebrow: 'ABOUT / 01',
        headline: 'Hi, I’m Iliès.',
        body: 'Web software, technical writing, understandable systems.',
        tags: ['Fast', 'Readable', 'Usable'],
        cta: 'Read about me',
      },
    ],
    beat: {
      // PALE BLUE DOT — the opening speck (stage ~4.7 at the very top). Copy is
      // fully visible immediately, then fades out before the dot blooms into the
      // nebula. Dot hold is now 0.00 -> 0.055, so the fade-out starts at 0.06.
      at: 0.025,
      text: { inStart: 0.0, inEnd: 0.0, outStart: 0.06, outEnd: 0.09 },
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
      // NEBULA / writing — THREE placeholder markers (one per recent article), all
      // linking to /writing for now. Pulled OUT of the dense gas into the sparse /
      // near-empty regions so each hexagon reads against dark background.
      {
        id: 'nebula-01',
        state: 'nebula',
        vx: 0.82,
        vy: 0.22,
        href: 'writing',
        title: 'WRITING / 01',
        subtitle: 'Notes & essays',
        bg: 'noisy',
        glyph: 'glyphs/glyph-marker-writing.svg',
        eyebrow: 'WRITING / 01',
        headline: 'Notes from the build.',
        body: 'Essays on software that stays readable as it grows.',
        tags: ['Essays', 'Craft'],
        cta: 'Read the writing',
      },
      {
        id: 'nebula-02',
        state: 'nebula',
        vx: 0.19,
        vy: 0.4,
        href: 'writing',
        title: 'WRITING / 02',
        subtitle: 'Notes & essays',
        bg: 'noisy',
        glyph: 'glyphs/glyph-marker-writing.svg',
        eyebrow: 'WRITING / 02',
        headline: 'Thinking in systems.',
        body: 'Boundaries, interfaces, and the cost of complexity over time.',
        tags: ['Systems', 'Design'],
        cta: 'Read the writing',
      },
      {
        id: 'nebula-03',
        state: 'nebula',
        vx: 0.58,
        vy: 0.8,
        href: 'writing',
        title: 'WRITING / 03',
        subtitle: 'Notes & essays',
        bg: 'noisy',
        glyph: 'glyphs/glyph-marker-writing.svg',
        eyebrow: 'WRITING / 03',
        headline: 'Working with the machine.',
        body: 'On AI-assisted code, and keeping the center understandable.',
        tags: ['AI', 'Practice'],
        cta: 'Read the writing',
      },
    ],
    beat: {
      // NEBULA — after the longer lightspeed approach, the cloud grows into the held
      // frame. NEBULA_GROW_END is now 0.195; collapse starts at 0.33. The text fades
      // in as the cloud settles (~0.195) and out well before collapse (~0.28).
      at: 0.21,
      text: { inStart: 0.185, inEnd: 0.2, outStart: 0.28, outEnd: 0.295 },
      state: 'nebula',
      down: 'One boundary can outlive a thousand generated lines.',
      up: 'One boundary can outlive a thousand generated lines.',
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
      // YELLOW STAR / projects — ONE marker, upper-left quadrant of the photosphere.
      {
        id: 'yellow',
        state: 'yellow',
        vx: 0.4,
        vy: 0.38,
        href: 'projects',
        title: 'PROJECTS',
        subtitle: 'Things I build',
        bg: 'bright',
        glyph: 'glyphs/glyph-marker-projects.svg',
        eyebrow: 'PROJECTS / 01',
        headline: 'Things I build.',
        body: 'Shipped software, side projects, and tools that earned their keep.',
        tags: ['Shipped', 'Tools'],
        cta: 'See the projects',
      },
    ],
    beat: {
      // YELLOW STAR — ignites by ~0.33 (STAR_IGNITION_START) and dwells through
      // ~0.395 (YELLOW_SETTLE_END). The headline sits in the stable window.
      at: 0.355,
      text: { inStart: 0.31, inEnd: 0.325, outStart: 0.385, outEnd: 0.395 },
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
      label: 'GRAVEYARD',
      destination: 'Graveyard',
      stage: 2.05,
      href: 'graveyard',
    },
    markers: [
      // RED GIANT / graveyard — ONE marker, fixed spot over the red limb.
      {
        id: 'red',
        state: 'red',
        vx: 0.5,
        vy: 0.46,
        href: 'graveyard',
        title: 'GRAVEYARD',
        subtitle: 'Things I abandoned',
        bg: 'noisy',
        glyph: 'glyphs/glyph-marker-graveyard.svg',
        eyebrow: 'GRAVEYARD / 01',
        headline: 'Things I abandoned.',
        body: 'Dead repos, false starts, and what each one was trying to teach.',
        tags: ['Dead repos', 'Lessons'],
        cta: 'Walk the graveyard',
      },
    ],
    // RED GIANT — the contemplative beat. A modest dwell so the morph lingers a
    // touch longer here than the brighter nebula/yellow beats. Gentle by design.
    dwell: { strength: 0.5 },
    beat: {
      // RED GIANT — the hold band (stage 2.05, progress ~0.524 -> 0.678).
      at: 0.601,
      text: { inStart: 0.524, inEnd: 0.545, outStart: 0.655, outEnd: 0.676 },
      state: 'red giant',
      down: 'My work is to keep the center readable.',
      up: 'My work is to keep the center readable.',
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
      destination: 'Inspiration',
      stage: 0,
      href: 'posts/thanks-for-scrolling-to-the-bottom',
    },
    markers: [
      // END / black hole — ONE marker, fixed spot near the hero centre.
      {
        id: 'end',
        state: 'end',
        vx: 0.5,
        vy: 0.5,
        href: 'posts/thanks-for-scrolling-to-the-bottom',
        title: 'INSPIRATION',
        subtitle: 'Why this site exists',
        bg: 'dark',
        glyph: 'glyphs/glyph-marker-story.svg',
        eyebrow: 'INSPIRATION / 01',
        headline: 'Why this site exists.',
        body: 'The idea behind the black hole, and thanks for scrolling this far.',
        tags: ['Story', 'Colophon'],
        cta: 'Read the story',
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
      // (~0.82 -> 0.946). This is the terminal state, so the line holds through
      // progress=1 instead of fading away at the absolute bottom.
      at: 0.968,
      text: { inStart: 0.955, inEnd: 0.965, outStart: 1.02, outEnd: 1.02 },
      state: 'black hole',
      down: 'Explore the projects.',
      up: 'Explore the projects.',
      whisper: 'Even the repo you were proud of can collapse.',
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
export const HUD_NAV_ITEMS: readonly HudNavItem[] = SCENES.map((s) => s.hud);

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

const DOT_VIEW_POS: Vec3Tuple = [0.0, 0.0, 78.0];
const DOT_VIEW_TGT: Vec3Tuple = [0.0, 0.0, 0.0];
const NEBULA_START_POS: Vec3Tuple = [-0.7, 0.14, 39.0];
const NEBULA_START_TGT: Vec3Tuple = [0.0, 0.0, 0.0];
const NEBULA_GATHERED_POS: Vec3Tuple = [0.18, 0.035, 34.0];
const NEBULA_GATHERED_TGT: Vec3Tuple = [0.0, 0.0, 0.0];
const YELLOW_HOLD_POS: Vec3Tuple = [0.62, -0.08, 17.4];
const YELLOW_HOLD_TGT: Vec3Tuple = [0.0, -0.02, 0.0];
const RED_COMPOSITION_POS: Vec3Tuple = [-5.5, -5.55, 38.2];
const RED_COMPOSITION_TGT: Vec3Tuple = [-7.9, -4.7, 7.0];
const COLLAPSE_PULL_POS: Vec3Tuple = [-4.4, -3.6, 33.0];
const COLLAPSE_PULL_TGT: Vec3Tuple = [-5.6, -3.0, 4.6];
const SUPERNOVA_RECOIL_POS: Vec3Tuple = [-2.6, -1.7, 28.0];
const SUPERNOVA_RECOIL_TGT: Vec3Tuple = [-2.6, -1.4, 2.2];
const BLACK_HOLE_SETL_POS: Vec3Tuple = [0.0, 0.05, 23.2];
const BLACK_HOLE_SETL_TGT: Vec3Tuple = [0.0, 0.0, 0.0];
const EVENT_HORIZON_POS: Vec3Tuple = [0.02, 0.08, 21.8];
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

// Breakpoints reused by the camera bands (the same numbers as the stage table; the
// camera shares them so the pose moves in lockstep with the morph).
const NEBULA_GROW_END = 0.195;
const STAR_IGNITION_START = 0.33;
const YELLOW_SETTLE_END = 0.395;
const YELLOW_HOLD_END = 0.47;
const RED_HOLD_START = 0.524;
const RED_HOLD_END = 0.678;
const DOT_HOLD_END = 0.055;

const CAMERA_BANDS: readonly CameraBand[] = [
  // 1 — DOT -> NEBULA grow. Holds DOT_VIEW across the dot-hold (interp starts at
  // DOT_HOLD_END), then lerps to NEBULA_START. Linear on purpose.
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
  // 2 — NEBULA hold + collapse: shallow push toward the gathering core.
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
  // 3 — IGNITION: ease out to the yellow-star hold.
  {
    endProgress: YELLOW_SETTLE_END,
    interp: [STAR_IGNITION_START, YELLOW_SETTLE_END],
    easing: 'easeOutCubic',
    posStart: NEBULA_GATHERED_POS,
    posEnd: YELLOW_HOLD_POS,
    targetStart: NEBULA_GATHERED_TGT,
    targetEnd: YELLOW_HOLD_TGT,
    parallax: 0.05,
  },
  // 4 — YELLOW hold: the close, centred yellow-star beat (flat).
  {
    endProgress: YELLOW_HOLD_END,
    interp: [YELLOW_SETTLE_END, YELLOW_HOLD_END],
    easing: 'linear',
    posStart: YELLOW_HOLD_POS,
    posEnd: YELLOW_HOLD_POS,
    targetStart: YELLOW_HOLD_TGT,
    targetEnd: YELLOW_HOLD_TGT,
    parallax: 0.04,
  },
  // 5 — YELLOW -> RED: one continuous travel out to the corner.
  {
    endProgress: RED_HOLD_START,
    interp: [YELLOW_HOLD_END, RED_HOLD_START],
    easing: 'easeOutCubic',
    posStart: YELLOW_HOLD_POS,
    posEnd: RED_COMPOSITION_POS,
    targetStart: YELLOW_HOLD_TGT,
    targetEnd: RED_COMPOSITION_TGT,
    parallax: 0.04,
  },
  // 6 — RED hold: the off-centre limb composition (flat).
  {
    endProgress: RED_HOLD_END,
    interp: [RED_HOLD_START, RED_HOLD_END],
    easing: 'linear',
    posStart: RED_COMPOSITION_POS,
    posEnd: RED_COMPOSITION_POS,
    targetStart: RED_COMPOSITION_TGT,
    targetEnd: RED_COMPOSITION_TGT,
    parallax: 0.015,
  },
  // 7 — COLLAPSE reveal: pull back toward the collapse framing.
  {
    endProgress: 0.748,
    interp: [RED_HOLD_END, 0.748],
    easing: 'easeOutCubic',
    posStart: RED_COMPOSITION_POS,
    posEnd: COLLAPSE_PULL_POS,
    targetStart: RED_COMPOSITION_TGT,
    targetEnd: COLLAPSE_PULL_TGT,
    parallax: 0.0,
  },
  // 8 — SUPERNOVA waypoint on the continuous recentre.
  {
    endProgress: 0.82,
    interp: [0.748, 0.82],
    easing: 'easeOutCubic',
    posStart: COLLAPSE_PULL_POS,
    posEnd: SUPERNOVA_RECOIL_POS,
    targetStart: COLLAPSE_PULL_TGT,
    targetEnd: SUPERNOVA_RECOIL_TGT,
    parallax: 0.0,
  },
  // 9 — BLACK HOLE settle: finish the recentre, now centred.
  {
    endProgress: 0.946,
    interp: [0.82, 0.946],
    easing: 'easeOutExpo',
    posStart: SUPERNOVA_RECOIL_POS,
    posEnd: BLACK_HOLE_SETL_POS,
    targetStart: SUPERNOVA_RECOIL_TGT,
    targetEnd: BLACK_HOLE_SETL_TGT,
    parallax: 0.025,
  },
  // 10 — EVENT HORIZON: the terminal black-hole hero (fallthrough band).
  {
    endProgress: Number.POSITIVE_INFINITY,
    interp: [0.946, 1.0],
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
