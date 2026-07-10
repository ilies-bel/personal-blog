// ENG-007 — Mobile lifecycle and scene-progress damper safety net.
//
// Three families of tests, all exercising EXPORTED PURE FUNCTIONS from the live
// source — no stubs, no mocks:
//
//   1. mobileLifecycleStage — the linear scroll-progress → stage mapping for mobile.
//      Proves the 8-beat spec-mandated positions within a 3-% tolerance of stage-per-
//      viewport, and that the map covers the full 0 → STAGE_MAX range.
//
//   2. advanceVisualStage — the per-frame scene-progress damper.
//      Proves passthrough below the velocity threshold, capped advance inside each
//      declared zone, and passthrough outside all zones even at high velocity.
//
//   3. Desktop curve smoke — that legacyStageForProgressFromTable (the NON-mobile
//      production path) still maps p=0 → 0 (black hole) and p=1 → 4.7 (dot) after
//      our changes, i.e. the desktop arc is byte-identical in behaviour.
//
// node --test has no TypeScript transform; both source modules are bundled with
// esbuild the same way scene-table-live.test.mjs bundles sceneTable.ts.
//
// docs/specs/mobile-cut.md §3 specifies beat positions using "stage ≈ p × 5" —
// the linear mobile mapping — so the tolerance on each beat boundary is ±0.15
// stage units (3 % of STAGE_MAX=5.0), loose enough to survive floating-point and
// future minor rebalancing while tight enough to catch a mis-wired curve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// ---------------------------------------------------------------------------
// Bundle src/hero/scroll.ts (live source, all exports) and
// src/hero/sceneTable.ts (live source, for the desktop-curve smoke test).
// Both are bundled from their actual file so any constant change propagates
// automatically — these are not hand-translated copies.
// ---------------------------------------------------------------------------

const scrollEntry = new URL('../src/hero/scroll.ts', import.meta.url).pathname;
const tableEntry = new URL('../src/hero/sceneTable.ts', import.meta.url).pathname;

const [scrollBundle, tableBundle] = await Promise.all([
  build({ entryPoints: [scrollEntry], bundle: true, format: 'esm', write: false, platform: 'neutral', logLevel: 'silent' }),
  build({ entryPoints: [tableEntry], bundle: true, format: 'esm', write: false, platform: 'neutral', logLevel: 'silent' }),
]);

const toDataUri = (text) =>
  'data:text/javascript;base64,' + Buffer.from(text).toString('base64');

const scroll = await import(toDataUri(scrollBundle.outputFiles[0].text));
const table  = await import(toDataUri(tableBundle.outputFiles[0].text));

const {
  STAGE_MAX,
  MOBILE_VIEWPORT_COUNT,
  mobileLifecycleStage,
  DAMP_VELOCITY_THRESHOLD,
  SUPERNOVA_DAMP_ZONE,
  FINALE_DAMP_ZONE,
  advanceVisualStage,
} = scroll;

const { legacyStageForProgressFromTable } = table;

// Tight tolerance for pure-math assertions (floating-point only).
const EPS = 1e-9;
// Beat-boundary tolerance: ±3 % of STAGE_MAX (see test-suite header).
const BEAT_TOL = 0.15;

// ===========================================================================
// 1. mobileLifecycleStage — the 8-beat linear map (docs/specs/mobile-cut.md §3)
// ===========================================================================

test('mobileLifecycleStage: p=0 gives stage 0 (black hole)', () => {
  assert.ok(Math.abs(mobileLifecycleStage(0) - 0) < EPS);
});

test('mobileLifecycleStage: p=1 gives STAGE_MAX (end of track)', () => {
  assert.ok(Math.abs(mobileLifecycleStage(1) - STAGE_MAX) < EPS);
});

test('mobileLifecycleStage: clamps negative progress to 0', () => {
  assert.equal(mobileLifecycleStage(-1), 0);
});

test('mobileLifecycleStage: clamps progress > 1 to STAGE_MAX', () => {
  assert.ok(Math.abs(mobileLifecycleStage(2) - STAGE_MAX) < EPS);
});

test('mobileLifecycleStage: midpoint p=0.5 gives STAGE_MAX/2 (monotone centre)', () => {
  assert.ok(Math.abs(mobileLifecycleStage(0.5) - STAGE_MAX / 2) < EPS);
});

// Beat-boundary positions — spec §3. Each beat spans 1/MOBILE_VIEWPORT_COUNT of the
// track. At p = k/8 the stage should be k × (STAGE_MAX/8). Tolerance ±BEAT_TOL.
for (let beat = 0; beat <= MOBILE_VIEWPORT_COUNT; beat += 1) {
  const p = beat / MOBILE_VIEWPORT_COUNT;
  const expectedStage = p * STAGE_MAX;
  test(`mobileLifecycleStage: beat boundary ${beat}/8 (p=${p}) → stage ≈ ${expectedStage.toFixed(3)}`, () => {
    const got = mobileLifecycleStage(p);
    assert.ok(
      Math.abs(got - expectedStage) <= BEAT_TOL,
      `mobileLifecycleStage(${p}) = ${got}, expected ≈ ${expectedStage} (±${BEAT_TOL})`,
    );
  });
}

test('mobileLifecycleStage: supernova peak (stage 0.62) occurs at ≈ 12.4 % scroll', () => {
  // spec §1.4 table: NOVA_CENTER at stage 0.62 = 12.4 % of the 8-viewport track.
  const novaStage = 0.62;
  const expectedProgress = novaStage / STAGE_MAX; // ≈ 0.124
  const got = mobileLifecycleStage(expectedProgress);
  assert.ok(
    Math.abs(got - novaStage) <= BEAT_TOL,
    `At p=${expectedProgress.toFixed(3)}, mobileLifecycleStage = ${got}, expected ≈ ${novaStage}`,
  );
});

test('mobileLifecycleStage: dot activation (stage 4.5) occurs at ≈ 90 % scroll', () => {
  // spec §1.4 table: DOT_ACTIVE_STAGE = 4.5 = 90 % of the 8-viewport track.
  const dotProgress = 0.90;
  const got = mobileLifecycleStage(dotProgress);
  assert.ok(
    Math.abs(got - 4.5) <= BEAT_TOL,
    `mobileLifecycleStage(0.9) = ${got}, expected ≈ 4.5`,
  );
});

test('mobileLifecycleStage: is strictly monotone across [0,1] at fine step 0.001', () => {
  let prev = mobileLifecycleStage(0);
  for (let i = 1; i <= 1000; i += 1) {
    const p = i / 1000;
    const cur = mobileLifecycleStage(p);
    assert.ok(cur >= prev - EPS, `not monotone at p=${p}: ${cur} < ${prev}`);
    prev = cur;
  }
});

test('mobileLifecycleStage: MOBILE_VIEWPORT_COUNT equals 8', () => {
  assert.equal(MOBILE_VIEWPORT_COUNT, 8);
});

test('mobileLifecycleStage: STAGE_MAX equals 5.0', () => {
  assert.equal(STAGE_MAX, 5.0);
});

// ===========================================================================
// 2. advanceVisualStage — the per-frame scene-progress damper (§5)
// ===========================================================================

test('advanceVisualStage: below velocity threshold → passthrough (slow scroll)', () => {
  // At or below 1.5 vp/s the follower is exact — direct-manipulation feel preserved.
  const rawStage = 0.62; // inside supernova zone
  for (const v of [0, 0.5, DAMP_VELOCITY_THRESHOLD]) {
    const got = advanceVisualStage(0, rawStage, v);
    assert.ok(Math.abs(got - rawStage) < EPS, `passthrough failed at v=${v}, got=${got}`);
  }
});

test('advanceVisualStage: passthrough when velocity is negative but below threshold', () => {
  const got = advanceVisualStage(4.5, 4.3, -1.0); // reversed scroll, slow
  assert.ok(Math.abs(got - 4.3) < EPS);
});

test('advanceVisualStage: outside all zones at high velocity → passthrough', () => {
  // Outside both zones, damping is disabled regardless of speed.
  const cases = [
    { v: 0, s: 1.5 },  // below-threshold + outside
    { v: 5, s: 1.5 },  // above-threshold + outside zones
    { v: 5, s: 2.5 },  // above-threshold, yellow star zone (not a damp zone)
    { v: 5, s: 3.5 },  // above-threshold, nebula (not a damp zone)
    { v: 5, s: 0.39 }, // just below supernova zone lo=0.40
    { v: 5, s: 0.91 }, // just above supernova zone hi=0.90
  ];
  for (const { v, s } of cases) {
    const got = advanceVisualStage(s - 0.5, s, v);
    assert.ok(
      Math.abs(got - s) < EPS,
      `expected passthrough for v=${v} stage=${s}, got ${got}`,
    );
  }
});

test('advanceVisualStage: inside supernova zone at high velocity → capped at maxDelta', () => {
  // Supernova zone: 0.40 – 0.90, MAX_DELTA = 0.018 stage/frame (spec §5.2).
  const { lo, hi, maxDelta } = SUPERNOVA_DAMP_ZONE;
  // Advance from zone entry toward far side in one huge step — should be capped.
  const visual = lo;
  const raw = hi; // jump to far end of zone in one frame
  const v = 3.0;  // fast flick
  const got = advanceVisualStage(visual, raw, v);
  assert.ok(
    Math.abs(got - (visual + maxDelta)) < EPS,
    `supernova cap: expected visual+maxDelta=${visual + maxDelta}, got ${got}`,
  );
});

test('advanceVisualStage: inside finale zone at high velocity → capped at maxDelta', () => {
  // Finale zone: 4.30 – 5.00, MAX_DELTA = 0.015 stage/frame (spec §5.3).
  const { lo, hi, maxDelta } = FINALE_DAMP_ZONE;
  const visual = lo;
  const raw = hi;
  const v = 3.0;
  const got = advanceVisualStage(visual, raw, v);
  assert.ok(
    Math.abs(got - (visual + maxDelta)) < EPS,
    `finale cap: expected visual+maxDelta=${visual + maxDelta}, got ${got}`,
  );
});

test('advanceVisualStage: backward scroll in supernova zone → capped at -maxDelta', () => {
  const { hi, maxDelta } = SUPERNOVA_DAMP_ZONE;
  const visual = hi;
  const raw = SUPERNOVA_DAMP_ZONE.lo; // jump backward
  const v = -3.0; // fast reverse scroll
  const got = advanceVisualStage(visual, raw, v);
  assert.ok(
    Math.abs(got - (visual - maxDelta)) < EPS,
    `backward supernova cap: expected ${visual - maxDelta}, got ${got}`,
  );
});

test('advanceVisualStage: supernova zone — nova envelope (0.36 stage units) needs ≥ 20 frames at 2 vp/s', () => {
  // spec §5.2: at 2 vp/s flick the visual stage advances ≤ 1.08 stage/s (60 fps × maxDelta).
  // The nova envelope width is 0.36 stage units → dwell ≥ 0.36/1.08 = 0.333 s = 20 frames.
  const { maxDelta } = SUPERNOVA_DAMP_ZONE;
  const framesPerSecond = 60;
  const maxVisualAdvancePerSecond = maxDelta * framesPerSecond; // ≤ 1.08 stage/s
  const novaWidth = 0.36; // stage 0.44 – 0.80 (spec §5.2)
  const minDwellSeconds = novaWidth / maxVisualAdvancePerSecond;
  assert.ok(
    minDwellSeconds >= 0.33,
    `nova dwell too short: ${minDwellSeconds.toFixed(3)} s (< 0.33 s)`,
  );
  // Simulate 20 frames: rawStage is FIXED at the nova peak (0.80, inside the zone),
  // so the zone guard stays active every frame and the cap applies each frame.
  // After 20 frames at 0.018/frame from 0.44 → at most 0.44 + 20×0.018 = 0.80.
  let visual = 0.44; // start of nova ramp
  const rawStage = 0.80; // a hard flick landed the raw position here (still in-zone)
  for (let i = 0; i < 20; i += 1) {
    visual = advanceVisualStage(visual, rawStage, 2.0);
  }
  const travelledIn20Frames = visual - 0.44;
  assert.ok(
    travelledIn20Frames <= novaWidth + 1e-9,
    `visual advanced ${travelledIn20Frames.toFixed(4)} stage in 20 frames, but nova is only ${novaWidth} wide`,
  );
});

test('advanceVisualStage: finale zone — dot must be visible for ≥ 20 frames (spec §5.3)', () => {
  const { lo, maxDelta } = FINALE_DAMP_ZONE;
  // Simulate 20 frames of a fast flick entering the finale zone at its floor.
  const DOT_ACTIVE_STAGE = 4.5;
  let visual = lo;
  let framesUntilDot = Infinity;
  for (let i = 0; i < 100; i += 1) {
    visual = advanceVisualStage(visual, 5.0, 3.0);
    if (framesUntilDot === Infinity && visual >= DOT_ACTIVE_STAGE) {
      framesUntilDot = i;
    }
  }
  // After entering the finale zone at its floor (4.30), dot activates at 4.50.
  // The distance is 0.20 stage units; at 0.015/frame that takes ≥ 13 frames.
  // With the remaining journey (4.50 → 5.00 = 0.50) at 0.015/frame = ≥ 33 more
  // frames — the total frames the dot is visible is ≥ 33.
  const stageFromDotTilEnd = 5.0 - DOT_ACTIVE_STAGE;
  const minDotVisibleFrames = Math.ceil(stageFromDotTilEnd / maxDelta);
  assert.ok(
    minDotVisibleFrames >= 20,
    `dot visible for only ${minDotVisibleFrames} frames, need ≥ 20`,
  );
});

test('advanceVisualStage: snap to rawStage when velocity drops back below threshold', () => {
  // After the damper has lagged behind, once velocity drops the follower must
  // snap instantly — no creep (spec §5.1 model: "snap instantly").
  const got = advanceVisualStage(0.42, 0.80, 0.5); // v < threshold
  assert.ok(Math.abs(got - 0.80) < EPS, `snap failed: got ${got}, expected 0.80`);
});

test('advanceVisualStage: DAMP_VELOCITY_THRESHOLD is 1.5', () => {
  assert.equal(DAMP_VELOCITY_THRESHOLD, 1.5);
});

test('advanceVisualStage: SUPERNOVA_DAMP_ZONE has correct spec values', () => {
  // spec §5.2 parameters
  assert.equal(SUPERNOVA_DAMP_ZONE.lo, 0.40);
  assert.equal(SUPERNOVA_DAMP_ZONE.hi, 0.90);
  assert.equal(SUPERNOVA_DAMP_ZONE.maxDelta, 0.018);
});

test('advanceVisualStage: FINALE_DAMP_ZONE has correct spec values', () => {
  // spec §5.3 parameters
  assert.equal(FINALE_DAMP_ZONE.lo, 4.30);
  assert.equal(FINALE_DAMP_ZONE.hi, 5.00);
  assert.equal(FINALE_DAMP_ZONE.maxDelta, 0.015);
});

// ===========================================================================
// 3. Desktop curve smoke — legacyStageForProgressFromTable unchanged (ENG-007
//    exit criterion: "desktop arc is byte-identical in behaviour").
// ===========================================================================

test('desktop curve: p=0 (top) → stage ≈ 0 (black hole)', () => {
  assert.ok(
    Math.abs(legacyStageForProgressFromTable(0)) < 1e-9,
    `expected 0, got ${legacyStageForProgressFromTable(0)}`,
  );
});

test('desktop curve: p=1 (bottom) → stage ≈ 4.7 (pale blue dot)', () => {
  assert.ok(
    Math.abs(legacyStageForProgressFromTable(1) - 4.7) < 1e-9,
    `expected 4.7, got ${legacyStageForProgressFromTable(1)}`,
  );
});

test('desktop curve: is monotone over a dense [0,1] sweep (stage only rises)', () => {
  let prev = legacyStageForProgressFromTable(0);
  for (let i = 1; i <= 10000; i += 1) {
    const p = i / 10000;
    const cur = legacyStageForProgressFromTable(p);
    assert.ok(cur >= prev - 1e-9, `desktop curve not monotone at p=${p}: ${cur} < ${prev}`);
    prev = cur;
  }
});

test('desktop curve: dot activation (stage 4.5) is reachable before p=1', () => {
  // The dot should activate well before the very bottom — giving it visible dwell.
  let dotProgress = null;
  for (let i = 0; i <= 1000; i += 1) {
    const p = i / 1000;
    if (dotProgress === null && legacyStageForProgressFromTable(p) >= 4.5) {
      dotProgress = p;
    }
  }
  assert.ok(dotProgress !== null && dotProgress < 0.99, `dot activated too late: p=${dotProgress}`);
});

test('desktop curve: yellow star (stage 2.5) and nebula (stage 3.5) both reachable', () => {
  let yellowProgress = null;
  let nebulaProgress = null;
  for (let i = 0; i <= 1000; i += 1) {
    const p = i / 1000;
    const s = legacyStageForProgressFromTable(p);
    if (yellowProgress === null && s >= 2.5) yellowProgress = p;
    if (nebulaProgress === null && s >= 3.5) nebulaProgress = p;
  }
  assert.ok(yellowProgress !== null, 'yellow star (stage 2.5) never reached on desktop curve');
  assert.ok(nebulaProgress !== null, 'nebula (stage 3.5) never reached on desktop curve');
  assert.ok(
    yellowProgress < nebulaProgress,
    `expected yellow before nebula: ${yellowProgress} < ${nebulaProgress}`,
  );
});
