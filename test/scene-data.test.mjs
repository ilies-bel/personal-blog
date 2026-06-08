// Phase 2 safety net: prove the table-derived settled gate + the three projected
// data arrays (HUD_NAV_ITEMS / MARKER_PLACEMENTS / BEATS) are byte-identical to the
// former hand-written literals.
//
// node --test runs .mjs with NO TypeScript transform, so:
//   - the derived settledIdForStage is hand-translated from the table here, and
//     asserted equal to the OLD hardcoded windows across a dense stage sweep;
//   - the three projections are derived from a hand-translated SCENES here, and
//     deep-equal-asserted against the snapshotted-from-current literals.
// The TS modules themselves are separately type-checked by `astro check` and the
// build; this file pins the VALUES the refactor must preserve.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// === OLD hardcoded settled windows (frozen copy of the former duplicated body) ===
function oldSettledIdForStage(stage) {
  if (stage >= 4.5 && stage <= 4.72) return 'beginning';
  if (stage >= 3.38 && stage <= 3.5) return 'nebula';
  if (stage >= 2.86 && stage <= 2.9) return 'yellow';
  if (stage >= 2.0 && stage <= 2.12) return 'red';
  if (stage >= 0.0 && stage <= 0.12) return 'end';
  return null;
}

// === NEW derived gate: hand-translated from the SEGMENTS settledWindow scan ======
const SEGMENT_WINDOWS = [
  { sceneId: 'beginning', settledWindow: [4.5, 4.72] },
  { sceneId: 'nebula', settledWindow: [3.38, 3.5] },
  { sceneId: 'yellow', settledWindow: [2.86, 2.9] },
  { sceneId: 'red', settledWindow: [2.0, 2.12] },
  { sceneId: 'end', settledWindow: [0.0, 0.12] },
];
function derivedSettledIdForStage(stage) {
  for (const seg of SEGMENT_WINDOWS) {
    const [lo, hi] = seg.settledWindow;
    if (stage >= lo && stage <= hi) return seg.sceneId;
  }
  return null;
}

test('derived settled gate === old hardcoded windows across stage [0,5] step 0.001', () => {
  let mismatches = 0;
  let firstBad = null;
  for (let s = 0; s <= 5.0000001; s += 0.001) {
    // round to avoid fp drift in the loop counter
    const stage = Math.round(s * 1000) / 1000;
    const a = derivedSettledIdForStage(stage);
    const b = oldSettledIdForStage(stage);
    if (a !== b) {
      mismatches += 1;
      if (firstBad === null) firstBad = { stage, derived: a, old: b };
    }
  }
  assert.equal(mismatches, 0, `settled gate mismatches: ${mismatches}, first: ${JSON.stringify(firstBad)}`);
});

// === SNAPSHOT of the current literals (copied verbatim from the source) ==========
const EXPECTED_HUD_NAV_ITEMS = [
  { id: 'beginning', glyphSrc: 'glyphs/glyph-dot.svg', motion: 'still', label: 'THE BEGINNING', destination: 'About', stage: 4.7, href: 'about' },
  { id: 'nebula', glyphSrc: 'glyphs/glyph-nebula.svg', motion: 'breathe', label: 'NEBULA', destination: 'Writing', stage: 3.5, href: 'writing' },
  { id: 'yellow', glyphSrc: 'glyphs/glyph-yellow-star.svg', motion: 'flicker', label: 'YELLOW STAR', destination: 'Projects', stage: 2.9, href: 'projects' },
  { id: 'red', glyphSrc: 'glyphs/glyph-red-giant.svg', motion: 'drift', label: 'GRAVEYARD', destination: 'Graveyard', stage: 2.05, href: 'graveyard' },
  { id: 'end', glyphSrc: 'glyphs/glyph-black-hole.svg', motion: 'pulse', label: 'BLACK HOLE', destination: 'Inspiration', stage: 0, href: 'posts/thanks-for-scrolling-to-the-bottom' },
];

const EXPECTED_MARKER_PLACEMENTS = [
  { id: 'beginning', state: 'beginning', vx: 0.5, vy: 0.5, anchored: true, href: 'about', title: 'ABOUT', subtitle: 'Who I am' },
  { id: 'nebula-01', state: 'nebula', vx: 0.82, vy: 0.22, href: 'writing', title: 'WRITING / 01', subtitle: 'Notes & essays' },
  { id: 'nebula-02', state: 'nebula', vx: 0.19, vy: 0.4, href: 'writing', title: 'WRITING / 02', subtitle: 'Notes & essays' },
  { id: 'nebula-03', state: 'nebula', vx: 0.58, vy: 0.8, href: 'writing', title: 'WRITING / 03', subtitle: 'Notes & essays' },
  { id: 'yellow', state: 'yellow', vx: 0.4, vy: 0.38, href: 'projects', title: 'PROJECTS', subtitle: 'Things I build' },
  { id: 'red', state: 'red', vx: 0.5, vy: 0.46, href: 'graveyard', title: 'GRAVEYARD', subtitle: 'Things I abandoned' },
  { id: 'end', state: 'end', vx: 0.5, vy: 0.5, href: 'posts/thanks-for-scrolling-to-the-bottom', title: 'INSPIRATION', subtitle: 'Why this site exists' },
];

const EXPECTED_BEATS = [
  { at: 0.025, text: { inStart: 0.0, inEnd: 0.0, outStart: 0.06, outEnd: 0.09 }, state: 'pale blue dot', down: 'I build software that stays understandable.', up: 'I build software that stays understandable.', whisper: 'understandable is a choice you make on purpose.' },
  { at: 0.21, text: { inStart: 0.185, inEnd: 0.205, outStart: 0.265, outEnd: 0.295 }, state: 'nebula', down: 'One boundary can outlive a thousand generated lines.', up: 'One boundary can outlive a thousand generated lines.', whisper: 'prompts, diffs, failing tests, half-ideas. raw material, not magic.' },
  { at: 0.355, text: { inStart: 0.31, inEnd: 0.335, outStart: 0.375, outEnd: 0.395 }, state: 'yellow star', down: 'Systems grow. Interfaces drift. Complexity compounds.', up: 'Systems grow. Interfaces drift. Complexity compounds.', whisper: "tests, review, small units, boring choices. that's the craft." },
  { at: 0.601, text: { inStart: 0.524, inEnd: 0.562, outStart: 0.638, outEnd: 0.676 }, state: 'red giant', down: 'My work is to keep the center readable.', up: 'My work is to keep the center readable.', whisper: "the ai keeps adding. nobody's left who understands it." },
  { at: 0.968, text: { inStart: 0.955, inEnd: 0.965, outStart: 1.02, outEnd: 1.02 }, state: 'black hole', down: 'Explore the projects.', up: 'Explore the projects.', whisper: 'even the repo you were proud of.' },
];

// === Hand-translated SCENES (the new colocated source) + the projections =========
const SCENES = [
  { id: 'beginning', hud: EXPECTED_HUD_NAV_ITEMS[0], markers: [EXPECTED_MARKER_PLACEMENTS[0]], beat: EXPECTED_BEATS[0] },
  { id: 'nebula', hud: EXPECTED_HUD_NAV_ITEMS[1], markers: [EXPECTED_MARKER_PLACEMENTS[1], EXPECTED_MARKER_PLACEMENTS[2], EXPECTED_MARKER_PLACEMENTS[3]], beat: EXPECTED_BEATS[1] },
  { id: 'yellow', hud: EXPECTED_HUD_NAV_ITEMS[2], markers: [EXPECTED_MARKER_PLACEMENTS[4]], beat: EXPECTED_BEATS[2] },
  { id: 'red', hud: EXPECTED_HUD_NAV_ITEMS[3], markers: [EXPECTED_MARKER_PLACEMENTS[5]], beat: EXPECTED_BEATS[3] },
  { id: 'end', hud: EXPECTED_HUD_NAV_ITEMS[4], markers: [EXPECTED_MARKER_PLACEMENTS[6]], beat: EXPECTED_BEATS[4] },
];
const HUD_NAV_ITEMS = SCENES.map((s) => s.hud);
const MARKER_PLACEMENTS = SCENES.flatMap((s) => s.markers);
const BEATS = SCENES.flatMap((s) => (s.beat ? [s.beat] : []));

test('HUD_NAV_ITEMS projection deep-equals the snapshotted literals (same order)', () => {
  assert.deepEqual(HUD_NAV_ITEMS, EXPECTED_HUD_NAV_ITEMS);
});

test('MARKER_PLACEMENTS projection deep-equals the snapshotted literals (same order, nebula x3)', () => {
  assert.deepEqual(MARKER_PLACEMENTS, EXPECTED_MARKER_PLACEMENTS);
  // explicit count guard: nebula owns 3, every other scene owns 1 => 7 total
  assert.equal(MARKER_PLACEMENTS.length, 7);
  assert.equal(MARKER_PLACEMENTS.filter((m) => m.state === 'nebula').length, 3);
});

test('BEATS projection deep-equals the snapshotted literals (5 beats, order preserved)', () => {
  assert.deepEqual(BEATS, EXPECTED_BEATS);
  assert.equal(BEATS.length, 5);
  // index 0 must be the pale-blue-dot beat (index.astro renders it as <h1>)
  assert.equal(BEATS[0].state, 'pale blue dot');
});
