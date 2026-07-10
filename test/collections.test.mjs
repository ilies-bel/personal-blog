// Collections integrity test — asserts that rendered HTML entry counts equal
// the number of JSON files in the corresponding content collections.
//
// This is the machine-enforceable side of CON-008: no visible count or status
// on the site may diverge from the collection source of truth.
//
// REQUIRES a prior `npm run build`. When dist/ is absent the tests are skipped
// rather than failed, so the standard `npm test` → `npm run build` → `npm test`
// workflow stays unblocked.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const distDir = resolve(root, 'dist');
const distExists = existsSync(distDir);

/** Count <article class="…CLASS…"> elements in HTML (regex, no DOM dep). */
const countArticles = (html, cssClass) => {
  const re = new RegExp(`<article[^>]+class="[^"]*\\b${cssClass}\\b[^"]*"`, 'g');
  return (html.match(re) ?? []).length;
};

/** Count JSON files in a src/content sub-directory. */
const countCollectionEntries = (subDir) => {
  const abs = resolve(root, 'src', 'content', subDir);
  if (!existsSync(abs)) return 0;
  return readdirSync(abs).filter((f) => f.endsWith('.json')).length;
};

if (distExists) {
  describe('collection entry counts match rendered HTML', () => {
    test('projects page renders one article per projects collection entry', () => {
      const html = readFileSync(resolve(distDir, 'projects', 'index.html'), 'utf8');
      const rendered = countArticles(html, 'projects-entry');
      const inCollection = countCollectionEntries('projects');
      assert.ok(inCollection > 0, 'projects collection must have at least one entry');
      assert.strictEqual(
        rendered,
        inCollection,
        `projects page renders ${rendered} entries but collection has ${inCollection}`,
      );
    });

    test('graveyard page renders one article per graveyard collection entry', () => {
      const html = readFileSync(resolve(distDir, 'graveyard', 'index.html'), 'utf8');
      const rendered = countArticles(html, 'graveyard-entry');
      const inCollection = countCollectionEntries('graveyard');
      assert.ok(inCollection > 0, 'graveyard collection must have at least one entry');
      assert.strictEqual(
        rendered,
        inCollection,
        `graveyard page renders ${rendered} entries but collection has ${inCollection}`,
      );
    });
  });
} else {
  // Emit a diagnostic so CI logs explain the skip rather than silently passing.
  describe('collection entry counts match rendered HTML', () => {
    test('projects page renders one article per projects collection entry', { skip: 'dist/ not found — run npm run build first' }, () => {});
    test('graveyard page renders one article per graveyard collection entry', { skip: 'dist/ not found — run npm run build first' }, () => {});
  });
}
