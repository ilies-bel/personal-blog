// PRESENTATION CLOCK invariants — the single lifecycle clock every hero
// consumer (engine + DOM chrome) reads. Bundles the REAL src/hero/
// presentationClock.ts with esbuild (node --test has no TS transform) and steps
// tick() with fabricated timestamps. The clock now tracks its targets 1:1 on
// every tick (no follow-ease, no dwell damping, no settle-snap special case) —
// scrolling must never feel hijacked — so these tests pin the instant-tracking
// contract: on target every tick, moving=false, snapped=true.
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

/** A clock with a mutable target. */
function makeClock(targets, options) {
  return new PresentationClock(() => ({ ...targets }), options);
}

test('constructor seeds the state ON the current targets (no glide-in)', () => {
  const clock = makeClock({ progress: 0.4, stage: 2.05 });
  assert.equal(clock.current.progress, 0.4);
  assert.equal(clock.current.stage, 2.05);
  assert.equal(clock.current.moving, false);
});

test('tick tracks a moved target 1:1 — no follow-ease lag', () => {
  const targets = { progress: 0, stage: 0 };
  const clock = makeClock(targets);
  targets.progress = 1;
  targets.stage = 5;
  const s = clock.tick(1000);
  assert.equal(s.progress, 1);
  assert.equal(s.stage, 5);
  assert.equal(s.moving, false);
  assert.equal(s.snapped, true);
});

test('progress and stage remain INDEPENDENT scalars (band-jump safety)', () => {
  // The progress→stage curve is discontinuous (band 7→8 jumps 2.05→1.05); the
  // clock carries both scalars and each lands exactly on its OWN target.
  const targets = { progress: 0.5, stage: 2.05 };
  const clock = makeClock(targets);
  targets.progress = 0.6;
  targets.stage = 1.05;
  const s = clock.tick(1);
  assert.equal(s.progress, 0.6);
  assert.equal(s.stage, 1.05);
});

test('re-ticking the same timestamp is a no-op (no double-advance per frame)', () => {
  const targets = { progress: 0, stage: 0 };
  const clock = makeClock(targets);
  targets.progress = 1;
  const first = clock.tick(500);
  const second = clock.tick(500);
  assert.equal(second.progress, first.progress);
});

test('lands EXACTLY on the target and reports moving=false (loop can park)', () => {
  const targets = { progress: 0, stage: 0 };
  const clock = makeClock(targets);
  targets.progress = 1;
  targets.stage = 5;
  const s = clock.tick(16);
  assert.equal(s.progress, 1);
  assert.equal(s.stage, 5);
  assert.equal(s.moving, false);
});

test('dwell has NO effect — tracking is 1:1 regardless of dwellFor', () => {
  const targets = { progress: 0, stage: 0 };
  const clock = makeClock(targets, { dwellFor: () => 0.5 });
  targets.progress = 1;
  const s = clock.tick(1);
  assert.equal(s.progress, 1);

  const targets2 = { progress: 0, stage: 0 };
  const maxed = makeClock(targets2, { dwellFor: () => 999 });
  targets2.progress = 1;
  const s2 = maxed.tick(1);
  assert.equal(s2.progress, 1);
});

test('reduced motion is identical — presentation always equals the raw target', () => {
  const targets = { progress: 0, stage: 0 };
  const clock = makeClock(targets, { reduced: true });
  targets.progress = 0.73;
  targets.stage = 3.42;
  const s = clock.tick(1);
  assert.equal(s.progress, 0.73);
  assert.equal(s.stage, 3.42);
  assert.equal(s.moving, false);
});

test('after start(), a late scroll restoration lands instantly (and stays 1:1)', () => {
  const targets = { progress: 0, stage: 4.7 };
  const clock = makeClock(targets);
  clock.start();
  const t0 = performance.now();
  // Scroll restoration arrives a few frames after mount:
  targets.progress = 0.9;
  targets.stage = 0.4;
  const early = clock.tick(t0 + 50);
  assert.equal(early.progress, 0.9, 'the clock must SNAP to the restored position');
  assert.equal(early.snapped, true);
  // Any later target move ALSO lands instantly — there is no ease window:
  targets.progress = 1.0;
  const after = clock.tick(t0 + 400);
  assert.equal(after.progress, 1.0, 'the clock tracks 1:1 at all times');
  assert.equal(after.snapped, true);
});

test('subscribers are notified only when the values actually change', () => {
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
