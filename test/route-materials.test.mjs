// route-materials.test.mjs — EXP-035 acceptance tests
//
// Verifies that the named material token system is correctly declared for each
// route in src/styles/route-materials.css.  Tests check observable behaviour
// through the public interface (the CSS file's custom property declarations)
// not implementation details.
//
// What "observable behaviour" means here: a downstream task (EXP-036, EXP-037)
// or a route stylesheet can consume --mat-accent, --mat-surface, etc. only if
// those tokens are actually declared in the file.  Missing declarations would
// silently degrade to an inherited value or CSS initial, producing identical
// visual output across routes — the exact failure mode EXP-035 forbids.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const css = readFileSync(resolve(root, 'src/styles/route-materials.css'), 'utf-8');

/** Parse the CSS to extract all custom property declarations per scope. */
function tokensForScope(scope) {
  // Find the block for the given scope (e.g. "body.projects-page {") and
  // extract the property names declared inside it.  We stop at the next
  // closing brace that closes the block — this is a line-oriented parser
  // sufficient for the flat token-declaration structure of this file.
  const pattern = new RegExp(String.raw`${scope.replace(/\./g, '\\.')}\s*\{([^}]*)\}`, 'g');
  const props = new Set();
  let match;
  while ((match = pattern.exec(css)) !== null) {
    const block = match[1];
    for (const m of block.matchAll(/--mat-[\w-]+/g)) {
      props.add(m[0]);
    }
  }
  return props;
}

const REQUIRED_TOKENS = [
  '--mat-surface',
  '--mat-surface-alt',
  '--mat-edge',
  '--mat-accent',
  '--mat-accent-dim',
  '--mat-column',
  '--mat-gap',
];

const ROUTES = {
  projects: { scope: 'body.projects-page', name: 'Projects / Sustained Orbit' },
  writing:  { scope: 'body.writing-page',  name: 'Writing / Dispersed Matter' },
  graveyard:{ scope: 'body.graveyard-page',name: 'Graveyard / Thermal Decay' },
  btb:      { scope: 'body.behind-the-build', name: 'Behind the Build / Interior Layers' },
  about:    { scope: '.about-page',         name: 'About / Human Scale' },
};

describe('route material tokens (EXP-035)', () => {
  // ── Token presence ───────────────────────────────────────────────────────
  for (const [, { scope, name }] of Object.entries(ROUTES)) {
    describe(name, () => {
      const tokens = tokensForScope(scope);

      for (const token of REQUIRED_TOKENS) {
        test(`declares ${token}`, () => {
          assert.ok(
            tokens.has(token),
            `${scope} must declare ${token} — routes need named material roles, not inlined values`,
          );
        });
      }
    });
  }

  // ── Accent distinctness ──────────────────────────────────────────────────
  // Each route's --mat-accent must be a unique value.  Identical accents
  // would mean the accent token carries no route identity — a tint-only
  // system, which is exactly what EXP-035 forbids.
  describe('--mat-accent values are distinct across routes', () => {
    const accents = Object.entries(ROUTES).map(([key, { scope }]) => {
      // Extract the --mat-accent value from the scope's first declaration block.
      const pattern = new RegExp(
        String.raw`${scope.replace(/\./g, '\\.')}\s*\{([^}]*)--mat-accent\s*:\s*([^;]+);`,
      );
      const m = css.match(pattern);
      return { key, value: m ? m[2].trim() : null };
    });

    test('all --mat-accent values are non-null', () => {
      for (const { key, value } of accents) {
        assert.ok(value, `${key} --mat-accent must have a non-null value`);
      }
    });

    test('no two routes share the same --mat-accent value', () => {
      const seen = new Map();
      for (const { key, value } of accents) {
        if (value && seen.has(value)) {
          assert.fail(
            `${key} and ${seen.get(value)} share --mat-accent="${value}" — each route needs a distinct accent`,
          );
        }
        if (value) seen.set(value, key);
      }
    });
  });

  // ── Column distinctness ──────────────────────────────────────────────────
  // Graveyard must have a narrower --mat-column than Projects or Writing to
  // enforce the "contracted column" physical law.  This is the most visible
  // grayscale differentiator between the two dark-ground routes.
  describe('--mat-column encodes physical-law density', () => {
    function columnRem(scope) {
      const pattern = new RegExp(
        String.raw`${scope.replace(/\./g, '\\.')}\s*\{([^}]*)--mat-column\s*:\s*([\d.]+)rem`,
      );
      const m = css.match(pattern);
      return m ? parseFloat(m[2]) : null;
    }

    test('graveyard column is narrower than projects column', () => {
      const grav = columnRem('body.graveyard-page');
      const proj = columnRem('body.projects-page');
      assert.ok(grav != null, 'graveyard --mat-column must be declared');
      assert.ok(proj != null, 'projects --mat-column must be declared');
      assert.ok(
        grav < proj,
        `graveyard column (${grav}rem) must be narrower than projects column (${proj}rem)`,
      );
    });

    test('about column is narrower than writing column', () => {
      const about = columnRem('.about-page');
      const writing = columnRem('body.writing-page');
      assert.ok(about != null, 'about --mat-column must be declared');
      assert.ok(writing != null, 'writing --mat-column must be declared');
      assert.ok(
        about < writing,
        `about column (${about}rem) must be narrower than writing column (${writing}rem)`,
      );
    });
  });

  // ── Palette temperature separation ────────────────────────────────────────
  // The spec requires that warm routes (Projects amber, BtB orange-red) do NOT
  // share their hue range with cool routes (Writing teal, Graveyard indigo,
  // About blue).  We check this by confirming the accent hue anchor is in a
  // meaningfully different part of the OKLCH hue wheel for warm vs. cool.
  //
  // Warm hues: 40–100 (amber / gold / orange-red)
  // Cool hues: 195–260 (teal / indigo / blue)
  describe('--mat-accent temperature: warm vs. cool routes', () => {
    function accentHue(scope) {
      const pattern = new RegExp(
        String.raw`${scope.replace(/\./g, '\\.')}\s*\{[^}]*--mat-accent\s*:\s*oklch\([^)]+\s+([\d.]+)\)`,
      );
      const m = css.match(pattern);
      return m ? parseFloat(m[1]) : null;
    }

    const WARM_ROUTES = ['body.projects-page', 'body.behind-the-build'];
    const COOL_ROUTES = ['body.writing-page', 'body.graveyard-page', '.about-page'];

    for (const scope of WARM_ROUTES) {
      test(`${scope} accent hue is in warm range (40–100)`, () => {
        const hue = accentHue(scope);
        assert.ok(hue != null, `${scope} --mat-accent hue must be parseable`);
        assert.ok(
          hue >= 40 && hue <= 100,
          `${scope} accent hue ${hue} must be in warm range 40–100 (amber/gold/orange)`,
        );
      });
    }

    for (const scope of COOL_ROUTES) {
      test(`${scope} accent hue is in cool range (195–260)`, () => {
        const hue = accentHue(scope);
        assert.ok(hue != null, `${scope} --mat-accent hue must be parseable`);
        assert.ok(
          hue >= 195 && hue <= 260,
          `${scope} accent hue ${hue} must be in cool range 195–260 (teal/indigo/blue)`,
        );
      });
    }
  });
});
