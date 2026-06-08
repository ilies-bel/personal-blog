// Phase 0+1 safety net: prove the declarative SEGMENTS band-walker reproduces the
// former 11-band if-ladder forward progress->stage curve to floating-point exactness.
//
// node --test runs .mjs with NO TypeScript transform, so both the OLD ladder and the
// NEW walker are hand-translated here as pure JS. They are independent re-statements
// of the same math; the test asserts |walker(p) - reference(p)| < 1e-9 over a dense
// sweep AND at every breakpoint +/- 1e-6 (catches `<` vs `<=` boundary bugs).
//
// LIFECYCLE_DIRECTION is 'normal' in the shipping code, so lifecycleProgress is the
// identity here; both sides apply the same clamp01, so the reference omits it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- shared primitives (copied from scroll.ts, byte-for-byte math) ---------
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const segment = (g, start, end) => {
  if (end === start) return g >= end ? 1 : 0;
  return clamp01((g - start) / (end - start));
};

// --- easings (copied from timeline.ts / sceneTable.ts, identical math) ------
const linear = (t) => clamp01(t);
const smoothstep = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOutCubic = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const easeInQuart = (t) => {
  const x = clamp01(t);
  return x * x * x * x;
};
const easeOutExpo = (t) => {
  const x = clamp01(t);
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
};
const lerp = (a, b, t) => a + (b - a) * t;

// === REFERENCE: the FROZEN OLD 11-band if-ladder (hand-translated, exact) ===
const DOT_HOLD_END = 0.055;
const NEBULA_GROW_END = 0.195;
const STAR_IGNITION_START = 0.33;
const YELLOW_SETTLE_END = 0.395;
const YELLOW_HOLD_END = 0.47;
const RED_HOLD_START = 0.524;
const RED_HOLD_END = 0.678;

function reference(progress) {
  const p = clamp01(progress);
  if (p < DOT_HOLD_END) return lerp(4.7, 4.5, smoothstep(segment(p, 0.0, DOT_HOLD_END)));
  if (p < NEBULA_GROW_END) return lerp(4.5, 3.42, segment(p, DOT_HOLD_END, NEBULA_GROW_END));
  if (p < STAR_IGNITION_START)
    return lerp(3.42, 3.02, easeInOutCubic(segment(p, NEBULA_GROW_END, STAR_IGNITION_START)));
  if (p < YELLOW_SETTLE_END)
    return lerp(3.02, 2.88, easeOutCubic(segment(p, STAR_IGNITION_START, YELLOW_SETTLE_END)));
  if (p < YELLOW_HOLD_END) return 2.88;
  if (p < RED_HOLD_START)
    return lerp(2.88, 2.05, easeInOutCubic(segment(p, YELLOW_HOLD_END, RED_HOLD_START)));
  if (p < RED_HOLD_END) return 2.05;
  if (p < 0.748) return lerp(1.05, 0.5, easeInQuart(segment(p, RED_HOLD_END, 0.748)));
  if (p < 0.82) return lerp(0.5, 0.32, easeOutCubic(segment(p, 0.748, 0.82)));
  if (p < 0.946) return lerp(0.32, 0.08, easeOutExpo(segment(p, 0.82, 0.946)));
  return lerp(0.08, 0.0, smoothstep(segment(p, 0.946, 1.0)));
}

// === WALKER: the NEW declarative table + band-walker (hand-translated) ======
const EASE = { linear, smoothstep, easeOutCubic, easeInOutCubic, easeInQuart, easeOutExpo };
const SEGMENTS = [
  { weight: 0.055, stageStart: 4.7, stageEnd: 4.5, easing: 'smoothstep' },
  { weight: 0.14, stageStart: 4.5, stageEnd: 3.42, easing: 'linear' },
  { weight: 0.135, stageStart: 3.42, stageEnd: 3.02, easing: 'easeInOutCubic' },
  { weight: 0.065, stageStart: 3.02, stageEnd: 2.88, easing: 'easeOutCubic' },
  { weight: 0.075, stageStart: 2.88, stageEnd: 2.88, easing: 'linear' },
  { weight: 0.054, stageStart: 2.88, stageEnd: 2.05, easing: 'easeInOutCubic' },
  { weight: 0.154, stageStart: 2.05, stageEnd: 2.05, easing: 'linear' },
  { weight: 0.07, stageStart: 1.05, stageEnd: 0.5, easing: 'easeInQuart' },
  { weight: 0.072, stageStart: 0.5, stageEnd: 0.32, easing: 'easeOutCubic' },
  { weight: 0.126, stageStart: 0.32, stageEnd: 0.08, easing: 'easeOutExpo' },
  { weight: 0.054, stageStart: 0.08, stageEnd: 0.0, easing: 'smoothstep' },
];
const STARTS = (() => {
  const out = [0];
  let acc = 0;
  for (const s of SEGMENTS) {
    acc += s.weight;
    out.push(acc);
  }
  return out;
})();

function walker(progress) {
  const p = clamp01(progress);
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

const TOL = 1e-9;

test('STARTS prefix-sum reproduces the former breakpoints', () => {
  const expected = [0, 0.055, 0.195, 0.33, 0.395, 0.47, 0.524, 0.678, 0.748, 0.82, 0.946, 1.0];
  assert.equal(STARTS.length, expected.length);
  let maxDiff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    maxDiff = Math.max(maxDiff, Math.abs(STARTS[i] - expected[i]));
  }
  assert.ok(maxDiff < TOL, `STARTS max |diff| = ${maxDiff} (>= ${TOL})`);
  // weights must sum to exactly 1.0 within float tolerance
  assert.ok(Math.abs(STARTS[STARTS.length - 1] - 1.0) < TOL);
});

test('walker matches the frozen if-ladder over a dense [0,1] sweep', () => {
  const N = 10001;
  let maxDiff = 0;
  let worstP = 0;
  for (let i = 0; i < N; i += 1) {
    const p = i / (N - 1);
    const d = Math.abs(walker(p) - reference(p));
    if (d > maxDiff) {
      maxDiff = d;
      worstP = p;
    }
  }
  assert.ok(maxDiff < TOL, `max |walker - reference| = ${maxDiff} at p=${worstP} (>= ${TOL})`);
});

test('walker matches the if-ladder at every breakpoint +/- 1e-6 (boundary semantics)', () => {
  let maxDiff = 0;
  for (const b of STARTS) {
    for (const p of [b - 1e-6, b, b + 1e-6]) {
      if (p < 0 || p > 1) continue;
      maxDiff = Math.max(maxDiff, Math.abs(walker(p) - reference(p)));
    }
  }
  assert.ok(maxDiff < TOL, `breakpoint max |diff| = ${maxDiff} (>= ${TOL})`);
});

test('walker matches the if-ladder out of range (clamped)', () => {
  for (const p of [-0.5, -1e-9, 1, 1 + 1e-9, 2]) {
    assert.ok(Math.abs(walker(p) - reference(p)) < TOL, `out-of-range mismatch at p=${p}`);
  }
});
