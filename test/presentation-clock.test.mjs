// PRESENTATION CLOCK invariants — the single eased lifecycle clock every hero
// consumer (engine + DOM chrome) reads. Bundles the REAL src/hero/
// presentationClock.ts with esbuild (node --test has no TS transform) and steps
// tick() with fabricated timestamps, so the ease math is pinned without an
// animation loop. The numbers here (0.28 follow, 0.6 dwell damp, 0.1 floor)
// are the exact values the engine's former internal ease used — a regression
// in any of them changes the feel of every beat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// The clock's self-driving layer touches rAF only via start()/wake(); stub them
// so those paths are exercisable in Node. tick() itself never schedules.
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const entry = new URL('../src/hero/presentationClock.ts', import.meta.url).pathname;
const bundled = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'neutral',
  logLevel: 'silent',
});
const { PresentationClock } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
);

/** A clock with a mutable target and NO snap window (start() not called). */
function makeClock(targets, options) {
  return new PresentationClock(() => ({ ...targets }), options);
}

test('constructor seeds the eased state ON the current targets (no glide-in)', () => {
  const clock = makeClock({ progress: 0.4, stage: 2.05 });
  assert.equal(clock.current.progress, 0.4);
  assert.equal(clock.current.stage, 2.05);
  assert.equal(clock.current.moving, false);
});

test('tick eases toward a moved target with the 0.28 base follow', () => {
  const targets = { progress: 0, stage: 0 };
  const clock = makeClock(targets);
  targets.progress = 1;
  targets.stage = 5;
  const s = clock.tick(1000);
  assert.ok(Math.abs(s.progress - 0.28) < 1e-9, `progress ${s.progress} !== 0.28`);
  assert.ok(Math.abs(s.stage - 1.4) < 1e-9, `stage ${s.stage} !== 1.4`);
  assert.equal(s.moving, true);
});

test('progress and stage ease as INDEPENDENT scalars (band-jump safety)', () => {
  // The progress→stage curve is discontinuous (band 7→8 jumps 2.05→1.05); the
  // clock must glide the stage across it rather than re-deriving it from the
  // eased progress. Modelled here as a stage target that moves opposite to
  // progress: both must close 28% of their OWN gap.
  const targets = { progress: 0.5, stage: 2.05 };
  const clock = makeClock(targets);
  targets.progress = 0.6;
  targets.stage = 1.05;
  const s = clock.tick(1);
  assert.ok(Math.abs(s.progress - (0.5 + 0.1 * 0.28)) < 1e-9);
  assert.ok(Math.abs(s.stage - (2.05 - 1.0 * 0.28)) < 1e-9);
});

test('re-ticking the same timestamp is a no-op (no double-advance per frame)', () => {
  const targets = { progress: 0, stage: 0 };
  const clock = makeClock(targets);
  targets.progress = 1;
  const first = clock.tick(500);
  const second = clock.tick(500);
  assert.equal(second.progress, first.progress);
});

test('converges to EXACTLY the target and reports moving=false (loop can park)', () => {
  const targets = { progress: 0, stage: 0 };
  const clock = makeClock(targets);
  targets.progress = 1;
  targets.stage = 5;
  let s = clock.current;
  for (let i = 1; i <= 400; i += 1) s = clock.tick(i * 16);
  assert.equal(s.progress, 1);
  assert.equal(s.stage, 5);
  assert.equal(s.moving, false);
});

test('dwell damps the follow (0.28 → 0.28·(1−0.6·dwell), floored at 0.1)', () => {
  const targets = { progress: 0, stage: 0 };
  const half = makeClock(targets, { dwellFor: () => 0.5 });
  targets.progress = 1;
  const s = half.tick(1);
  assert.ok(Math.abs(s.progress - 0.28 * (1 - 0.6 * 0.5)) < 1e-9);

  const targets2 = { progress: 0, stage: 0 };
  const maxed = makeClock(targets2, { dwellFor: () => 999 }); // clamped to 1
  targets2.progress = 1;
  const s2 = maxed.tick(1);
  assert.ok(Math.abs(s2.progress - Math.max(0.1, 0.28 * 0.4)) < 1e-9);
});

test('reduced motion is instant — presentation always equals the raw target', () => {
  const targets = { progress: 0, stage: 0 };
  const clock = makeClock(targets, { reduced: true });
  targets.progress = 0.73;
  targets.stage = 3.42;
  const s = clock.tick(1);
  assert.equal(s.progress, 0.73);
  assert.equal(s.stage, 3.42);
  assert.equal(s.moving, false);
});

test('settle-snap window after start(): a late scroll restoration lands, not glides', () => {
  const targets = { progress: 0, stage: 4.7 };
  const clock = makeClock(targets);
  clock.start();
  const t0 = performance.now();
  // Scroll restoration arrives a few frames after mount, inside the window:
  targets.progress = 0.9;
  targets.stage = 0.4;
  const inWindow = clock.tick(t0 + 50);
  assert.equal(inWindow.progress, 0.9, 'inside the settle window the clock must SNAP');
  assert.equal(inWindow.snapped, true);
  // Past the window, a further target move eases normally again:
  targets.progress = 1.0;
  const after = clock.tick(t0 + 400);
  assert.ok(after.progress < 1.0, 'past the settle window the clock must EASE');
  assert.equal(after.snapped, false);
});

test('subscribers are notified only when the eased values actually change', () => {
  const targets = { progress: 0.5, stage: 2 };
  const clock = makeClock(targets);
  let calls = 0;
  clock.subscribe(() => { calls += 1; });
  clock.tick(1); // at rest on target — no change, no notify
  assert.equal(calls, 0);
  targets.progress = 0.6;
  clock.tick(2);
  assert.equal(calls, 1);
});
