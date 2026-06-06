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

// The public cinematic timeline. The existing shaders still understand the older
// reverse "stage" coordinates, so this is the single handoff from the new story
// into the proven morph machinery. `progress` is the RAW scroll value; we run it
// through lifecycleProgress() so LIFECYCLE_DIRECTION owns which way time flows.
//
// Phase bands (in lifecycleProgress space) match the cinematic spec exactly:
//   0.00-0.16 nebulaFormation | 0.16-0.30 yellowStarIgnition |
//   0.30-0.46 redGiantGrowth  | 0.46-0.62 redGiantHold       |
//   0.62-0.72 collapse        | 0.72-0.80 supernova          |
//   0.80-0.94 blackHoleFormation | 0.94-1.00 blackHoleHold / portfolio lure.
export function legacyStageForProgress(progress: number): number {
  const p = lifecycleProgress(progress);

  if (p < 0.16) {
    return lerp(3.5, 3.32, smoothstep(segment(p, 0.0, 0.16)));
  }
  if (p < 0.30) {
    return lerp(3.32, 2.88, easeOutCubic(segment(p, 0.16, 0.30)));
  }
  if (p < 0.46) {
    return lerp(2.88, 2.05, easeInOutCubic(segment(p, 0.30, 0.46)));
  }
  if (p < 0.62) {
    return 2.05;
  }
  if (p < 0.72) {
    return lerp(1.05, 0.5, easeInQuart(segment(p, 0.62, 0.72)));
  }
  if (p < 0.80) {
    return lerp(0.5, 0.32, easeOutCubic(segment(p, 0.72, 0.80)));
  }
  if (p < 0.94) {
    return lerp(0.32, 0.08, easeOutExpo(segment(p, 0.80, 0.94)));
  }
  return lerp(0.08, 0.0, smoothstep(segment(p, 0.94, 1.0)));
}

// Approximate inverse used only for HUD previews, where matching the selected
// object's camera family matters more than a mathematically exact eased inverse.
export function progressForLegacyStage(stage: number): number {
  if (stage >= 3.5) return 0.02;
  if (stage >= 3.32) return lerp(0.0, 0.16, (3.5 - stage) / (3.5 - 3.32));
  if (stage >= 2.88) return lerp(0.16, 0.30, (3.32 - stage) / (3.32 - 2.88));
  if (stage >= 2.05) return lerp(0.30, 0.46, (2.88 - stage) / (2.88 - 2.05));
  if (stage >= 1.05) return 0.54;
  if (stage >= 0.5) return lerp(0.62, 0.72, (1.05 - stage) / (1.05 - 0.5));
  if (stage >= 0.32) return lerp(0.72, 0.80, (0.5 - stage) / (0.5 - 0.32));
  if (stage >= 0.08) return lerp(0.80, 0.94, (0.32 - stage) / (0.32 - 0.08));
  return lerp(0.94, 1.0, (0.08 - Math.max(0, stage)) / 0.08);
}

const NEBULA_START = {
  position: [-1.4, 0.25, 34.0] as Vec3Tuple,
  target: [0.0, 0.0, 0.0] as Vec3Tuple,
};
const NEBULA_GATHERED = {
  position: [0.35, 0.02, 32.4] as Vec3Tuple,
  target: [0.0, 0.0, 0.0] as Vec3Tuple,
};
const YELLOW_HOLD = {
  position: [0.85, -0.14, 29.6] as Vec3Tuple,
  target: [0.0, -0.02, 0.0] as Vec3Tuple,
};
const RED_COMPOSITION = {
  position: [-6.8, -1.05, 31.2] as Vec3Tuple,
  target: [-9.2, -0.20, 0.0] as Vec3Tuple,
};
// COLLAPSE: the star is at world origin; the red hold framed it off-centre-RIGHT
// (RED_COMPOSITION looks at negative-x, ~ -9.2). Instead of snapping the star to
// dead-centre at the collapse (which made the supernova read as a new, unrelated
// centred scene), we PULL BACK while EASING the off-centre framing inward — the
// collapse point inherits the giant's screen position and only drifts toward
// centre as the blast grows to fill the frame. Target keeps a residual negative-x
// so the collapse core sits where the limb just was, not jump-cut to centre.
const COLLAPSE_PULL = {
  position: [-2.6, -0.5, 25.8] as Vec3Tuple,
  target: [-2.4, -0.12, 0.0] as Vec3Tuple,
};
// SUPERNOVA: the blast erupts from that same off-centre point and expands. The
// camera eases the core the rest of the way to centre AS the shell fills the
// frame (so the recentre is motivated by the expanding blast, not a cut), with a
// small continued pull-back — NO push-in spike (the old 27.8 in-out-in
// rollercoaster is gone; z now moves monotonically outward through the blast).
const SUPERNOVA_RECOIL = {
  position: [-0.9, -0.2, 24.8] as Vec3Tuple,
  target: [-0.7, -0.04, 0.0] as Vec3Tuple,
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
  let position = NEBULA_START.position;
  let target = NEBULA_START.target;
  let parallax = 0.08;

  if (p < 0.16) {
    const t = smoothstep(segment(p, 0.0, 0.16));
    position = mixVec(NEBULA_START.position, NEBULA_GATHERED.position, t);
    target = mixVec(NEBULA_START.target, NEBULA_GATHERED.target, t);
    parallax = 0.05;
  } else if (p < 0.30) {
    const t = easeOutCubic(segment(p, 0.16, 0.30));
    position = mixVec(NEBULA_GATHERED.position, YELLOW_HOLD.position, t);
    target = mixVec(NEBULA_GATHERED.target, YELLOW_HOLD.target, t);
    parallax = 0.05;
  } else if (p < 0.46) {
    const t = easeInOutCubic(segment(p, 0.30, 0.46));
    position = mixVec(YELLOW_HOLD.position, RED_COMPOSITION.position, t);
    target = mixVec(YELLOW_HOLD.target, RED_COMPOSITION.target, t);
    parallax = 0.04;
  } else if (p < 0.62) {
    position = RED_COMPOSITION.position;
    target = RED_COMPOSITION.target;
    parallax = 0.015;
  } else if (p < 0.72) {
    // COLLAPSE reveal: pull back and recompose PROMPTLY (easeOutCubic leads the
    // move) so the camera reveals the collapsing core early and settles on it,
    // rather than the old easeInQuart that held the off-centre limb then lurched
    // at the last instant. The star slides from extreme-right-cropped toward the
    // collapse framing as the surface caves in.
    const t = easeOutCubic(segment(p, 0.62, 0.72));
    position = mixVec(RED_COMPOSITION.position, COLLAPSE_PULL.position, t);
    target = mixVec(RED_COMPOSITION.target, COLLAPSE_PULL.target, t);
    parallax = 0.0;
  } else if (p < 0.80) {
    const t = easeOutCubic(segment(p, 0.72, 0.80));
    position = mixVec(COLLAPSE_PULL.position, SUPERNOVA_RECOIL.position, t);
    target = mixVec(COLLAPSE_PULL.target, SUPERNOVA_RECOIL.target, t);
    parallax = 0.0;
  } else if (p < 0.94) {
    const t = easeOutExpo(segment(p, 0.80, 0.94));
    position = mixVec(SUPERNOVA_RECOIL.position, BLACK_HOLE_SETL.position, t);
    target = mixVec(SUPERNOVA_RECOIL.target, BLACK_HOLE_SETL.target, t);
    parallax = 0.025;
  } else {
    const t = smoothstep(segment(p, 0.94, 1.0));
    position = mixVec(BLACK_HOLE_SETL.position, EVENT_HORIZON.position, t);
    target = mixVec(BLACK_HOLE_SETL.target, EVENT_HORIZON.target, t);
    parallax = 0.018;
  }

  const redHold = segment(p, 0.46, 0.62);
  const redHoldWindow = smoothstep(redHold) * (1 - smoothstep(segment(p, 0.58, 0.62)));
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
