// CLS GUARDS — pin the CSS invariants that keep article entry from shifting visible
// text (the Awwwards perf bar wants CLS < 0.02). The risk on article load comes from
// two surfaces: the backdrop canvas host (ArticleScene) and the inline figure plate
// (SceneFigure). Either, if allowed into normal flow before its content lands, would
// push the reading column.
//
// We assert OBSERVABLE invariants on the shipped CSS, not implementation details — the
// host wrapper sits in fixed positioning, the canvas layer ditto, and inline figures
// reserve their height up front via aspect-ratio. A refactor that keeps these
// invariants is free to move the rules; a refactor that breaks them flips this test
// red, which is exactly the alarm we want.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const styles = (file) => readFileSync(resolve(here, '..', 'src', 'styles', file), 'utf8');

// Pull a single rule body by selector — a coarse extractor (good enough for the rules
// we care about: each lives in its own block with no nested at-rules in between).
const ruleBody = (css, selector) => {
  // Escape regex metachars in the selector.
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(^|[^-\\w])${esc}\\s*{([^}]*)}`, 'm'));
  return match ? match[2] : null;
};

test('CLS guard: .bh-root--backdrop is fixed/inset:0 — the host wrapper never enters flow', () => {
  const css = styles('hero.css');
  const body = ruleBody(css, '.bh-root--backdrop');
  assert.ok(body, '.bh-root--backdrop rule must exist');
  assert.match(body, /position:\s*fixed/, 'host wrapper must be position:fixed');
  assert.match(body, /inset:\s*0/, 'host wrapper must use inset:0 to fill the viewport');
});

test('CLS guard: .bh-stage is fixed/inset:0 — the canvas layer never enters flow', () => {
  const css = styles('hero.css');
  const body = ruleBody(css, '.bh-stage');
  assert.ok(body, '.bh-stage rule must exist');
  assert.match(body, /position:\s*fixed/, 'canvas layer must be position:fixed');
  assert.match(body, /inset:\s*0/, 'canvas layer must use inset:0 to fill the viewport');
});

test('CLS guard: .scene-figure-stage reserves height via aspect-ratio before the canvas mounts', () => {
  const css = styles('article.css');
  const body = ruleBody(css, '.scene-figure-stage');
  assert.ok(body, '.scene-figure-stage rule must exist');
  assert.match(body, /width:\s*100%/, 'figure stage must claim full content width');
  assert.match(body, /aspect-ratio:\s*\d+\s*\/\s*\d+/,
    'figure stage must reserve height via aspect-ratio so the inline canvas mount cannot push prose');
});

test('CLS guard: the reading column width is set on .prose, not on the canvas subtree', () => {
  // The reading measure is owned by .prose in prose.css (max-width + margin-inline:auto).
  // If a future change ever ties the column width to a backdrop class instead, the canvas
  // mount could become a CLS source again — pin the SSR-CSS ownership here.
  const css = styles('prose.css');
  const body = ruleBody(css, '.prose');
  assert.ok(body, '.prose rule must exist');
  assert.match(body, /max-width:\s*\d+px/, '.prose must declare an explicit max-width');
  assert.match(body, /margin-inline:\s*auto/, '.prose must center via margin-inline:auto');
});

test('CLS guard: webfonts ship with font-display:swap so the fallback paints immediately', () => {
  // font-display:swap keeps the first paint on the fallback metrics and prevents a long
  // FOIT window; combined with the fixed backdrop host above, the worst case on article
  // entry is a single text-only restyle pass, not a backdrop-driven shift.
  const css = styles('fonts.css');
  const swaps = css.match(/font-display:\s*swap/g) ?? [];
  assert.ok(swaps.length >= 3, `expected font-display:swap on every @font-face (>=3), got ${swaps.length}`);
});
