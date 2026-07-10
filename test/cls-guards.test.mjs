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
  //
  // EXP-036: .prose now uses var(--rhy-measure, 680px) so the per-route rhythm token drives
  // the column on prose routes. The px fallback is still a concrete anchor: the body class
  // is set during SSR (no async resolution) and CSS custom properties resolve synchronously,
  // so there is no first-paint layout shift. The regex accepts either a bare pixel value or
  // a var() whose fallback is a pixel value.
  const css = styles('prose.css');
  const body = ruleBody(css, '.prose');
  assert.ok(body, '.prose rule must exist');
  assert.match(
    body,
    /max-width:\s*(?:\d+px|var\(--rhy-measure,\s*\d+px\))/,
    '.prose must declare an explicit max-width (pixel value or var() with px fallback — concrete anchor prevents canvas-driven layout shift)',
  );
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

// ---------------------------------------------------------------------------
// Intrinsic-sizing guards (PERF-005)
//
// Every raster <img> that participates in page flow must carry width/height
// attributes so the browser can compute aspect-ratio before the file loads.
// Without them the browser reserves zero height, the image downloads, then
// the layout reflowed — that IS the layout shift. These tests read the source
// files directly so they catch a regression the moment the attribute is
// removed, before a build or E2E run is needed.
// ---------------------------------------------------------------------------

const src = (file) => readFileSync(resolve(here, '..', file), 'utf8');

test('CLS guard: Fleet project screenshot carries intrinsic width and height (projects data + projects.astro)', () => {
  // projects.astro is data-driven (projects.map over the `projects` collection),
  // so the fleet screenshot's intrinsic dimensions live in its JSON entry and the
  // <img> binds them from data. Same invariant as before the data-model refactor —
  // absence means the browser reserves no space and the image load shifts layout —
  // asserted at both ends of the binding so neither half can silently drop.
  const fleet = JSON.parse(src('src/content/projects/fleet.json'));
  assert.equal(fleet.figure.width, 1440, 'fleet.json figure.width must be 1440');
  assert.equal(fleet.figure.height, 900, 'fleet.json figure.height must be 900');

  const source = src('src/pages/projects.astro');
  // The screenshot <img> must forward the intrinsic dims from the collection data.
  assert.match(
    source,
    /width=\{project\.data\.figure\.width\}/,
    'projects.astro screenshot <img> must bind width={project.data.figure.width}',
  );
  assert.match(
    source,
    /height=\{project\.data\.figure\.height\}/,
    'projects.astro screenshot <img> must bind height={project.data.figure.height}',
  );
});

test('CLS guard: Fleet project image uses responsive <picture> with AVIF and WebP sources (projects.astro)', () => {
  // The <picture> wrapper provides modern format variants so the browser picks
  // the smallest format it supports. Pinning these prevents a future edit from
  // dropping the pipeline-generated sources (PERF-005/PERF-006).
  // projects.astro is data-driven: the srcset paths are built from a per-project
  // `figureBase` derived from figure.src, so we pin (a) the AVIF/WebP <source>
  // types + sizes, (b) the opt/<figureBase> path construction in the template,
  // and (c) fleet's data so the effective outputs resolve to opt/projects/fleet-<w>.
  const source = src('src/pages/projects.astro');
  assert.match(source, /image\/avif/, 'fleet <picture> must include AVIF source type');
  assert.match(source, /image\/webp/, 'fleet <picture> must include WebP source type');
  assert.match(source, /figureBase\s*=\s*project\.data\.figure\.src/, 'screenshot opt-path base must derive from figure.src');
  assert.match(source, /opt\/\$\{figureBase\}-\$\{w\}\.avif/, 'AVIF srcset must build opt/<figureBase>-<w>.avif paths');
  assert.match(source, /opt\/\$\{figureBase\}-\$\{w\}\.webp/, 'WebP srcset must build opt/<figureBase>-<w>.webp paths');
  assert.match(source, /sizes=/, 'fleet <picture> must include a sizes attribute');

  // Data side: fleet's source + responsive widths mean the effective outputs are
  // opt/projects/fleet-{480,768,1440}.{avif,webp} plus the opt/projects/fleet-1440.jpg fallback.
  const fleet = JSON.parse(src('src/content/projects/fleet.json'));
  assert.equal(fleet.figure.src, 'projects/fleet.png', 'fleet figure.src drives the opt/projects/fleet base');
  assert.deepEqual(fleet.figure.widths, [480, 768, 1440], 'fleet figure.widths must mirror optimize-media.mjs');
});

test('CLS guard: Luminet black-hole image carries intrinsic width and height (MDX post)', () => {
  const source = src('src/content/posts/thanks-for-scrolling-to-the-bottom.mdx');
  // The JPEG baseline dimensions are 700 × 346 — confirm both attributes present.
  assert.match(
    source,
    /luminet[\s\S]{0,400}?width="700"/,
    'luminet-blackhole-1979 <img> must carry width="700"',
  );
  assert.match(
    source,
    /luminet[\s\S]{0,400}?height="346"/,
    'luminet-blackhole-1979 <img> must carry height="346"',
  );
});

test('CLS guard: Luminet black-hole image uses responsive <picture> with AVIF and WebP sources (MDX post)', () => {
  // Pipeline generates AVIF/WebP at 480 and 700 px widths; pinning the <picture>
  // wrapper ensures a future edit cannot strip the responsive sources (PERF-005/PERF-006).
  // The srcset is built dynamically (template literals), so we match the static
  // path prefix that will always be present in the source expression.
  const source = src('src/content/posts/thanks-for-scrolling-to-the-bottom.mdx');
  assert.match(source, /opt\/inspirations\/luminet-blackhole-1979-/, 'luminet <picture> must reference opt/inspirations/ outputs');
  assert.match(source, /\.avif/, 'luminet <picture> must include an AVIF source');
  assert.match(source, /\.webp/, 'luminet <picture> must include a WebP source');
  assert.match(source, /sizes=/, 'luminet <picture> must include a sizes attribute');
});

test('CLS guard: PosterSlideshow images carry intrinsic width and height (1920×1080)', () => {
  const source = src('src/hero/components/reduced-motion/PosterSlideshow.tsx');
  // Poster WebPs are 1920×1080 — intrinsic dims let the browser know the 16:9 ratio
  // before the file arrives. The CSS overrides these at runtime (object-fit:cover),
  // but the attributes prevent a zero-height reservation on the initial parse.
  assert.match(
    source,
    /width=\{1920\}/,
    'PosterSlideshow <img> must carry width={1920}',
  );
  assert.match(
    source,
    /height=\{1080\}/,
    'PosterSlideshow <img> must carry height={1080}',
  );
});

test('CLS guard: .bh-poster-slideshow is fixed/inset:0 — poster images never enter flow', () => {
  const css = styles('hero.css');
  const body = ruleBody(css, '.bh-poster-slideshow');
  assert.ok(body, '.bh-poster-slideshow rule must exist');
  assert.match(body, /position:\s*fixed/, '.bh-poster-slideshow must be position:fixed');
  assert.match(body, /inset:\s*0/, '.bh-poster-slideshow must use inset:0 to fill the viewport');
});

// ---------------------------------------------------------------------------
// Graveyard gallery intrinsic sizing (PERF-005)
//
// The graveyard specimen images are rendered via a data-driven <picture>
// element.  The data records both width and height for each specimen so the
// browser can compute the aspect-ratio before the optimised file arrives.
// Pinning the data-layer values here means a width/height edit in the data
// object immediately turns this test red — the alarm we want before CLS
// silently regresses.
// ---------------------------------------------------------------------------

test('CLS guard: graveyard KeywordLens specimen carries intrinsic width and height (graveyard data + graveyard.astro)', () => {
  // graveyard.astro is data-driven (specimens.map over the `graveyard` collection),
  // so each specimen's intrinsic dimensions live in its JSON entry and the <img>
  // binds them from data. KeywordLens fallback JPEG is 768 × 2175.
  const keywordlens = JSON.parse(src('src/content/graveyard/keywordlens.json'));
  assert.equal(keywordlens.image.width, 768, 'keywordlens.json image.width must be 768');
  assert.equal(keywordlens.image.height, 2175, 'keywordlens.json image.height must be 2175');

  const source = src('src/pages/graveyard.astro');
  assert.match(source, /width=\{s\.data\.image\.width\}/, 'graveyard <img> must bind width={s.data.image.width}');
  assert.match(source, /height=\{s\.data\.image\.height\}/, 'graveyard <img> must bind height={s.data.image.height}');
});

test('CLS guard: graveyard HeyDaniel specimen carries intrinsic width and height (graveyard data)', () => {
  // Data-driven, as above. HeyDaniel fallback JPEG is 768 × 1239.
  const heydaniel = JSON.parse(src('src/content/graveyard/heydaniel.json'));
  assert.equal(heydaniel.image.width, 768, 'heydaniel.json image.width must be 768');
  assert.equal(heydaniel.image.height, 1239, 'heydaniel.json image.height must be 1239');
});

test('CLS guard: graveyard gallery uses responsive <picture> with AVIF and WebP sources (graveyard.astro)', () => {
  // The graveyard renders each specimen with <picture> AVIF → WebP → JPEG.
  // Pinning the image/avif and image/webp types prevents format regression
  // (PERF-005/PERF-006).
  const source = src('src/pages/graveyard.astro');
  assert.match(source, /image\/avif/, 'graveyard <picture> must include AVIF source');
  assert.match(source, /image\/webp/, 'graveyard <picture> must include WebP source');
  assert.match(source, /sizes=/, 'graveyard <picture> must include a sizes attribute');
});

// ---------------------------------------------------------------------------
// Voyager Golden Record intrinsic sizing (PERF-005)
// ---------------------------------------------------------------------------

test('CLS guard: Voyager Golden Record image carries intrinsic width and height (MDX post)', () => {
  const source = src('src/content/posts/thanks-for-scrolling-to-the-bottom.mdx');
  // The Voyager figure is delivered at 680 × 680 — the responsive prose-column
  // build (PERF-004): the prose measure caps at 680px so the largest delivered
  // file (and the <img> fallback, voyager-golden-record-680.jpg) is 680². The
  // intrinsic square keeps the aspect-ratio reserved before the file loads.
  assert.match(
    source,
    /voyager[\s\S]{0,400}?width="680"/,
    'Voyager <img> must carry width="680"',
  );
  assert.match(
    source,
    /voyager[\s\S]{0,400}?height="680"/,
    'Voyager <img> must carry height="680"',
  );
});
