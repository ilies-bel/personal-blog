// Loader warm-gate timing invariants.
//
// The home loader releases on:
//
//     scenePainted && (intentQualified || (floorElapsed && warmSettled))
//
// with three independent ways for the warm gate to settle: the engine's
// scene:warm-done, a LOADER_WARM_MAX_MS cap measured from loader init, and a
// scroll-intent waiver — above which sits index.astro's unconditional 8s safety
// backstop.
//
// That only behaves as designed if the three timings stay ORDERED. These are
// cheap constants to change and the failure mode is silent (a loader that holds
// too long reads as a hang; a cap above the backstop is dead code), so the
// ordering is asserted here rather than left to review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOADER_MIN_MS, LOADER_WARM_MAX_MS } from '../src/hero/lib/constants.ts';

/** The unconditional reveal backstop in src/pages/index.astro. Mirrored, not
 *  imported: it is a literal in that file's inline loader script. If it moves
 *  there, this must move with it — which is the point of asserting on it. */
const SAFETY_BACKSTOP_MS = 8000;

test('the warm cap sits above the honesty floor', () => {
  // A cap at or below the floor could never extend anything: the floor timer
  // would always be the later of the two and the gate would be decorative.
  assert.ok(
    LOADER_WARM_MAX_MS > LOADER_MIN_MS,
    `LOADER_WARM_MAX_MS (${LOADER_WARM_MAX_MS}) must exceed LOADER_MIN_MS (${LOADER_MIN_MS})`,
  );
});

test('the warm cap sits below the unconditional safety backstop', () => {
  // If the cap reached the backstop, the backstop would fire first and the cap
  // would be unreachable — the gate would have no bounded release of its own.
  assert.ok(
    LOADER_WARM_MAX_MS < SAFETY_BACKSTOP_MS,
    `LOADER_WARM_MAX_MS (${LOADER_WARM_MAX_MS}) must stay below the ${SAFETY_BACKSTOP_MS}ms safety backstop`,
  );
});

test('the warm cap leaves the first-visit reveal inside the P7 honesty budget', () => {
  // e2e/loader.spec.ts asserts a first-visit reveal under 2500ms. The cap is
  // measured from loader init, so it IS the worst-case reveal time on a machine
  // whose bakes outlast it — it must not exceed that budget.
  assert.ok(
    LOADER_WARM_MAX_MS <= 2500,
    `LOADER_WARM_MAX_MS (${LOADER_WARM_MAX_MS}) must not exceed the 2500ms first-visit reveal budget`,
  );
});

test('the loader floor is a sub-second beat', () => {
  // Guards the P7 "one legible beat" budget the floor was sized for.
  assert.ok(LOADER_MIN_MS > 0 && LOADER_MIN_MS <= 1000, `LOADER_MIN_MS (${LOADER_MIN_MS}) must be in (0, 1000]`);
});
