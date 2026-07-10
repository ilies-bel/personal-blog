// route-typography.test.mjs — EXP-036 acceptance tests
//
// Verifies that per-route typography rhythm tokens are correctly declared in
// src/styles/route-typography.css and comply with the two hard rules:
//
//   1. --rhy-headline-tracking >= -0.04em on every route.
//      Rationale: display tracking tighter than -0.04em creates illegible
//      glyph collisions on the large sizes used at hero/display scale; the
//      constraint is an optical-safety floor, not a stylistic preference.
//
//   2. --rhy-measure is within 65–75ch on prose routes.
//      Rationale: measure below 65ch fragments sentences; above 75ch the
//      eye's return sweep causes reading fatigue. Both bounds are literature-
//      backed. prose.css consumes var(--rhy-measure) on .prose so a missing
//      or out-of-range declaration silently degrades to the 680px fallback.
//
// These tests check observable token values — the CSS file is the public
// interface. Missing declarations and wrong values are the regression modes.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const css = readFileSync(resolve(root, 'src/styles/route-typography.css'), 'utf-8');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract --rhy-* token values declared directly in a given CSS scope block.
 *  Matches the first `scope { ... }` block (no descendant selectors inside). */
function tokensForScope(scope) {
  // Escape CSS selector special chars for use in a RegExp.
  const escaped = scope.replace(/[.[\]]/g, c => '\\' + c);
  // Only match the direct scope block (the selector immediately before `{`).
  const pattern = new RegExp(String.raw`${escaped}\s*\{([^}]*)\}`, 'g');
  const tokens = new Map();
  let match;
  while ((match = pattern.exec(css)) !== null) {
    const block = match[1];
    for (const m of block.matchAll(/--(rhy-[\w-]+)\s*:\s*([^;]+);/g)) {
      tokens.set(`--${m[1]}`, m[2].trim());
    }
  }
  return tokens;
}

/** Parse a CSS em value (e.g. "-0.02em" or "0em") → number.
 *  Also accepts bare "0". Returns null if the value is not a parseable em. */
function parseEm(value) {
  if (value === '0') return 0;
  const m = value.match(/^(-?[\d.]+)em$/);
  return m ? parseFloat(m[1]) : null;
}

/** Parse a CSS ch value (e.g. "68ch") → number.
 *  Returns null if the value is not a parseable ch. */
function parseCh(value) {
  const m = value.match(/^([\d.]+)ch$/);
  return m ? parseFloat(m[1]) : null;
}

// ── Route registry ────────────────────────────────────────────────────────────

const ROUTES = [
  { key: 'projects',  scope: 'body.projects-page',    name: 'Projects / Sustained Orbit',  prose: false },
  { key: 'writing',   scope: 'body.writing-page',     name: 'Writing / Dispersed Matter',  prose: false },
  { key: 'articles',  scope: 'body.article-page',     name: 'Articles / Prose reading',    prose: true  },
  { key: 'graveyard', scope: 'body.graveyard-page',   name: 'Graveyard / Thermal Decay',   prose: false },
  { key: 'btb',       scope: 'body.behind-the-build', name: 'Behind the Build / Strata',   prose: true  },
  { key: 'about',     scope: '.about-page',           name: 'About / Human Scale',         prose: false },
  { key: 'contact',   scope: 'body.contact-page',     name: 'Contact / Forthcoming',       prose: false },
];

const REQUIRED_TOKENS = [
  '--rhy-headline-size',
  '--rhy-headline-leading',
  '--rhy-headline-tracking',
  '--rhy-measure',
  '--rhy-body-leading',
  '--rhy-density',
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('route typography rhythms (EXP-036)', () => {

  // ── Token completeness ─────────────────────────────────────────────────────
  // Every route must declare the full --rhy-* vocabulary so downstream rules
  // (prose.css, future motion verbs) can rely on the token being present.
  describe('required tokens declared per route', () => {
    for (const { scope, name } of ROUTES) {
      describe(name, () => {
        const tokens = tokensForScope(scope);
        for (const token of REQUIRED_TOKENS) {
          test(`declares ${token}`, () => {
            assert.ok(
              tokens.has(token),
              `${scope} must declare ${token} — a missing rhythm token silently degrades to the global fallback`,
            );
          });
        }
      });
    }
  });

  // ── Hard rule 1: display tracking never tighter than -0.04em ──────────────
  // --rhy-headline-tracking must be a concrete em value so this test can
  // compare it numerically. A var() reference to --tracking-* is not accepted.
  describe('display tracking >= -0.04em (hard rule)', () => {
    for (const { scope, name } of ROUTES) {
      test(`${name}: --rhy-headline-tracking >= -0.04em`, () => {
        const tokens = tokensForScope(scope);
        const val = tokens.get('--rhy-headline-tracking');
        assert.ok(val != null, `${scope} must declare --rhy-headline-tracking`);

        const parsed = parseEm(val);
        assert.ok(
          parsed != null,
          `${scope} --rhy-headline-tracking "${val}" must be a concrete em value (e.g. "-0.02em" or "0em"), not a var() reference`,
        );
        assert.ok(
          parsed >= -0.04,
          `${scope} --rhy-headline-tracking ${parsed}em violates the hard rule: display tracking must be >= -0.04em`,
        );
      });
    }
  });

  // ── Hard rule 2: prose measure within 65–75ch ──────────────────────────────
  // Only prose routes (article-page, behind-the-build) are constrained.
  // --rhy-measure must be expressed in ch so it scales with the typeface and
  // weight rather than being a fixed pixel value.
  describe('prose measure 65–75ch (hard rule)', () => {
    const proseRoutes = ROUTES.filter(r => r.prose);
    for (const { scope, name } of proseRoutes) {
      test(`${name}: --rhy-measure is within 65–75ch`, () => {
        const tokens = tokensForScope(scope);
        const val = tokens.get('--rhy-measure');
        assert.ok(val != null, `${scope} must declare --rhy-measure`);

        const ch = parseCh(val);
        assert.ok(
          ch != null,
          `${scope} --rhy-measure "${val}" must be a ch value (e.g. "68ch") — prose measure must be relative to the typeface`,
        );
        assert.ok(
          ch >= 65,
          `${scope} --rhy-measure ${ch}ch is below the 65ch floor (too narrow: sentence fragments)`,
        );
        assert.ok(
          ch <= 75,
          `${scope} --rhy-measure ${ch}ch exceeds the 75ch ceiling (too wide: fatiguing return sweep)`,
        );
      });
    }
  });

  // ── Tracking distinctness across routes ───────────────────────────────────
  // Not every route should have the same tracking value — that would mean the
  // token carries no route-specific signal. At least two distinct concrete
  // values must appear across all route declarations.
  describe('tracking values are not all identical', () => {
    test('at least two distinct --rhy-headline-tracking values exist', () => {
      const values = new Set();
      for (const { scope } of ROUTES) {
        const tokens = tokensForScope(scope);
        const val = tokens.get('--rhy-headline-tracking');
        if (val != null) values.add(val);
      }
      assert.ok(
        values.size >= 2,
        `All routes share the same --rhy-headline-tracking value — the token would carry no route identity`,
      );
    });
  });
});
