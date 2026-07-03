// LIVE-TABLE invariants — the missing half of scene-curve.test.mjs.
//
// scene-curve.test.mjs proves the band-walker ALGORITHM against a hand-frozen
// JS copy of an old table; it never reads the real SEGMENTS, so a bad edit to
// sceneTable.ts (weights not summing to 1, a stage gap between bands, a beat
// window drifting off its idle hold) sails through it. This file bundles the
// REAL src/hero/sceneTable.ts with esbuild (node --test has no TS transform and
// the source uses extensionless TS imports) and asserts the structural
// invariants every hero consumer relies on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const entry = new URL('../src/hero/sceneTable.ts', import.meta.url).pathname;
const bundled = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'neutral',
  logLevel: 'silent',
});
const table = await import(
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
);

const { SEGMENTS, STARTS, SCENES, legacyStageForProgressFromTable } = table;
const TOL = 1e-9;

test('live SEGMENTS weights sum to exactly 1.0', () => {
  const sum = SEGMENTS.reduce((acc, seg) => acc + seg.weight, 0);
  assert.ok(Math.abs(sum - 1.0) < TOL, `weights sum to ${sum}`);
  assert.ok(Math.abs(STARTS[STARTS.length - 1] - 1.0) < TOL);
  assert.equal(STARTS.length, SEGMENTS.length + 1);
});

test('live SEGMENTS stage curve is continuous except the one documented jump', () => {
  // Band 7 (red idle, stage 2.05) → the END-collapse band (stage 1.05) is the
  // single INTENTIONAL discontinuity ("the black hole tears out of the giant").
  let jumps = 0;
  for (let i = 0; i < SEGMENTS.length - 1; i += 1) {
    const gap = Math.abs(SEGMENTS[i].stageEnd - SEGMENTS[i + 1].stageStart);
    if (gap > TOL) {
      jumps += 1;
      assert.equal(SEGMENTS[i].stageEnd, 2.05, `unexpected stage jump after segment ${i}`);
      assert.equal(SEGMENTS[i + 1].stageStart, 1.05, `unexpected stage jump after segment ${i}`);
    }
  }
  assert.equal(jumps, 1, 'exactly one documented discontinuity');
});

test('live stage curve is monotonic across RAW scroll (0.0 at top → 4.7 at bottom)', () => {
  // SEGMENTS are authored in LIFECYCLE order (dot 4.7 first), but the walker takes
  // RAW scroll and applies the reverse flip internally — so over raw input the
  // stage RISES from the black hole (0) to the dot (4.7). Monotonic = no band gap.
  assert.equal(SEGMENTS[0].stageStart, 4.7);
  assert.equal(SEGMENTS[SEGMENTS.length - 1].stageEnd, 0.0);
  assert.ok(Math.abs(legacyStageForProgressFromTable(0)) < TOL, 'raw 0 = the black hole');
  assert.ok(Math.abs(legacyStageForProgressFromTable(1) - 4.7) < TOL, 'raw 1 = the dot');
  let prev = -Infinity;
  for (let p = 0; p <= 1.0 + 1e-12; p += 0.0005) {
    const stage = legacyStageForProgressFromTable(p);
    assert.ok(stage >= prev - 1e-6, `stage fell at raw progress ${p}: ${prev} -> ${stage}`);
    prev = stage;
  }
});

test('every idle segment stays inside its settledWindow', () => {
  // An idle hold MAY drift a little (the dot band eases 4.7 → 4.5) but must never
  // leave the window its markers key off (settledIdForStage's strict gate).
  for (const seg of SEGMENTS) {
    if (seg.phase !== 'idle' || !seg.settledWindow) continue;
    const [lo, hi] = seg.settledWindow;
    for (const stage of [seg.stageStart, seg.stageEnd]) {
      assert.ok(
        stage >= lo - TOL && stage <= hi + TOL,
        `idle segment ${seg.sceneId}: stage ${stage} outside settledWindow [${lo}, ${hi}]`,
      );
    }
  }
});

test('every beat text window sits inside [0, 1.02] and is ordered in→out', () => {
  for (const scene of SCENES) {
    if (!scene.beat) continue;
    const { inStart, inEnd, outStart, outEnd } = scene.beat.text;
    assert.ok(inStart <= inEnd && inEnd <= outStart && outStart <= outEnd, `beat ${scene.id} text window out of order`);
    assert.ok(inStart >= 0 && outEnd <= 1.02, `beat ${scene.id} text window out of range`);
    assert.ok(
      scene.beat.at >= inStart && scene.beat.at <= outEnd,
      `beat ${scene.id} 'at' anchor outside its own text window`,
    );
  }
});

test("every beat's readable band maps to its scene on the live curve", () => {
  // The copy must show while its OWN scene is on stage: sample the fully-visible
  // band (inEnd → outStart) and assert the walker resolves stages there. Beat
  // windows are authored in LIFECYCLE progress; the walker takes RAW scroll, so
  // sample at raw = 1 − L (the active 'reverse' direction seam — lifecycleProgress
  // is its own inverse). This is exactly the coupling that silently broke when the
  // SEGMENTS were re-weighted for the nova blast window without re-fitting the
  // beat windows. The dot and black-hole beats hold at the curve's clamped ends,
  // covered by the range checks above, so this focuses on the three mid-page beats.
  const STAGE_BY_SCENE = { nebula: [3.02, 3.5], yellow: [2.85, 3.02], red: [2.0, 2.1] };
  for (const scene of SCENES) {
    if (!scene.beat || !(scene.id in STAGE_BY_SCENE)) continue;
    const [lo, hi] = STAGE_BY_SCENE[scene.id];
    const { inEnd, outStart } = scene.beat.text;
    for (const L of [inEnd, (inEnd + outStart) / 2, outStart]) {
      const stage = legacyStageForProgressFromTable(1 - L);
      assert.ok(
        stage >= lo - 0.05 && stage <= hi + 0.05,
        `beat ${scene.id}: at lifecycle ${L} the curve shows stage ${stage.toFixed(3)}, outside [${lo}, ${hi}]`,
      );
    }
  }
});
