// PRD-004 destination-label audit — the mapping invariant, pinned.
//
// Every DIVE-CAPABLE marker must carry an audited transitLabel; the warp-only
// About ('beginning') marker must NOT (it falls through to the hyperspace warp,
// which owns no bloom/dive label). sceneTable.ts imports a relative module
// (./scroll) that node's type-stripping loader can't resolve extensionless, so —
// like scene-data.test.mjs — this reads the marker table from source and asserts
// the audited mapping rather than importing the module. The TS types + the build
// separately guarantee the field shape; this pins the VALUES the audit approved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('../src/hero/sceneTable.ts', import.meta.url)),
  'utf8',
);

// The audited mapping (approved 2026-07): dive marker id → { href, transitLabel }.
// About/'beginning' is intentionally absent (warp-only, no carrier).
const AUDIT = {
  nebula: { href: 'writing', transitLabel: 'WRITING' },
  yellow: { href: 'projects', transitLabel: 'PROJECTS' },
  red: { href: 'graveyard', transitLabel: 'GRAVEYARD' },
  end: { href: 'posts/thanks-for-scrolling-to-the-bottom', transitLabel: 'INSPIRATION' },
};

// Extract each `markers: [ { … } ]` object literal that carries an `id:` — good
// enough to slice the four dive markers + the beginning marker for this check.
function markerBlocks(id) {
  // Grab the object literal that opens with `id: '<id>'` inside a markers array.
  const re = new RegExp(`\\{[^{}]*?id:\\s*'${id}'[\\s\\S]*?\\n\\s{6,}\\}`, 'g');
  return source.match(re) ?? [];
}

for (const [id, expected] of Object.entries(AUDIT)) {
  test(`dive marker '${id}' carries the audited transitLabel '${expected.transitLabel}'`, () => {
    // Find the marker object (the one inside a markers array — it has vx/vy).
    const block = markerBlocks(id).find((b) => /vx:/.test(b) && /dive:\s*true/.test(b));
    assert.ok(block, `a dive marker literal for '${id}' with vx and dive:true exists`);
    assert.match(
      block,
      new RegExp(`transitLabel:\\s*'${expected.transitLabel}'`),
      `'${id}' must carry transitLabel '${expected.transitLabel}'`,
    );
    assert.match(block, new RegExp(`href:\\s*'${expected.href}'`), `'${id}' href is ${expected.href}`);
  });
}

test("the warp-only About ('beginning') marker carries NO transitLabel", () => {
  // Slice the beginning marker's literal precisely: from its `id: 'beginning'`
  // (the SECOND occurrence — the first is the scene id / hud id) inside a markers
  // array (it has vx/vy) up to the next marker `id:` or the markers-array close.
  const starts = [...source.matchAll(/id:\s*'beginning'/g)].map((m) => m.index);
  // The marker literal (not the scene/hud id) is the one followed by vx within a
  // short window.
  const markerStart = starts.find((i) => /vx:/.test(source.slice(i, i + 400)));
  assert.ok(markerStart !== undefined, "the 'beginning' marker literal exists");
  const block = source.slice(markerStart, markerStart + 700);
  assert.doesNotMatch(block, /transitLabel:/, "'beginning' must NOT carry a transit label");
});

test('exactly the four audited dive markers carry a transitLabel', () => {
  // Count actual marker-literal occurrences: `transitLabel: '<value>'` (the field
  // assignment, not the type declaration `transitLabel?: string`).
  const labels = [...source.matchAll(/transitLabel:\s*'([A-Z]+)'/g)].map((m) => m[1]);
  assert.equal(labels.length, Object.keys(AUDIT).length, 'exactly four transit labels are assigned');
  const expected = Object.values(AUDIT).map((a) => a.transitLabel).sort();
  assert.deepEqual([...labels].sort(), expected, 'the assigned labels are exactly the audited set');
});
