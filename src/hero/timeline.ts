import { clamp01, segment } from './scroll';

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
// TEMPORARY direction (this pass keeps the normal lifecycle):
//     nebula -> yellow star -> red giant -> collapse/supernova -> black hole
// The FINAL intended direction (a later pass, NOT performed here):
//     black hole -> reverse supernova -> red giant -> yellow star -> nebula
//
// To perform the future inversion, flip LIFECYCLE_DIRECTION to "reverse". Every
// downstream system (camera poses, the legacy "stage" mapping, beats, HUD) reads
// lifecycleProgress through legacyStageForProgress / cameraPoseForProgress, so
// the single flag below is the only edit the inversion requires here. The shader
// "stage" coordinate stays untouched — lifecycle.ts remains a pure function of it.
// ===========================================================================
export type LifecycleDirection = 'normal' | 'reverse';
export const LIFECYCLE_DIRECTION: LifecycleDirection = 'normal';

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
const mixVec = (a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

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

const DOT_HOLD_END = 0.055;      // widened: 0.04 -> 0.055 (dot holds longer before bloom)
const NEBULA_GROW_END = 0.195;   // widened: 0.18 -> 0.195 (nebula settles before collapse)
const STAR_IGNITION_START = 0.33; // widened: 0.316 -> 0.33 (more collapse travel time)
const YELLOW_SETTLE_END = 0.395;  // widened: 0.37 -> 0.395 (more yellow-star dwell)
// The yellow star HOLDS close + centred across YELLOW_SETTLE_END→YELLOW_HOLD_END so the
// dive-in resolves into a real beat (headline reads on the blazing sun). Only AFTER this
// hold does the giant grow + the camera travel out to the corner — so yellow→red reads
// as ONE move (grow + pull to the final corner) instead of "dive in, then reverse out".
const YELLOW_HOLD_END = 0.47;     // widened: 0.42 -> 0.47 (yellow star lingers on screen longer before the grow-to-red); strictly between YELLOW_SETTLE_END (0.395) and RED_HOLD_START (0.524)
// Red-giant hold band. Named so camera and stage use the same numbers.
const RED_HOLD_START = 0.524;    // widened: 0.514 -> 0.524 (slightly more yellow-to-red travel)
const RED_HOLD_END = 0.678;      // widened: 0.658 -> 0.678 (more settled red-giant dwell)

// The public cinematic timeline. The existing shaders still understand the older
// reverse "stage" coordinates, so this is the single handoff from the new story
// into the proven morph machinery. `progress` is the RAW scroll value; we run it
// through lifecycleProgress() so LIFECYCLE_DIRECTION owns which way time flows.
//
// Phase bands (in lifecycleProgress space) match the cinematic spec exactly:
//   0.00-0.16 nebulaFormation | 0.16-0.22 yellowStarIgnition |
//   0.22-0.30 yellowStarContemplation (nearly-flat hold near the settled gold) |
//   0.30-0.46 redGiantGrowth  | 0.46-0.62 redGiantHold       |
//   0.62-0.72 collapse        | 0.72-0.80 supernova          |
//   0.80-0.94 blackHoleFormation | 0.94-1.00 blackHoleHold / portfolio lure.
export function legacyStageForProgress(progress: number): number {
  const p = lifecycleProgress(progress);

  // --- THE PALE-BLUE-DOT OPENING (progress 0.00 -> 0.18) -------------------
  // The page OPENS on a lone pale-blue speck (the cosmic "you are here"), which
  // then runs a longer lightspeed approach before the nebula resolves. The dot
  // state needs stage >= 4.5 (see lifecycle.ts `dot`), so the top of the arc
  // reaches up to DOT_STAGE 4.70. The nebula first appears smaller, then grows
  // into its held frame before the collapse window takes over.
  if (p < DOT_HOLD_END) {
    // DOT HOLD: a near-pixel speck in a vast black field. Barely moves (4.70 -> 4.50)
    // so the opening frame rests as a single quiet point before anything happens.
    return lerp(4.7, 4.5, smoothstep(segment(p, 0.0, DOT_HOLD_END)));
  }
  if (p < NEBULA_GROW_END) {
    // DOT -> NEBULA grow: linear on purpose. The shader uses the same stage span
    // to scale the cloud out from the pale-blue point, so easing here would make
    // the visible growth clump at the end instead of reading as steady travel.
    return lerp(4.5, 3.42, segment(p, DOT_HOLD_END, NEBULA_GROW_END));
  }
  if (p < STAR_IGNITION_START) {
    // THE COLLAPSE — the heart of the nebula -> star transition. Stage walks the
    // WHOLE collapse window (3.42 -> 3.02, the lifecycle's [3.0, 3.5] band) across a
    // GENEROUS scroll stretch so the gas visibly streams INWARD and FEEDS the forming
    // star instead of the old 6%-of-scroll flick that skipped the window (which made
    // the star pop "out of nowhere"). easeInOutCubic so the infall accelerates into
    // the middle of the window and eases as the core fills.
    return lerp(3.42, 3.02, easeInOutCubic(segment(p, NEBULA_GROW_END, STAR_IGNITION_START)));
  }
  if (p < YELLOW_SETTLE_END) {
    // IGNITION + CONTEMPLATION: the star has condensed out of the gas; finish into
    // the settled gold (3.02 -> 2.88, the gas-free 2.88->3.0 yellow band) and hold
    // there so the visitor can read the headline on the blazing sun before the red-
    // giant growth resumes the descent.
    return lerp(3.02, 2.88, easeOutCubic(segment(p, STAR_IGNITION_START, YELLOW_SETTLE_END)));
  }
  if (p < YELLOW_HOLD_END) {
    // YELLOW HOLD: stay at the settled gold (no growth) while the camera sits on the
    // close yellow-star beat. Growth resumes only after, so the move to the corner is
    // one continuous gesture rather than starting mid-dive-in.
    return 2.88;
  }
  if (p < RED_HOLD_START) {
    return lerp(2.88, 2.05, easeInOutCubic(segment(p, YELLOW_HOLD_END, RED_HOLD_START)));
  }
  if (p < RED_HOLD_END) {
    return 2.05;
  }
  if (p < 0.748) {
    return lerp(1.05, 0.5, easeInQuart(segment(p, RED_HOLD_END, 0.748)));
  }
  if (p < 0.82) {
    return lerp(0.5, 0.32, easeOutCubic(segment(p, 0.748, 0.82)));
  }
  if (p < 0.946) {
    return lerp(0.32, 0.08, easeOutExpo(segment(p, 0.82, 0.946)));
  }
  return lerp(0.08, 0.0, smoothstep(segment(p, 0.946, 1.0)));
}

// Approximate inverse used only for HUD previews, where matching the selected
// object's camera family matters more than a mathematically exact eased inverse.
export function progressForLegacyStage(stage: number): number {
  // Inverse of legacyStageForProgress — keep the breakpoints in lockstep with it
  // (both derive from the same progress->stage table). The leading dot bands map
  // the pale-blue-dot opening (stage 4.70 -> 3.42) onto progress 0.00 -> 0.18.
  if (stage >= 4.7) return 0.0;
  if (stage >= 4.5) return lerp(0.0, DOT_HOLD_END, (4.7 - stage) / (4.7 - 4.5));
  if (stage >= 3.42) return lerp(DOT_HOLD_END, NEBULA_GROW_END, (4.5 - stage) / (4.5 - 3.42));
  if (stage >= 3.02) return lerp(NEBULA_GROW_END, STAR_IGNITION_START, (3.42 - stage) / (3.42 - 3.02));
  if (stage >= 2.88) return lerp(STAR_IGNITION_START, YELLOW_SETTLE_END, (3.02 - stage) / (3.02 - 2.88));
  // stage 2.88 holds across [YELLOW_SETTLE_END, YELLOW_HOLD_END]; the 2.88→2.05 growth
  // then maps onto [YELLOW_HOLD_END, RED_HOLD_START] (in lockstep with legacyStageForProgress).
  if (stage >= 2.05) return lerp(YELLOW_HOLD_END, RED_HOLD_START, (2.88 - stage) / (2.88 - 2.05));
  if (stage >= 1.05) return (RED_HOLD_START + RED_HOLD_END) / 2; // mid-hold approx (used for HUD preview)
  if (stage >= 0.5) return lerp(RED_HOLD_END, 0.748, (1.05 - stage) / (1.05 - 0.5));
  if (stage >= 0.32) return lerp(0.748, 0.82, (0.5 - stage) / (0.5 - 0.32));
  if (stage >= 0.08) return lerp(0.82, 0.946, (0.32 - stage) / (0.32 - 0.08));
  return lerp(0.946, 1.0, (0.08 - Math.max(0, stage)) / 0.08);
}

// DOT framing: the opening pale-blue speck. Far back and on-axis so the tiny dot
// sphere (radius ≈ uGiantR*0.018 ≈ 0.076) reads as a near-pixel point in a vast
// black field. The camera flies IN from here to the first nebula approach frame as
// the dot blooms into the cloud, so the bloom reads as travel, not a hard state swap.
const DOT_VIEW = {
  position: [0.0, 0.0, 78.0] as Vec3Tuple,
  target: [0.0, 0.0, 0.0] as Vec3Tuple,
};
// NEBULA framing: the cloud is a big ROUND volume centred at the origin (extent
// NR = uGiantR*1.72 ≈ 7.2). The shader grows the volume linearly from the dot
// while the camera moves linearly toward this wider, outside-the-cloud stop.
const NEBULA_START = {
  // RESTING nebula framing. Farther back than the previous close endpoint, so the
  // arrival reads as stopping outside the cloud instead of entering the fog.
  position: [-0.70, 0.14, 39.0] as Vec3Tuple,
  target: [0.0, 0.0, 0.0] as Vec3Tuple,
};
// GATHERED framing: a shallow push toward the core as the gas converges. It stays
// farther back than the old close nebula frame, so the cloud gathers without the
// camera disappearing into it.
const NEBULA_GATHERED = {
  position: [0.18, 0.035, 34.0] as Vec3Tuple,
  target: [0.0, 0.0, 0.0] as Vec3Tuple,
};
// YELLOW STAR birth/hold framing. After the wider nebula approach, ignition moves
// back toward the established yellow-star composition so the new sun can still
// read as a proper blazing beat rather than a tiny dot at nebula distance.
const YELLOW_HOLD = {
  position: [0.62, -0.08, 17.4] as Vec3Tuple,
  target: [0.0, -0.02, 0.0] as Vec3Tuple,
};
// RED GIANT "corner" framing. This is ONE continuous-travel destination: the camera
// flies here in a single move from YELLOW_HOLD as the star grows (no settle-then-park).
// The off-centre composition is baked straight INTO this pose — the old separate
// RED_GIANT_PARK add (which double-offset on top of this and ramped out mid-collapse,
// causing a centre→corner→centre wobble) is gone. This = the dialed-in framing
// (former RED_COMPOSITION + park (1.3,-4.5,7)): the grown giant fills the upper-right,
// its limb curving across, viewed from a lower-left vantage.
const RED_COMPOSITION = {
  position: [-5.5, -5.55, 38.2] as Vec3Tuple,
  target: [-7.9, -4.7, 7.0] as Vec3Tuple,
};
// COLLAPSE: the giant holds in the corner (above) and STARTS collapsing there. The
// camera then leaves the corner and travels SLOWLY toward centre while the surface
// keeps caving in — so this pose stays well off-centre (close to the corner), and the
// recentring is spread across the whole collapse→supernova→black-hole chain instead of
// being rushed here. The collapse core inherits the giant's screen position; it only
// drifts toward centre as the blast grows, never jump-cutting back to dead-centre.
const COLLAPSE_PULL = {
  position: [-4.4, -3.6, 33.0] as Vec3Tuple,
  target: [-5.6, -3.0, 4.6] as Vec3Tuple,
};
// SUPERNOVA: an INTERMEDIATE waypoint on the continuous recentre. The blast erupts
// from the (still off-centre) collapse point and expands; the camera keeps easing
// the core toward centre as the shell fills the frame — but only PARTWAY here, so the
// corner→centre journey is spread smoothly across collapse→supernova→black-hole rather
// than recentring in one segment. z keeps moving monotonically inward (38.2→33→28→23.2
// →21.8) — no push-in spike. BLACK_HOLE_SETL below finishes the recentre (it stays the
// untouched "slightly off-centre, then drifts to centred" black-hole ending).
const SUPERNOVA_RECOIL = {
  position: [-2.6, -1.7, 28.0] as Vec3Tuple,
  target: [-2.6, -1.4, 2.2] as Vec3Tuple,
};
// BLACK HOLE forms from the settling debris: continue the same gentle inward
// drift, now fully centred, as the remnant condenses. Monotonic z (24.8 -> 23.2
// -> 21.8) so the whole collapse->blast->hole reads as one continuous physical
// pull, never a teleport to a tiny dot.
const BLACK_HOLE_SETL = {
  position: [0.0, 0.05, 23.2] as Vec3Tuple,
  target: [0.0, 0.0, 0.0] as Vec3Tuple,
};
const EVENT_HORIZON = {
  position: [0.02, 0.08, 21.8] as Vec3Tuple,
  target: [0.0, 0.0, 0.0] as Vec3Tuple,
};

export function cameraPoseForProgress(progress: number, time: number, nova: number, reduced: boolean): CameraPose {
  // `progress` is the RAW scroll value; route through lifecycleProgress so the
  // camera arc inherits LIFECYCLE_DIRECTION along with everything else.
  const p = lifecycleProgress(progress);
  let position = DOT_VIEW.position;
  let target = DOT_VIEW.target;
  let parallax = 0.08;

  if (p < NEBULA_GROW_END) {
    // DOT -> NEBULA GROW: linear on purpose, matching the shader's point-to-cloud
    // scale so the nebula expands at a steady rate from the original point.
    const t = segment(p, DOT_HOLD_END, NEBULA_GROW_END);
    position = mixVec(DOT_VIEW.position, NEBULA_START.position, t);
    target = mixVec(DOT_VIEW.target, NEBULA_START.target, t);
    parallax = 0.04;
  } else if (p < STAR_IGNITION_START) {
    // NEBULA hold + COLLAPSE: stay wider while the gas streams inward. The camera
    // makes only a shallow push toward the gathering core, so the cloud gathers
    // without losing its round silhouette.
    const t = easeInOutCubic(segment(p, NEBULA_GROW_END, STAR_IGNITION_START));
    position = mixVec(NEBULA_START.position, NEBULA_GATHERED.position, t);
    target = mixVec(NEBULA_START.target, NEBULA_GATHERED.target, t);
    parallax = 0.05;
  } else if (p < YELLOW_SETTLE_END) {
    // IGNITION: the gas has fed the star; ease out from the immersed core framing to
    // the yellow-star hold as the sun settles into its blazing main-sequence beat.
    const t = easeOutCubic(segment(p, STAR_IGNITION_START, YELLOW_SETTLE_END));
    position = mixVec(NEBULA_GATHERED.position, YELLOW_HOLD.position, t);
    target = mixVec(NEBULA_GATHERED.target, YELLOW_HOLD.target, t);
    parallax = 0.05;
  } else if (p < YELLOW_HOLD_END) {
    // YELLOW HOLD: the close, centred yellow-star beat. The camera dwells here (the
    // dive-in has resolved) so the next move reads as its own single gesture.
    position = YELLOW_HOLD.position;
    target = YELLOW_HOLD.target;
    parallax = 0.04;
  } else if (p < RED_HOLD_START) {
    // YELLOW → RED giant: ONE continuous move. The giant grows (legacyStage 2.88→2.05)
    // while the camera travels from the close centred hold straight out to the corner —
    // a single monotonic gesture (z 17.4→38.2, sliding to the off-centre pose), no
    // dive-then-reverse. easeOutCubic leads the move so it commits promptly and settles
    // into the corner rather than lingering.
    const t = easeOutCubic(segment(p, YELLOW_HOLD_END, RED_HOLD_START));
    position = mixVec(YELLOW_HOLD.position, RED_COMPOSITION.position, t);
    target = mixVec(YELLOW_HOLD.target, RED_COMPOSITION.target, t);
    parallax = 0.04;
  } else if (p < RED_HOLD_END) {
    position = RED_COMPOSITION.position;
    target = RED_COMPOSITION.target;
    parallax = 0.015;
  } else if (p < 0.748) {
    // COLLAPSE reveal: pull back and recompose PROMPTLY (easeOutCubic leads the
    // move) so the camera reveals the collapsing core early and settles on it,
    // rather than the old easeInQuart that held the off-centre limb then lurched
    // at the last instant. The star slides from extreme-right-cropped toward the
    // collapse framing as the surface caves in.
    const t = easeOutCubic(segment(p, RED_HOLD_END, 0.748));
    position = mixVec(RED_COMPOSITION.position, COLLAPSE_PULL.position, t);
    target = mixVec(RED_COMPOSITION.target, COLLAPSE_PULL.target, t);
    parallax = 0.0;
  } else if (p < 0.82) {
    const t = easeOutCubic(segment(p, 0.748, 0.82));
    position = mixVec(COLLAPSE_PULL.position, SUPERNOVA_RECOIL.position, t);
    target = mixVec(COLLAPSE_PULL.target, SUPERNOVA_RECOIL.target, t);
    parallax = 0.0;
  } else if (p < 0.946) {
    const t = easeOutExpo(segment(p, 0.82, 0.946));
    position = mixVec(SUPERNOVA_RECOIL.position, BLACK_HOLE_SETL.position, t);
    target = mixVec(SUPERNOVA_RECOIL.target, BLACK_HOLE_SETL.target, t);
    parallax = 0.025;
  } else {
    const t = smoothstep(segment(p, 0.946, 1.0));
    position = mixVec(BLACK_HOLE_SETL.position, EVENT_HORIZON.position, t);
    target = mixVec(BLACK_HOLE_SETL.target, EVENT_HORIZON.target, t);
    parallax = 0.018;
  }

  const redHold = segment(p, RED_HOLD_START, RED_HOLD_END);
  const redHoldDriftEnd = RED_HOLD_START + (RED_HOLD_END - RED_HOLD_START) * 0.94; // fade drift before hold ends
  const redHoldWindow = smoothstep(redHold) * (1 - smoothstep(segment(p, redHoldDriftEnd, RED_HOLD_END)));
  const micro = reduced ? 0 : redHoldWindow * Math.sin(time * 0.09) * 0.16;
  if (micro !== 0) {
    position = [position[0] + micro, position[1] - micro * 0.18, position[2] + micro * 0.22];
    target = [target[0] + micro * 0.42, target[1] - micro * 0.08, target[2]];
  }

  const shock = reduced ? 0 : 4 * clamp01(nova) * (1 - clamp01(nova));
  return {
    position,
    target,
    shake: shock * 0.22,
    parallax,
  };
}
