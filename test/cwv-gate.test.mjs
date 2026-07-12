// cwv-gate unit tests — median computation and threshold checking (PERF-008).
//
// Pins the two pure functions exported from scripts/cwv-gate.mjs:
//   median(arr)                             — numeric median
//   checkThreshold(value, { target, hard }) — 'ok' | 'warn' | 'fail' | 'n/a'
//
// These are the core arithmetic that drives the gate's pass/fail verdict.
// Tests use the PERF-008 threshold values so the spec doubles as documentation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, checkThreshold } from '../scripts/cwv-gate.mjs';

// ---------------------------------------------------------------------------
// median()
// ---------------------------------------------------------------------------

test('median: single element', () => {
  assert.equal(median([42]), 42);
});

test('median: odd-length array returns middle value', () => {
  assert.equal(median([3, 1, 2]), 2);  // sorted: [1, 2, 3] → mid = 2
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([10, 20, 30, 40, 50]), 30);
});

test('median: even-length array interpolates the two middle values', () => {
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([1800, 2000, 2100, 2400]), 2050);
});

test('median: already-sorted input', () => {
  assert.equal(median([100, 150, 200]), 150);
});

test('median: returns null for empty array', () => {
  assert.equal(median([]), null);
});

test('median: does not mutate the input array', () => {
  const arr = [3, 1, 2];
  median(arr);
  assert.deepEqual(arr, [3, 1, 2]);
});

// ---------------------------------------------------------------------------
// checkThreshold() — PERF-008 values
// ---------------------------------------------------------------------------

// LCP: target 2000ms, hard 2500ms
const LCP = { target: 2000, hard: 2500 };
// INP: target 150ms, hard 200ms
const INP = { target: 150, hard: 200 };
// CLS: target 0.02, hard 0.10
const CLS = { target: 0.02, hard: 0.10 };
// TBT: target 150ms, hard 200ms
const TBT = { target: 150, hard: 200 };

test('checkThreshold: values within target return ok', () => {
  assert.equal(checkThreshold(1800, LCP), 'ok');
  assert.equal(checkThreshold(100, INP), 'ok');
  assert.equal(checkThreshold(0.01, CLS), 'ok');
  assert.equal(checkThreshold(100, TBT), 'ok');
});

test('checkThreshold: values between target and hard limit return warn', () => {
  assert.equal(checkThreshold(2100, LCP), 'warn');  // > 2000, ≤ 2500
  assert.equal(checkThreshold(160, INP),  'warn');  // > 150, ≤ 200
  assert.equal(checkThreshold(0.05, CLS), 'warn');  // > 0.02, ≤ 0.10
  assert.equal(checkThreshold(160, TBT),  'warn');  // > 150, ≤ 200
});

test('checkThreshold: values exceeding hard limit return fail', () => {
  assert.equal(checkThreshold(2600, LCP), 'fail');
  assert.equal(checkThreshold(210, INP),  'fail');
  assert.equal(checkThreshold(0.11, CLS), 'fail');
  assert.equal(checkThreshold(210, TBT),  'fail');
});

test('checkThreshold: value exactly at target boundary returns ok (not warn)', () => {
  assert.equal(checkThreshold(2000, LCP), 'ok');   // at target, not strictly over
  assert.equal(checkThreshold(150, INP),  'ok');
  assert.equal(checkThreshold(0.02, CLS), 'ok');
  assert.equal(checkThreshold(150, TBT),  'ok');
});

test('checkThreshold: value exactly at hard limit returns warn (not fail) — above target but not over the cap', () => {
  // At exactly the hard limit the value is NOT failing (the check is strictly >),
  // but it IS above the record target, so the correct verdict is 'warn'.
  // This exercises the boundary: the hard limit is inclusive (≤ hard is permitted).
  assert.equal(checkThreshold(2500, LCP), 'warn');  // 2500 ≤ 2500 (ok) but > 2000 (warn)
  assert.equal(checkThreshold(200, INP),  'warn');  // 200 ≤ 200 (ok) but > 150 (warn)
  assert.equal(checkThreshold(0.10, CLS), 'warn');  // 0.10 ≤ 0.10 (ok) but > 0.02 (warn)
  assert.equal(checkThreshold(200, TBT),  'warn');  // 200 ≤ 200 (ok) but > 150 (warn)
});

test('checkThreshold: null value returns n/a', () => {
  assert.equal(checkThreshold(null, LCP), 'n/a');
  assert.equal(checkThreshold(undefined, INP), 'n/a');
});

test('checkThreshold: zero is valid (static page with no measured interaction)', () => {
  assert.equal(checkThreshold(0, INP), 'ok');
  assert.equal(checkThreshold(0, CLS), 'ok');
});
