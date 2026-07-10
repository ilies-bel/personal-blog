// Bundle budget test — PERF-007 + PERF-013
//
// Verifies that the production build meets:
//   PERF-007: JS-size budgets (hero graph, pre-hero, reading routes)
//   PERF-013: CSS, font, and HTML delivery budgets
//
// Both are defined in docs/roadmaps/soty-readiness-backlog.md.
//
// REQUIRES a prior `npm run build`. When dist/_astro/ is absent (e.g. first
// `npm test` in a fresh CI checkout before build), all tests are skipped.
//
// The canonical way to run this test in isolation:
//   npm run build && node --test test/bundle-budget.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const DIST = resolve(root, 'dist');
const ASTRO_DIR = join(DIST, '_astro');

const distExists = existsSync(ASTRO_DIR);

// Budget thresholds (bytes, gzip) — must match scripts/bundle-budget.mjs
const BUDGET = {
  heroHard:       240 * 1024,
  heroTarget:     210 * 1024,
  preHeroHard:     85 * 1024,
  preHeroTarget:   65 * 1024,
};

// ---------------------------------------------------------------------------
// Graph helpers (mirrors scripts/bundle-budget.mjs)
// ---------------------------------------------------------------------------

function buildGraph() {
  const graph = new Map();
  const files = readdirSync(ASTRO_DIR).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const raw = readFileSync(join(ASTRO_DIR, file));
    const gz = gzipSync(raw).length;
    const code = raw.toString('utf8');
    const staticImports = [...code.matchAll(/from\s*["'](\.\/[^"']+)["']/g)]
      .map((m) => m[1].replace('./', ''));
    const dynamicImports = [...code.matchAll(/import\(\s*["'](\.\/[^"']+)["'][^)]*\)/g)]
      .map((m) => m[1].replace('./', ''));
    graph.set(file, { gz, static: staticImports, dynamic: dynamicImports });
  }
  return graph;
}

function reachable(graph, seeds, mode) {
  const visited = new Set();
  const queue = [...seeds];
  while (queue.length) {
    const f = queue.shift();
    if (visited.has(f)) continue;
    visited.add(f);
    const info = graph.get(f);
    if (!info) continue;
    for (const dep of info.static) queue.push(dep);
    if (mode === 'both') {
      for (const dep of info.dynamic) queue.push(dep);
    }
  }
  return visited;
}

function totalGz(graph, chunks) {
  let n = 0;
  for (const f of chunks) {
    const info = graph.get(f);
    if (info) n += info.gz;
  }
  return n;
}

function parseHtml(path) {
  const html = readFileSync(path, 'utf8');
  const scripts = [...html.matchAll(/<script[^>]+src=["']\/_astro\/([^"']+)["']/g)].map((m) => m[1]);
  const componentUrls = [...html.matchAll(/component-url=["']\/_astro\/([^"']+)["']/g)].map((m) => m[1]);
  return { scripts, componentUrls };
}

const THREE_MARKERS = ['WebGLRenderer', 'BufferGeometry', 'WebGLRenderTarget'];
const ENGINE_CHUNK = /^three-(?:core|post)\./i;

function hasThreeJs(graph, file) {
  if (ENGINE_CHUNK.test(file)) return false;
  const path = join(ASTRO_DIR, file);
  if (!existsSync(path)) return false;
  const code = readFileSync(path, 'utf8');
  return THREE_MARKERS.some((m) => code.includes(m));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PERF-007 bundle budgets', { skip: !distExists && 'dist/_astro not found — run npm run build first' }, () => {

  let graph, preHeroGz, heroGraphGz, readingRouteThreeJs, duplicateEngineChunks;

  // Set up once — build the graph and compute all metrics.
  test('can build chunk graph from dist', () => {
    graph = buildGraph();
    assert.ok(graph.size > 0, 'expected at least one JS chunk in dist/_astro');
  });

  test('pre-hero (sync scripts + static deps) is within hard limit', () => {
    const heroIndex = join(DIST, 'index.html');
    assert.ok(existsSync(heroIndex), 'hero page dist/index.html must exist');
    const { scripts } = parseHtml(heroIndex);
    assert.ok(scripts.length > 0, 'hero page must have at least one <script> tag');
    const chunks = reachable(graph, scripts, 'static');
    preHeroGz = totalGz(graph, chunks);
    assert.ok(
      preHeroGz <= BUDGET.preHeroHard,
      `pre-hero ${(preHeroGz / 1024).toFixed(1)} KiB gz exceeds hard limit of ${BUDGET.preHeroHard / 1024} KiB gz`,
    );
  });

  test('hero graph (BlackHole island chunk graph) is within hard limit', () => {
    const heroIndex = join(DIST, 'index.html');
    const { componentUrls } = parseHtml(heroIndex);
    assert.ok(componentUrls.length > 0, 'hero page must have at least one island component-url');
    const chunks = reachable(graph, componentUrls, 'both');
    heroGraphGz = totalGz(graph, chunks);
    assert.ok(
      heroGraphGz <= BUDGET.heroHard,
      `hero graph ${(heroGraphGz / 1024).toFixed(1)} KiB gz exceeds hard limit of ${BUDGET.heroHard / 1024} KiB gz`,
    );
  });

  test('hero graph is within target (non-blocking warning)', { todo: heroGraphGz > BUDGET.heroTarget ? `${(heroGraphGz / 1024).toFixed(1)} KiB gz exceeds ${BUDGET.heroTarget / 1024} KiB target` : false }, () => {
    if (!heroGraphGz) return; // computed in previous test
    assert.ok(
      heroGraphGz <= BUDGET.heroTarget,
      `hero graph ${(heroGraphGz / 1024).toFixed(1)} KiB gz exceeds target of ${BUDGET.heroTarget / 1024} KiB gz`,
    );
  });

  test('reading routes ship zero Three.js bytes', () => {
    const postHtmlFiles = [];
    function walk(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.html') && full.includes('/posts/')) postHtmlFiles.push(full);
      }
    }
    walk(DIST);
    assert.ok(postHtmlFiles.length > 0, 'expected at least one post HTML file in dist/posts/');

    for (const htmlPath of postHtmlFiles) {
      const { scripts, componentUrls } = parseHtml(htmlPath);
      const chunks = reachable(graph, [...scripts, ...componentUrls], 'both');
      const threeJsChunks = [...chunks].filter((f) => hasThreeJs(graph, f));
      assert.deepEqual(
        threeJsChunks,
        [],
        `${htmlPath.replace(DIST + '/', '')} must not load Three.js chunks, but found: ${threeJsChunks.join(', ')}`,
      );
    }
  });

  test('no duplicate engine copies (Three.js must be in three-core/three-post only)', () => {
    const allFiles = readdirSync(ASTRO_DIR).filter((f) => f.endsWith('.js'));
    duplicateEngineChunks = allFiles.filter((f) => !ENGINE_CHUNK.test(f) && hasThreeJs(graph, f));
    assert.deepEqual(
      duplicateEngineChunks,
      [],
      `Three.js code found outside engine chunks: ${duplicateEngineChunks.join(', ')}`,
    );
  });

});

// ---------------------------------------------------------------------------
// PERF-013 — CSS, font, and HTML delivery budgets
// ---------------------------------------------------------------------------

/** PERF-013 budgets — must match scripts/bundle-budget.mjs */
const BUDGET_13 = {
  cssHard:     50 * 1024,
  cssTarget:   35 * 1024,
  fontHard:   180 * 1024,
  fontTarget: 120 * 1024,
  htmlHard:   100 * 1024,
  htmlTarget:  60 * 1024,
};

function extractInlineCss(path) {
  const html = readFileSync(path, 'utf8');
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1])
    .join('');
}

function parsePreloadedFontFiles(path) {
  const html = readFileSync(path, 'utf8');
  return [...html.matchAll(/<link\s[^>]*>/g)]
    .filter((m) => /\brel=["']preload["']/.test(m[0]) && /\bas=["']font["']/.test(m[0]))
    .map((m) => {
      const href = m[0].match(/\bhref=["']\/_astro\/([^"']+)["']/);
      return href ? href[1] : null;
    })
    .filter(Boolean);
}

function walkHtml(dir) {
  /** @type {string[]} */
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walkHtml(full));
    else if (entry.name.endsWith('.html')) result.push(full);
  }
  return result;
}

describe('PERF-013 CSS, font, and HTML budgets', { skip: !distExists && 'dist not found — run npm run build first' }, () => {

  const allHtml = distExists ? walkHtml(DIST) : [];
  const heroHtml = join(DIST, 'index.html');

  test('inline CSS (per-route max) is within hard limit', () => {
    assert.ok(allHtml.length > 0, 'expected at least one HTML file in dist/');
    const worstGz = Math.max(...allHtml.map((p) => gzipSync(Buffer.from(extractInlineCss(p))).length));
    assert.ok(
      worstGz <= BUDGET_13.cssHard,
      `inline CSS (worst route) ${(worstGz / 1024).toFixed(1)} KiB gz exceeds hard limit of ${BUDGET_13.cssHard / 1024} KiB gz`,
    );
  });

  test('inline CSS (per-route max) is within target', () => {
    const worstGz = Math.max(...allHtml.map((p) => gzipSync(Buffer.from(extractInlineCss(p))).length));
    assert.ok(
      worstGz <= BUDGET_13.cssTarget,
      `inline CSS (worst route) ${(worstGz / 1024).toFixed(1)} KiB gz exceeds target of ${BUDGET_13.cssTarget / 1024} KiB gz`,
    );
  });

  test('no @font-face rule uses font-display:block (FOIT guard)', () => {
    // font-display:block causes an invisible-text period (FOIT) up to 3 s.
    // swap is the correct value: text is immediately visible in the fallback.
    assert.ok(existsSync(heroHtml), 'hero page dist/index.html must exist');
    const css = extractInlineCss(heroHtml);
    const hasFontDisplayBlock = /font-display\s*:\s*block\b/i.test(css);
    assert.ok(
      !hasFontDisplayBlock,
      'found font-display:block in CSS — causes invisible text (FOIT); use font-display:swap or optional',
    );
  });

  test('preloaded fonts are present and identified', () => {
    assert.ok(existsSync(heroHtml), 'hero page dist/index.html must exist');
    const preloaded = parsePreloadedFontFiles(heroHtml);
    assert.ok(preloaded.length > 0, 'expected at least one <link rel=preload as=font> on the hero page');
    // Verify the expected critical-path fonts are preloaded
    const preloadedStr = preloaded.join(' ');
    assert.ok(
      preloaded.some((f) => f.startsWith('space-grotesk-latin.')),
      `expected space-grotesk-latin to be preloaded; got: ${preloadedStr}`,
    );
    assert.ok(
      preloaded.some((f) => f.startsWith('ibm-plex-mono-latin.')),
      `expected ibm-plex-mono-latin to be preloaded; got: ${preloadedStr}`,
    );
  });

  test('initial font transfer (preloaded woff2) is within hard limit', () => {
    assert.ok(existsSync(heroHtml), 'hero page dist/index.html must exist');
    const preloaded = parsePreloadedFontFiles(heroHtml);
    const totalBytes = preloaded.reduce((sum, file) => {
      const p = join(ASTRO_DIR, file);
      return sum + (existsSync(p) ? readFileSync(p).length : 0);
    }, 0);
    assert.ok(
      totalBytes <= BUDGET_13.fontHard,
      `initial font transfer ${(totalBytes / 1024).toFixed(1)} KiB exceeds hard limit of ${BUDGET_13.fontHard / 1024} KiB (files: ${preloaded.join(', ')})`,
    );
  });

  test('initial font transfer (preloaded woff2) is within target', () => {
    const preloaded = parsePreloadedFontFiles(heroHtml);
    const totalBytes = preloaded.reduce((sum, file) => {
      const p = join(ASTRO_DIR, file);
      return sum + (existsSync(p) ? readFileSync(p).length : 0);
    }, 0);
    assert.ok(
      totalBytes <= BUDGET_13.fontTarget,
      `initial font transfer ${(totalBytes / 1024).toFixed(1)} KiB exceeds target of ${BUDGET_13.fontTarget / 1024} KiB (files: ${preloaded.join(', ')})`,
    );
  });

  test('all routes: HTML document is within hard limit (gzip)', () => {
    assert.ok(allHtml.length > 0, 'expected at least one HTML file in dist/');
    for (const htmlPath of allHtml) {
      const gz = gzipSync(readFileSync(htmlPath)).length;
      assert.ok(
        gz <= BUDGET_13.htmlHard,
        `${htmlPath.replace(DIST + '/', '')} HTML ${(gz / 1024).toFixed(1)} KiB gz exceeds hard limit of ${BUDGET_13.htmlHard / 1024} KiB gz`,
      );
    }
  });

  test('all routes: HTML document is within target (gzip)', () => {
    for (const htmlPath of allHtml) {
      const gz = gzipSync(readFileSync(htmlPath)).length;
      assert.ok(
        gz <= BUDGET_13.htmlTarget,
        `${htmlPath.replace(DIST + '/', '')} HTML ${(gz / 1024).toFixed(1)} KiB gz exceeds target of ${BUDGET_13.htmlTarget / 1024} KiB gz`,
      );
    }
  });

});
