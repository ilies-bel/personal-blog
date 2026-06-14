// Candidate-05 safety net: pin the yellow⇄red renderer handoff (transitions.ts) —
// the single most fragile beat in the hero. The mesh "sun rig" (yellow) and the
// ~1.2M-point cloud (red giant) are DIFFERENT renderers, so they hand off across a
// ~0.02-stage-wide cross-dissolve band; one constant nudge silently flashes a red
// giant behind the yellow mesh (a gap) or double-exposes both (a bleed).
//
// node --test runs .mjs with NO TypeScript transform, so — exactly as the existing
// scene-curve / scene-data / camera-pose tests do — the transitions.ts math is
// hand-translated here as pure JS and the INVARIANTS are asserted over a dense stage
// sweep. The TS module is separately type-checked by `astro check` + the build; this
// file pins the BEHAVIOUR the source (and any future refactor that collapses the
// choreography cluster) must preserve.
//
// Every constant + every smoothstep below is copied byte-for-byte from the source:
//   smoothstep01            ← src/hero/lifecycle.ts:50
//   SWAP_STAGE = 2.88       ← src/hero/sceneTable.ts:432
//   SWAP_XFADE = 0.02       ← src/hero/sceneTable.ts:444
//   NEBULA_ACTIVE_STAGE 3.5 ← src/hero/sceneTable.ts:422
//   NEB_COLLAPSE_LO = 3.0   ← src/hero/sceneTable.ts:429
//   RED_EXIT_START = 2.5    ← src/hero/sceneTable.ts:446
//   RED_COLOR_EXIT_START 2.52 ← src/hero/sceneTable.ts:448
//   RED_SHRINK_END = 2.85   ← src/hero/sceneTable.ts:452
import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- primitives (copied verbatim from lifecycle.ts:50) ----------------------
const smoothstep01 = (x) => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
};

// --- de-duplicated constants (copied verbatim from sceneTable.ts) -----------
const NEBULA_ACTIVE_STAGE = 3.5;
const NEB_COLLAPSE_LO = 3.0;
const SWAP_STAGE = 2.88;
const SWAP_XFADE = 0.02;
const RED_EXIT_START = 2.5;
const RED_COLOR_EXIT_START = 2.52;
const RED_SHRINK_END = 2.85;

// === REFERENCE: yellowRedSwap, hand-translated from transitions.ts:107 ======
function yellowRedSwap(stage, nebula) {
  const inYRWindow = stage >= 2.05 && stage < 3.5 && !nebula;
  const meshSide = inYRWindow && stage > SWAP_STAGE;
  const cloudSide = inYRWindow && stage <= SWAP_STAGE;
  const yrFlash = 0;
  const yrGrow = 1 - smoothstep01((stage - RED_EXIT_START) / (RED_SHRINK_END - RED_EXIT_START));
  const yrColor = 1 - smoothstep01((stage - RED_COLOR_EXIT_START) / (RED_SHRINK_END - RED_COLOR_EXIT_START));
  return { inYRWindow, meshSide, cloudSide, yrFlash, yrGrow, yrColor };
}

// === REFERENCE: bodyOwnership, hand-translated from transitions.ts:194 ======
const COLLAPSE_FLOOR_XFADE = 0.05;
function bodyOwnership(stage, starFormed) {
  const meshFormIn = smoothstep01(starFormed / 0.12);
  let cloudW;
  let meshW;
  if (stage >= NEBULA_ACTIVE_STAGE) {
    cloudW = 1;
    meshW = 0;
  } else if (stage > NEB_COLLAPSE_LO) {
    cloudW = 1;
    meshW = meshFormIn;
  } else if (stage > NEB_COLLAPSE_LO - COLLAPSE_FLOOR_XFADE) {
    cloudW = 1 - smoothstep01((NEB_COLLAPSE_LO - stage) / COLLAPSE_FLOOR_XFADE);
    meshW = 1;
  } else if (stage > SWAP_STAGE) {
    cloudW = 0;
    meshW = 1;
  } else if (stage > SWAP_STAGE - SWAP_XFADE) {
    const m = smoothstep01((stage - (SWAP_STAGE - SWAP_XFADE)) / SWAP_XFADE);
    cloudW = 1 - m;
    meshW = m;
  } else {
    cloudW = 1;
    meshW = 0;
  }
  return { cloudW, meshW };
}

// ===========================================================================
// yellowRedSwap — window membership + the grow/colour shrink curves.
// ===========================================================================

test('yellowRedSwap: mesh/cloud sides partition the YR window exactly at SWAP_STAGE', () => {
  // meshSide and cloudSide are mutually exclusive, and exactly one is true inside
  // the window. The boundary is SWAP_STAGE (2.88): > is mesh, <= is cloud.
  for (let s = 2.05; s <= 3.49; s += 0.0005) {
    const stage = Math.round(s * 10000) / 10000;
    const { inYRWindow, meshSide, cloudSide } = yellowRedSwap(stage, false);
    assert.equal(inYRWindow, true, `expected in-window at stage ${stage}`);
    assert.ok(!(meshSide && cloudSide), `mesh & cloud both own stage ${stage}`);
    assert.equal(meshSide || cloudSide, true, `neither side owns in-window stage ${stage}`);
    assert.equal(meshSide, stage > SWAP_STAGE, `meshSide boundary wrong at ${stage}`);
  }
});

test('yellowRedSwap: nebula gate closes the window; held red-giant beat at 2.05 is interactive', () => {
  // nebula active => window is closed everywhere (the nebula owns the geometry).
  for (let s = 2.05; s <= 3.49; s += 0.01) {
    assert.equal(yellowRedSwap(s, true).inYRWindow, false, `window should be closed under nebula at ${s}`);
  }
  // inclusive lower bound: the held red-giant close-up at exactly 2.05 must be in-window
  // (so the marker is interactive). Just below it falls out.
  assert.equal(yellowRedSwap(2.05, false).inYRWindow, true, 'stage 2.05 must be in-window (inclusive)');
  assert.equal(yellowRedSwap(2.0499, false).inYRWindow, false, 'below 2.05 must be out of window');
});

test('yellowRedSwap: yrGrow/yrColor finish (reach 0) by RED_SHRINK_END, before the 2.88 swap', () => {
  // The cloud must be fully shrunk to yellow size (yrGrow→0) and fully cooled to gold
  // (yrColor→0) by RED_SHRINK_END=2.85 — BELOW the swap band — so the dissolve trades
  // one small gold ball for another, never a big red cloud behind the sun.
  for (let s = RED_SHRINK_END; s <= SWAP_STAGE + 0.001; s += 0.001) {
    const { yrGrow, yrColor } = yellowRedSwap(s, false);
    assert.ok(yrGrow < 1e-9, `yrGrow must be ~0 at/above RED_SHRINK_END (stage ${s}): ${yrGrow}`);
    assert.ok(yrColor < 1e-9, `yrColor must be ~0 at/above RED_SHRINK_END (stage ${s}): ${yrColor}`);
  }
  // full size + full red at the shrink start
  assert.ok(Math.abs(yellowRedSwap(RED_EXIT_START, false).yrGrow - 1) < 1e-9, 'yrGrow=1 at RED_EXIT_START');
});

test('yellowRedSwap: yrGrow is monotonically non-increasing across the shrink window', () => {
  let prev = Infinity;
  for (let s = RED_EXIT_START; s <= RED_SHRINK_END; s += 0.001) {
    const { yrGrow } = yellowRedSwap(s, false);
    assert.ok(yrGrow <= prev + 1e-12, `yrGrow not monotone at stage ${s}: ${yrGrow} > ${prev}`);
    prev = yrGrow;
  }
});

// ===========================================================================
// bodyOwnership — the heart of Candidate 05. The two foreground bodies must be
// mutually exclusive EXCEPT in the two declared crossfade bands, with NO gap
// (a frame nobody owns) and NO uncontrolled bleed (both at full strength).
// ===========================================================================

test('bodyOwnership: no GAP — some body always owns the frame (cloudW + meshW > 0)', () => {
  // The classic failure mode: a re-timing leaves a sliver where both weights are 0
  // and nothing renders (a flash of empty space). Assert SOME body is present at
  // every stage across the whole foreground span, for low and high starFormed.
  for (const starFormed of [0, 0.5, 1]) {
    for (let s = 2.0; s <= 3.6; s += 0.0005) {
      const stage = Math.round(s * 10000) / 10000;
      const { cloudW, meshW } = bodyOwnership(stage, starFormed);
      assert.ok(cloudW + meshW > 1e-9, `GAP: nobody owns stage ${stage} (starFormed ${starFormed})`);
    }
  }
});

test('bodyOwnership: the yellow⇄red dissolve band conserves presence (cloudW + meshW === 1)', () => {
  // Inside [SWAP_STAGE - SWAP_XFADE, SWAP_STAGE] the cloud fades out as the mesh fades
  // in: their weights must sum to exactly 1 (a true cross-dissolve, no double-bright
  // bleed, no dip). This is the invariant that a constant nudge would break.
  for (let s = SWAP_STAGE - SWAP_XFADE; s <= SWAP_STAGE; s += 0.0005) {
    const { cloudW, meshW } = bodyOwnership(s, 1);
    assert.ok(Math.abs(cloudW + meshW - 1) < 1e-9, `dissolve not conserved at stage ${s}: ${cloudW}+${meshW}`);
  }
  // and the band ends cleanly: pure mesh just above SWAP_STAGE, pure cloud just below the band.
  assert.deepEqual(bodyOwnership(SWAP_STAGE + 0.001, 1), { cloudW: 0, meshW: 1 });
  assert.deepEqual(bodyOwnership(SWAP_STAGE - SWAP_XFADE - 0.001, 1), { cloudW: 1, meshW: 0 });
});

test('bodyOwnership: the collapse-floor crossfade is an OVERWRITE dissolve (mesh held at 1, cloud retreats over it)', () => {
  // The other declared crossfade: [NEB_COLLAPSE_LO - COLLAPSE_FLOOR_XFADE, NEB_COLLAPSE_LO]
  // (3.0 → 2.95). Unlike the swap band, this is NOT presence-conserving: the mesh is
  // ALREADY full (meshW=1) and the cloud fades out 1→0 ON TOP of it. So the guarantee
  // is "mesh always covers" (meshW===1, no gap), with cloud monotonically retreating —
  // never a dip below full coverage. (Pinning sum===1 here would be wrong: the source
  // deliberately holds the mesh at 1 across this band, see transitions.ts:236-239.)
  // The loop sweeps s upward 2.95 → 3.0. Over that rise cloudW grows 0 → 1 (the cloud
  // re-asserts as we climb back toward the nebula), so it is monotonically NON-DECREASING
  // here; scrolling DOWN walks stage the other way, i.e. the cloud retreating off the mesh.
  let prevCloud = -Infinity;
  for (let s = NEB_COLLAPSE_LO - COLLAPSE_FLOOR_XFADE; s <= NEB_COLLAPSE_LO; s += 0.0005) {
    const { cloudW, meshW } = bodyOwnership(s, 1);
    assert.equal(meshW, 1, `mesh must stay full across the floor xfade at stage ${s}`);
    assert.ok(cloudW >= 0 && cloudW <= 1, `cloudW out of range at ${s}: ${cloudW}`);
    assert.ok(cloudW >= prevCloud - 1e-12, `cloud not monotone across the floor xfade at ${s}`);
    prevCloud = cloudW;
  }
});

test('bodyOwnership: outside the two crossfade bands the bodies are mutually exclusive', () => {
  // Everywhere that is NOT one of the two declared xfade bands, exactly one body owns
  // the frame at full strength (the other is 0). starFormed=1 so the collapse-window
  // mesh-fade-in is saturated (meshFormIn=1) and doesn't count as a partial.
  const inFloorXfade = (s) => s > NEB_COLLAPSE_LO - COLLAPSE_FLOOR_XFADE && s <= NEB_COLLAPSE_LO;
  const inSwapXfade = (s) => s > SWAP_STAGE - SWAP_XFADE && s <= SWAP_STAGE;
  for (let s = 2.0; s <= 3.6; s += 0.0005) {
    const stage = Math.round(s * 10000) / 10000;
    if (inFloorXfade(stage) || inSwapXfade(stage)) continue;
    if (stage > NEB_COLLAPSE_LO && stage < NEBULA_ACTIVE_STAGE) continue; // collapse window: mesh fades under cloud
    const { cloudW, meshW } = bodyOwnership(stage, 1);
    const exclusive = (cloudW === 1 && meshW === 0) || (cloudW === 0 && meshW === 1);
    assert.ok(exclusive, `not mutually exclusive at stage ${stage}: cloudW=${cloudW} meshW=${meshW}`);
  }
});

test('bodyOwnership: in the collapse window the cloud owns (cloudW=1) and the mesh only fades UNDER it', () => {
  // stage in (3.0, 3.5): cloud is always fully present; the mesh rides starFormed but
  // never exceeds it — the young star reads THROUGH the gas, never replacing it.
  for (let s = NEB_COLLAPSE_LO + 0.001; s < NEBULA_ACTIVE_STAGE; s += 0.001) {
    const { cloudW, meshW } = bodyOwnership(s, 0.5);
    assert.equal(cloudW, 1, `cloud must own the collapse window at ${s}`);
    assert.ok(meshW <= 1, `meshW out of range at ${s}`);
  }
});
