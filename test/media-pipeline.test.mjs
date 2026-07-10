// MEDIA PIPELINE GUARD — unit tests for the pure logic functions exported by
// scripts/check-media.mjs.  Tests describe observable behaviour through the
// public interface only; they survive internal refactors as long as the
// semantics stay the same.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── validateEntry ───────────────────────────────────────────────────────────

test('validateEntry: rejects entry exceeding 500 KB without approval', async () => {
  const { validateEntry } = await import('../scripts/check-media.mjs');
  const result = validateEntry(
    { path: 'large.jpg', format: 'jpeg', width: 1920, height: 1080, sizeBytes: 600_000, contentHash: 'sha256:aaa' },
    {}
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('500')), 'error should mention the 500 KB limit');
});

test('validateEntry: accepts entry exceeding 500 KB that has an approval entry', async () => {
  const { validateEntry } = await import('../scripts/check-media.mjs');
  const result = validateEntry(
    { path: 'large.jpg', format: 'jpeg', width: 1920, height: 1080, sizeBytes: 600_000, contentHash: 'sha256:aaa' },
    { 'large.jpg': { reason: 'approved download asset' } }
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateEntry: rejects entry missing intrinsic width', async () => {
  const { validateEntry } = await import('../scripts/check-media.mjs');
  const result = validateEntry(
    { path: 'img.avif', format: 'avif', height: 600, sizeBytes: 30_000, contentHash: 'sha256:bbb' },
    {}
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /dimension/i.test(e)), 'error should mention dimensions');
});

test('validateEntry: rejects entry missing intrinsic height', async () => {
  const { validateEntry } = await import('../scripts/check-media.mjs');
  const result = validateEntry(
    { path: 'img.avif', format: 'avif', width: 800, sizeBytes: 30_000, contentHash: 'sha256:bbb' },
    {}
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /dimension/i.test(e)), 'error should mention dimensions');
});

test('validateEntry: accepts well-formed entry under 500 KB', async () => {
  const { validateEntry } = await import('../scripts/check-media.mjs');
  const result = validateEntry(
    { path: 'img.avif', format: 'avif', width: 800, height: 600, sizeBytes: 45_000, contentHash: 'sha256:ccc' },
    {}
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateEntry: accepts approved entry that also lacks dimensions (double override)', async () => {
  // An approval entry opts the asset out of the size check, but dimension check
  // is independent — a missing dimension is always an error regardless of approval.
  const { validateEntry } = await import('../scripts/check-media.mjs');
  const result = validateEntry(
    { path: 'mystery.png', format: 'png', sizeBytes: 100_000, contentHash: 'sha256:ddd' },
    { 'mystery.png': { reason: 'approved' } }
  );
  // Size is fine (100KB) but width/height are missing → still fails dimension check.
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /dimension/i.test(e)));
});

// ─── findDuplicates ──────────────────────────────────────────────────────────

test('findDuplicates: identifies entries sharing a content hash', async () => {
  const { findDuplicates } = await import('../scripts/check-media.mjs');
  const dupes = findDuplicates([
    { path: 'a.avif', contentHash: 'sha256:abc', sizeBytes: 1000 },
    { path: 'b.avif', contentHash: 'sha256:abc', sizeBytes: 1000 },
    { path: 'c.webp', contentHash: 'sha256:def', sizeBytes: 2000 },
  ]);
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0].hash, 'sha256:abc');
  assert.deepEqual([...dupes[0].paths].sort(), ['a.avif', 'b.avif']);
});

test('findDuplicates: returns empty array when all hashes are distinct', async () => {
  const { findDuplicates } = await import('../scripts/check-media.mjs');
  const dupes = findDuplicates([
    { path: 'a.avif', contentHash: 'sha256:aaa', sizeBytes: 1000 },
    { path: 'b.webp', contentHash: 'sha256:bbb', sizeBytes: 2000 },
  ]);
  assert.deepEqual(dupes, []);
});

test('findDuplicates: returns empty array for empty input', async () => {
  const { findDuplicates } = await import('../scripts/check-media.mjs');
  assert.deepEqual(findDuplicates([]), []);
});

test('findDuplicates: entries without contentHash are skipped', async () => {
  const { findDuplicates } = await import('../scripts/check-media.mjs');
  const dupes = findDuplicates([
    { path: 'a.jpg', sizeBytes: 1000 },
    { path: 'b.jpg', sizeBytes: 1000 },
  ]);
  assert.deepEqual(dupes, []);
});

// ─── findUnused ──────────────────────────────────────────────────────────────

test('findUnused: returns paths not present in the reference set', async () => {
  const { findUnused } = await import('../scripts/check-media.mjs');
  const unused = findUnused(
    ['graveyard/old.png', 'og-default.png'],
    new Set(['/og-default.png'])
  );
  assert.deepEqual(unused, ['graveyard/old.png']);
});

test('findUnused: returns empty array when every asset is referenced', async () => {
  const { findUnused } = await import('../scripts/check-media.mjs');
  const unused = findUnused(
    ['opt/img-480.avif', 'opt/img-768.avif'],
    new Set(['/opt/img-480.avif', '/opt/img-768.avif'])
  );
  assert.deepEqual(unused, []);
});

test('findUnused: normalises leading slashes when matching references', async () => {
  const { findUnused } = await import('../scripts/check-media.mjs');
  // distRasterPath has no leading slash; referencedPaths has none either.
  const unused = findUnused(
    ['favicon.png'],
    new Set(['favicon.png'])
  );
  assert.deepEqual(unused, []);
});

test('findUnused: normalises reference with leading slash against path without one', async () => {
  const { findUnused } = await import('../scripts/check-media.mjs');
  const unused = findUnused(
    ['glyphs/glyph-dot.svg'],
    new Set(['/glyphs/glyph-dot.svg'])
  );
  assert.deepEqual(unused, []);
});

test('findUnused: returns empty array for empty asset list', async () => {
  const { findUnused } = await import('../scripts/check-media.mjs');
  assert.deepEqual(findUnused([], new Set(['/og-default.png'])), []);
});
