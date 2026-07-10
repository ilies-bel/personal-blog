// Derived-count text helpers (P6) — the pure half of contentStats. The
// getCounts() aggregate itself needs the `astro:content` virtual module (it is
// exercised end-to-end by e2e/content.spec.ts against the built site); the
// wording rules below are plain functions and pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { numberToWord, graveyardNote, projectsNote } from '../src/lib/contentFormat.ts';

test('numberToWord spells out one–twelve for prose quality', () => {
  assert.equal(numberToWord(0), 'zero');
  assert.equal(numberToWord(1), 'one');
  assert.equal(numberToWord(2), 'two');
  assert.equal(numberToWord(9), 'nine');
  assert.equal(numberToWord(12), 'twelve');
});

test('numberToWord falls back to digits beyond twelve (and for non-integers)', () => {
  assert.equal(numberToWord(13), '13');
  assert.equal(numberToWord(100), '100');
  assert.equal(numberToWord(2.5), '2.5');
  assert.equal(numberToWord(-1), '-1');
});

test('graveyard note: "both honest" is reserved for EXACTLY two specimens', () => {
  assert.equal(graveyardNote(2), '2 dead, both honest');
});

test('graveyard note: any other count switches to "all"/singular wording — no stale "both"', () => {
  assert.equal(graveyardNote(3), '3 dead, all honest');
  assert.equal(graveyardNote(5), '5 dead, all honest');
  assert.equal(graveyardNote(1), '1 dead, honest');
});

test('projects note', () => {
  assert.equal(projectsNote(2), '2 shipped');
  assert.equal(projectsNote(3), '3 shipped');
});
