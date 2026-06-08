// Phase 3 safety net: prove the table-generated cameraPoseForProgress reproduces the
// former 10-band camera if-ladder to floating-point exactness, with time/nova/reduced
// fixed. node --test runs .mjs with NO TS transform, so BOTH the OLD ladder and the
// NEW table-walker (plus the shared micro-drift + nova-shake post-steps) are hand-
// translated here as pure JS and asserted equal on position[3], target[3], parallax
// and shake. LIFECYCLE_DIRECTION is 'normal' (identity), so p === clamp01(progress).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const segment = (g, s, e) => (e === s ? (g >= e ? 1 : 0) : clamp01((g - s) / (e - s)));
const linear = (t) => clamp01(t);
const smoothstep = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOutCubic = (t) => { const x = clamp01(t); return x < 0.5 ? 4*x*x*x : 1 - Math.pow(-2*x+2,3)/2; };
const easeOutExpo = (t) => { const x = clamp01(t); return x === 1 ? 1 : 1 - Math.pow(2,-10*x); };
const lerp = (a, b, t) => a + (b - a) * t;
const mixVec = (a, b, t) => [lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t)];

// breakpoints
const DOT_HOLD_END = 0.055, NEBULA_GROW_END = 0.195, STAR_IGNITION_START = 0.33;
const YELLOW_SETTLE_END = 0.395, YELLOW_HOLD_END = 0.47, RED_HOLD_START = 0.524, RED_HOLD_END = 0.678;

// pose keyframes (verbatim)
const DOT_VIEW = { position: [0.0, 0.0, 78.0], target: [0.0, 0.0, 0.0] };
const NEBULA_START = { position: [-0.7, 0.14, 39.0], target: [0.0, 0.0, 0.0] };
const NEBULA_GATHERED = { position: [0.18, 0.035, 34.0], target: [0.0, 0.0, 0.0] };
const YELLOW_HOLD = { position: [0.62, -0.08, 17.4], target: [0.0, -0.02, 0.0] };
const RED_COMPOSITION = { position: [-5.5, -5.55, 38.2], target: [-7.9, -4.7, 7.0] };
const COLLAPSE_PULL = { position: [-4.4, -3.6, 33.0], target: [-5.6, -3.0, 4.6] };
const SUPERNOVA_RECOIL = { position: [-2.6, -1.7, 28.0], target: [-2.6, -1.4, 2.2] };
const BLACK_HOLE_SETL = { position: [0.0, 0.05, 23.2], target: [0.0, 0.0, 0.0] };
const EVENT_HORIZON = { position: [0.02, 0.08, 21.8], target: [0.0, 0.0, 0.0] };

// shared post-steps (the micro-drift + nova shake) — identical for both sides.
function applyPostSteps(p, position, target, parallax, time, nova, reduced) {
  const redHold = segment(p, RED_HOLD_START, RED_HOLD_END);
  const redHoldDriftEnd = RED_HOLD_START + (RED_HOLD_END - RED_HOLD_START) * 0.94;
  const redHoldWindow = smoothstep(redHold) * (1 - smoothstep(segment(p, redHoldDriftEnd, RED_HOLD_END)));
  const micro = reduced ? 0 : redHoldWindow * Math.sin(time * 0.09) * 0.16;
  if (micro !== 0) {
    position = [position[0] + micro, position[1] - micro * 0.18, position[2] + micro * 0.22];
    target = [target[0] + micro * 0.42, target[1] - micro * 0.08, target[2]];
  }
  const shock = reduced ? 0 : 4 * clamp01(nova) * (1 - clamp01(nova));
  return { position, target, shake: shock * 0.22, parallax };
}

// === REFERENCE: the FROZEN OLD 10-band camera if-ladder ===
function reference(progress, time, nova, reduced) {
  const p = clamp01(progress);
  let position = DOT_VIEW.position;
  let target = DOT_VIEW.target;
  let parallax = 0.08;
  if (p < NEBULA_GROW_END) {
    const t = segment(p, DOT_HOLD_END, NEBULA_GROW_END);
    position = mixVec(DOT_VIEW.position, NEBULA_START.position, t);
    target = mixVec(DOT_VIEW.target, NEBULA_START.target, t);
    parallax = 0.04;
  } else if (p < STAR_IGNITION_START) {
    const t = easeInOutCubic(segment(p, NEBULA_GROW_END, STAR_IGNITION_START));
    position = mixVec(NEBULA_START.position, NEBULA_GATHERED.position, t);
    target = mixVec(NEBULA_START.target, NEBULA_GATHERED.target, t);
    parallax = 0.05;
  } else if (p < YELLOW_SETTLE_END) {
    const t = easeOutCubic(segment(p, STAR_IGNITION_START, YELLOW_SETTLE_END));
    position = mixVec(NEBULA_GATHERED.position, YELLOW_HOLD.position, t);
    target = mixVec(NEBULA_GATHERED.target, YELLOW_HOLD.target, t);
    parallax = 0.05;
  } else if (p < YELLOW_HOLD_END) {
    position = YELLOW_HOLD.position; target = YELLOW_HOLD.target; parallax = 0.04;
  } else if (p < RED_HOLD_START) {
    const t = easeOutCubic(segment(p, YELLOW_HOLD_END, RED_HOLD_START));
    position = mixVec(YELLOW_HOLD.position, RED_COMPOSITION.position, t);
    target = mixVec(YELLOW_HOLD.target, RED_COMPOSITION.target, t);
    parallax = 0.04;
  } else if (p < RED_HOLD_END) {
    position = RED_COMPOSITION.position; target = RED_COMPOSITION.target; parallax = 0.015;
  } else if (p < 0.748) {
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
  return applyPostSteps(p, position, target, parallax, time, nova, reduced);
}

// === WALKER: the NEW declarative CAMERA table + walker ===
const EASE = { linear, smoothstep, easeOutCubic, easeInOutCubic, easeOutExpo };
const INF = Number.POSITIVE_INFINITY;
const CAMERA_BANDS = [
  { endProgress: NEBULA_GROW_END, interp: [DOT_HOLD_END, NEBULA_GROW_END], easing: 'linear', posStart: DOT_VIEW.position, posEnd: NEBULA_START.position, targetStart: DOT_VIEW.target, targetEnd: NEBULA_START.target, parallax: 0.04 },
  { endProgress: STAR_IGNITION_START, interp: [NEBULA_GROW_END, STAR_IGNITION_START], easing: 'easeInOutCubic', posStart: NEBULA_START.position, posEnd: NEBULA_GATHERED.position, targetStart: NEBULA_START.target, targetEnd: NEBULA_GATHERED.target, parallax: 0.05 },
  { endProgress: YELLOW_SETTLE_END, interp: [STAR_IGNITION_START, YELLOW_SETTLE_END], easing: 'easeOutCubic', posStart: NEBULA_GATHERED.position, posEnd: YELLOW_HOLD.position, targetStart: NEBULA_GATHERED.target, targetEnd: YELLOW_HOLD.target, parallax: 0.05 },
  { endProgress: YELLOW_HOLD_END, interp: [YELLOW_SETTLE_END, YELLOW_HOLD_END], easing: 'linear', posStart: YELLOW_HOLD.position, posEnd: YELLOW_HOLD.position, targetStart: YELLOW_HOLD.target, targetEnd: YELLOW_HOLD.target, parallax: 0.04 },
  { endProgress: RED_HOLD_START, interp: [YELLOW_HOLD_END, RED_HOLD_START], easing: 'easeOutCubic', posStart: YELLOW_HOLD.position, posEnd: RED_COMPOSITION.position, targetStart: YELLOW_HOLD.target, targetEnd: RED_COMPOSITION.target, parallax: 0.04 },
  { endProgress: RED_HOLD_END, interp: [RED_HOLD_START, RED_HOLD_END], easing: 'linear', posStart: RED_COMPOSITION.position, posEnd: RED_COMPOSITION.position, targetStart: RED_COMPOSITION.target, targetEnd: RED_COMPOSITION.target, parallax: 0.015 },
  { endProgress: 0.748, interp: [RED_HOLD_END, 0.748], easing: 'easeOutCubic', posStart: RED_COMPOSITION.position, posEnd: COLLAPSE_PULL.position, targetStart: RED_COMPOSITION.target, targetEnd: COLLAPSE_PULL.target, parallax: 0.0 },
  { endProgress: 0.82, interp: [0.748, 0.82], easing: 'easeOutCubic', posStart: COLLAPSE_PULL.position, posEnd: SUPERNOVA_RECOIL.position, targetStart: COLLAPSE_PULL.target, targetEnd: SUPERNOVA_RECOIL.target, parallax: 0.0 },
  { endProgress: 0.946, interp: [0.82, 0.946], easing: 'easeOutExpo', posStart: SUPERNOVA_RECOIL.position, posEnd: BLACK_HOLE_SETL.position, targetStart: SUPERNOVA_RECOIL.target, targetEnd: BLACK_HOLE_SETL.target, parallax: 0.025 },
  { endProgress: INF, interp: [0.946, 1.0], easing: 'smoothstep', posStart: BLACK_HOLE_SETL.position, posEnd: EVENT_HORIZON.position, targetStart: BLACK_HOLE_SETL.target, targetEnd: EVENT_HORIZON.target, parallax: 0.018 },
];
function cameraBase(p) {
  let band = CAMERA_BANDS[CAMERA_BANDS.length - 1];
  for (const b of CAMERA_BANDS) { if (p < b.endProgress) { band = b; break; } }
  const t = EASE[band.easing](segment(p, band.interp[0], band.interp[1]));
  return { position: mixVec(band.posStart, band.posEnd, t), target: mixVec(band.targetStart, band.targetEnd, t), parallax: band.parallax };
}
function walker(progress, time, nova, reduced) {
  const p = clamp01(progress);
  const base = cameraBase(p);
  return applyPostSteps(p, base.position, base.target, base.parallax, time, nova, reduced);
}

const TOL = 1e-9;
// fixtures spanning reduced on/off, nova in/out of the shake hump, varied time.
const FIXTURES = [
  { time: 0, nova: 0, reduced: false },
  { time: 7.3, nova: 0, reduced: false },
  { time: 7.3, nova: 0.5, reduced: false },
  { time: 12.9, nova: 1, reduced: false },
  { time: 12.9, nova: 0.25, reduced: true },
  { time: 99.1, nova: 0.5, reduced: true },
];

test('generated camera pose matches the old if-ladder over a dense sweep x fixtures', () => {
  const N = 4001;
  let maxDiff = 0;
  let worst = null;
  for (const fx of FIXTURES) {
    for (let i = 0; i < N; i += 1) {
      const p = i / (N - 1);
      const a = walker(p, fx.time, fx.nova, fx.reduced);
      const b = reference(p, fx.time, fx.nova, fx.reduced);
      const diffs = [
        a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2],
        a.target[0] - b.target[0], a.target[1] - b.target[1], a.target[2] - b.target[2],
        a.parallax - b.parallax, a.shake - b.shake,
      ];
      for (const d of diffs) {
        if (Math.abs(d) > maxDiff) { maxDiff = Math.abs(d); worst = { p, fx, d }; }
      }
    }
  }
  assert.ok(maxDiff < TOL, `max |walker - reference| = ${maxDiff} at ${JSON.stringify(worst)} (>= ${TOL})`);
});

test('generated camera pose matches at every breakpoint +/- 1e-6', () => {
  const breaks = [0, DOT_HOLD_END, NEBULA_GROW_END, STAR_IGNITION_START, YELLOW_SETTLE_END, YELLOW_HOLD_END, RED_HOLD_START, RED_HOLD_END, 0.748, 0.82, 0.946, 1.0];
  let maxDiff = 0;
  const fx = { time: 5.0, nova: 0.5, reduced: false };
  for (const br of breaks) {
    for (const p of [br - 1e-6, br, br + 1e-6]) {
      if (p < 0 || p > 1) continue;
      const a = walker(p, fx.time, fx.nova, fx.reduced);
      const b = reference(p, fx.time, fx.nova, fx.reduced);
      const ds = [a.position[0]-b.position[0],a.position[1]-b.position[1],a.position[2]-b.position[2],a.target[0]-b.target[0],a.target[1]-b.target[1],a.target[2]-b.target[2],a.parallax-b.parallax,a.shake-b.shake];
      for (const d of ds) maxDiff = Math.max(maxDiff, Math.abs(d));
    }
  }
  assert.ok(maxDiff < TOL, `breakpoint max |diff| = ${maxDiff} (>= ${TOL})`);
});
