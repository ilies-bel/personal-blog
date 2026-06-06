import { clamp01, segment } from './scroll';

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

// Forward scroll progress is the public cinematic timeline. The existing shaders
// still understand the older reverse "stage" coordinates, so this is the single
// handoff from the new story into the proven morph machinery.
export function legacyStageForProgress(progress: number): number {
  const p = clamp01(progress);

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
const COLLAPSE_PULL = {
  position: [-1.1, -0.35, 23.6] as Vec3Tuple,
  target: [-0.22, -0.06, 0.0] as Vec3Tuple,
};
const SUPERNOVA_RECOIL = {
  position: [0.45, -0.12, 27.8] as Vec3Tuple,
  target: [0.02, 0.0, 0.0] as Vec3Tuple,
};
const BLACK_HOLE_SETL = {
  position: [0.22, 0.14, 23.8] as Vec3Tuple,
  target: [0.0, 0.0, 0.0] as Vec3Tuple,
};
const EVENT_HORIZON = {
  position: [0.02, 0.08, 21.8] as Vec3Tuple,
  target: [0.0, 0.0, 0.0] as Vec3Tuple,
};

export function cameraPoseForProgress(progress: number, time: number, nova: number, reduced: boolean): CameraPose {
  const p = clamp01(progress);
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
    const t = easeInQuart(segment(p, 0.62, 0.72));
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
