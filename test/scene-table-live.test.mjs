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

const {
  SEGMENTS,
  STARTS,
  SCENES,
  HUD_NAV_ITEMS,
  legacyStageForProgressFromTable,
  sceneForProgress,
  sceneActivatesHud,
  anchorRawForScene,
} = table;
const TOL = 1e-9;

/** A scene's total LIFECYCLE span [start, end] — the union of its segments.
 *  Segments of one scene are contiguous in the authored table. */
function sceneLifecycleSpan(sceneId) {
  let start = Infinity;
  let end = -Infinity;
  for (let i = 0; i < SEGMENTS.length; i += 1) {
    if (SEGMENTS[i].sceneId !== sceneId) continue;
    start = Math.min(start, STARTS[i]);
    end = Math.max(end, STARTS[i + 1]);
  }
  return [start, end];
}

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

test("every beat's FULL text band stays inside its own scene's span", () => {
  // The whole [inStart, outEnd] band — not just the fully-visible middle — must
  // sit inside the beat's scene: ManifestoOverlay renders band(inStart, outEnd)
  // as a hard cut, and the star-marker gate (beatIdForLifecycleP) reads the same
  // band, so any overhang shows the copy AND its marker over the NEIGHBOURING
  // scene's visuals. This is exactly the "ABOUT floating over the nebula" bug:
  // the beginning beat's outEnd (0.17) overran its scene's end (0.10) into the
  // dot→nebula grow. The terminal scene at lifecycle 1 may overshoot past 1.0
  // (progress clamps there — the line deliberately holds through the top frame).
  for (const scene of SCENES) {
    if (!scene.beat) continue;
    const [sceneStart, sceneEnd] = sceneLifecycleSpan(scene.id);
    const { inStart, outEnd } = scene.beat.text;
    assert.ok(
      inStart >= sceneStart - TOL,
      `beat ${scene.id}: text inStart ${inStart} begins before its scene (${sceneStart})`,
    );
    const cap = Math.abs(sceneEnd - 1) < TOL ? Infinity : sceneEnd;
    assert.ok(
      outEnd <= cap + TOL,
      `beat ${scene.id}: text outEnd ${outEnd} overruns its scene (${sceneEnd}) — the copy/marker would ride the next scene's visuals`,
    );
  }
});

test('scene anchors land on the settled beat they name (tick = travel = spy)', () => {
  // SCENE_ANCHOR_RAW is the ONE raw-scroll position per scene that the arc
  // gauge's station ticks are placed at AND click-travel scrolls to. Resting
  // there must (a) resolve to that scene (the spy highlights the right row) and
  // (b) put the shader stage inside the scene's settledWindow (its marker shows,
  // the beat is visually settled) — otherwise the gauge points between stations
  // or travel parks mid-transition.
  const windowBySceneId = {};
  for (const seg of SEGMENTS) {
    if (seg.phase === 'idle' && seg.settledWindow) windowBySceneId[seg.sceneId] = seg.settledWindow;
  }
  for (const scene of SCENES) {
    const raw = anchorRawForScene(scene.id);
    assert.ok(raw >= 0 && raw <= 1, `anchor for ${scene.id} out of range: ${raw}`);
    assert.equal(
      sceneForProgress(raw).sceneId,
      scene.id,
      `anchor for ${scene.id} (raw ${raw}) resolves to the wrong scene`,
    );
    const [lo, hi] = windowBySceneId[scene.id];
    const stage = legacyStageForProgressFromTable(raw);
    assert.ok(
      stage >= lo - TOL && stage <= hi + TOL,
      `anchor for ${scene.id}: stage ${stage} outside its settledWindow [${lo}, ${hi}]`,
    );
  }
});

test('scene anchors are strictly ordered along the rail (top → bottom)', () => {
  // HUD_NAV_ITEMS is in physical scroll order; the gauge sweeps its stations in
  // that order, so the anchors must be strictly increasing in raw scroll.
  let prev = -Infinity;
  for (const item of HUD_NAV_ITEMS) {
    const raw = anchorRawForScene(item.id);
    assert.ok(raw > prev, `anchor for ${item.id} (${raw}) not after previous (${prev})`);
    prev = raw;
  }
});

test('exactly one scene arms the HUD, and it owns the physical page bottom', () => {
  const armed = SCENES.filter((s) => sceneActivatesHud(s.id));
  assert.equal(armed.length, 1, 'exactly one activatesHud scene');
  assert.equal(
    armed[0].id,
    sceneForProgress(1).sceneId,
    'the HUD-arming scene must be the one the bottom of the page rests on',
  );
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
