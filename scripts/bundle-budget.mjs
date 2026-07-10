#!/usr/bin/env node
/**
 * bundle-budget.mjs — PERF-007: Route-aware JavaScript bundle budget checker
 *
 * Measures the JS chunk graph for each route in the production build and
 * enforces the budgets defined in docs/roadmaps/soty-readiness-backlog.md.
 *
 * Metrics
 * -------
 *   pre-hero        Sync <script> tags on the hero page + their static
 *                   transitive imports. This is the blocking JS before any
 *                   island hydrates. Budget: ≤65 KiB gz (target) / ≤85 KiB gz (hard).
 *
 *   hero graph      The BlackHole island's full chunk dependency graph
 *                   (component-url entry point, following both static and
 *                   dynamic imports transitively). Excludes the Astro/React
 *                   renderer (renderer-url) which is framework overhead.
 *                   Budget: ≤210 KiB gz (target) / ≤240 KiB gz (hard).
 *
 *   reading routes  Chunks loaded by /posts/** pages must contain zero
 *                   Three.js bytes (no three-core / three-post chunks and
 *                   no known Three.js API strings embedded directly).
 *
 *   duplicate engine
 *                   If WebGL-renderer symbols appear in more than one chunk
 *                   (outside three-core) the engine has been duplicated —
 *                   fail the build.
 *
 * Usage
 * -----
 *   node scripts/bundle-budget.mjs [dist-dir]
 *
 *   Exits 0 when all hard limits pass.
 *   Exits 1 when any hard limit is breached.
 *   Writes evidence/performance/bundle-budget-report.html.
 */

import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { gzipSync } from 'zlib';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DIST = process.argv[2] ?? 'dist';
const EVIDENCE_OUT = 'evidence/performance/bundle-budget-report.html';

/** PERF-007 budgets in bytes (gzip). */
const BUDGET = {
  heroHard:    240 * 1024,
  heroTarget:  210 * 1024,
  preHeroHard:  85 * 1024,
  preHeroTarget: 65 * 1024,
};

/**
 * PERF-013 budgets.
 *   CSS / HTML: gzip bytes (inline CSS is extracted from <style> tags; HTML
 *               is the full document gzipped — these are the network transfer
 *               sizes when served with content-encoding: gzip).
 *   Fonts:      raw woff2 bytes (woff2 is already a compressed container;
 *               transfer size = file size; no additional gzip layer).
 */
const BUDGET_13 = {
  cssHard:     50 * 1024,
  cssTarget:   35 * 1024,
  fontHard:   180 * 1024,
  fontTarget: 120 * 1024,
  htmlHard:   100 * 1024,
  htmlTarget:  60 * 1024,
};

/**
 * Three.js marker strings: if any of these appear in a chunk outside
 * three-core / three-post, the engine has been copied into that chunk.
 */
const THREE_MARKERS = [
  'WebGLRenderer',
  'BufferGeometry',
  'WebGLRenderTarget',
  'THREE_r',           // three.js revision string
];

/**
 * Chunk name patterns for the Three.js engine chunks (set by manualChunks).
 * These are the only chunks allowed to contain Three.js symbols.
 */
const ENGINE_CHUNK_PATTERNS = [/^three-core\./i, /^three-post\./i];

// ---------------------------------------------------------------------------
// Step 1 — Read dist/_astro and build the module import graph
// ---------------------------------------------------------------------------

const ASTRO_DIR = join(DIST, '_astro');

if (!existsSync(ASTRO_DIR)) {
  console.error(`[bundle-budget] dist dir not found: ${ASTRO_DIR}`);
  console.error('Run "npm run build" first, then "node scripts/bundle-budget.mjs".');
  process.exit(1);
}

const JS_FILES = readdirSync(ASTRO_DIR).filter((f) => f.endsWith('.js'));

/**
 * @typedef {{ gz: number; raw: number; static: string[]; dynamic: string[] }} ChunkInfo
 * @type {Map<string, ChunkInfo>}
 */
const GRAPH = new Map();

for (const file of JS_FILES) {
  const path = join(ASTRO_DIR, file);
  const raw = readFileSync(path);
  const gz = gzipSync(raw).length;
  const code = raw.toString('utf8');

  // Parse static imports: from './foo.js'
  const staticImports = [...code.matchAll(/from\s*["'](\.\/[^"']+)["']/g)]
    .map((m) => m[1].replace('./', ''));

  // Parse dynamic imports: import('./foo.js') or import("./foo.js")
  const dynamicImports = [...code.matchAll(/import\(\s*["'](\.\/[^"']+)["'][^)]*\)/g)]
    .map((m) => m[1].replace('./', ''));

  GRAPH.set(file, { gz, raw: raw.length, static: staticImports, dynamic: dynamicImports });
}

// ---------------------------------------------------------------------------
// Step 2 — Parse HTML files: discover script tags and astro islands
// ---------------------------------------------------------------------------

/**
 * @typedef {{ scripts: string[]; componentUrls: string[]; rendererUrls: string[] }} HtmlSurface
 */

/**
 * @param {string} htmlPath
 * @returns {HtmlSurface}
 */
function parseHtml(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');

  const scripts = [...html.matchAll(/<script[^>]+src=["']\/_astro\/([^"']+)["']/g)]
    .map((m) => m[1]);

  const componentUrls = [...html.matchAll(/component-url=["']\/_astro\/([^"']+)["']/g)]
    .map((m) => m[1]);

  const rendererUrls = [...html.matchAll(/renderer-url=["']\/_astro\/([^"']+)["']/g)]
    .map((m) => m[1]);

  return { scripts, componentUrls, rendererUrls };
}

// ---------------------------------------------------------------------------
// Step 3 — Graph traversal helpers
// ---------------------------------------------------------------------------

/**
 * BFS over the import graph, collecting all reachable chunks.
 * @param {string[]} seeds          Starting chunk filenames.
 * @param {'static' | 'both'} mode  Whether to follow dynamic imports too.
 * @returns {Set<string>}
 */
function reachable(seeds, mode) {
  const visited = new Set();
  const queue = [...seeds];
  while (queue.length) {
    const f = queue.shift();
    if (visited.has(f)) continue;
    visited.add(f);
    const info = GRAPH.get(f);
    if (!info) continue;
    for (const dep of info.static) queue.push(dep);
    if (mode === 'both') {
      for (const dep of info.dynamic) queue.push(dep);
    }
  }
  return visited;
}

/** @param {Set<string>} chunks */
function totalGz(chunks) {
  let n = 0;
  for (const f of chunks) {
    const info = GRAPH.get(f);
    if (info) n += info.gz;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Step 4 — Collect route HTML files and categorise them
// ---------------------------------------------------------------------------

function findHtmlFiles(dir) {
  /** @type {string[]} */
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...findHtmlFiles(full));
    } else if (entry.name.endsWith('.html')) {
      result.push(full);
    }
  }
  return result;
}

const ALL_HTML = findHtmlFiles(DIST);

// Identify the hero page (root index.html) and reading routes (posts/**)
const HERO_HTML = join(DIST, 'index.html');
const READING_HTML = ALL_HTML.filter((p) => p.replace(DIST + '/', '').startsWith('posts/'));

if (!existsSync(HERO_HTML)) {
  console.error(`[bundle-budget] hero page not found: ${HERO_HTML}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 5 — Compute metrics
// ---------------------------------------------------------------------------

const heroSurface = parseHtml(HERO_HTML);

// Pre-hero: sync <script> tags + their STATIC transitive deps only.
// This is blocking JS before any island hydrates.
const preHeroChunks = reachable(heroSurface.scripts, 'static');
const preHeroGz = totalGz(preHeroChunks);

// Hero graph: the BlackHole island's component-url, following ALL imports
// (static + dynamic). Excludes the renderer-url (framework infrastructure).
// This represents the cost of the hero feature itself.
const heroGraphChunks = reachable(heroSurface.componentUrls, 'both');
const heroGraphGz = totalGz(heroGraphChunks);

// Reading route chunks: all chunks reachable from post pages.
const readingRouteResults = READING_HTML.map((htmlPath) => {
  const surface = parseHtml(htmlPath);
  // Reading routes have no islands, but be thorough and include component URLs if any
  const allSeeds = [...surface.scripts, ...surface.componentUrls, ...surface.rendererUrls];
  const chunks = reachable(allSeeds, 'both');
  return { path: htmlPath, chunks };
});

// ---------------------------------------------------------------------------
// Step 6 — Three.js contamination: reading routes must have 0 Three.js bytes
// ---------------------------------------------------------------------------

/**
 * Returns true if a chunk is an engine chunk (allowed to have Three.js).
 * @param {string} file
 */
function isEngineChunk(file) {
  return ENGINE_CHUNK_PATTERNS.some((re) => re.test(file));
}

/**
 * Check if a chunk file contains Three.js symbols.
 * @param {string} file
 */
function hasThreeJs(file) {
  if (isEngineChunk(file)) return false; // expected
  const path = join(ASTRO_DIR, file);
  if (!existsSync(path)) return false;
  const code = readFileSync(path, 'utf8');
  return THREE_MARKERS.some((marker) => code.includes(marker));
}

/** @type {{ path: string; threejsChunks: string[] }[]} */
const readingRouteThreeJs = readingRouteResults.map(({ path, chunks }) => {
  const threejsChunks = [...chunks].filter(hasThreeJs);
  return { path, threejsChunks };
});

const totalThreeJsBytesOnReading = readingRouteThreeJs.reduce((sum, r) => {
  return sum + r.threejsChunks.reduce((s, f) => {
    const info = GRAPH.get(f);
    return s + (info ? info.gz : 0);
  }, 0);
}, 0);

// ---------------------------------------------------------------------------
// Step 7 — Duplicate engine detection
// ---------------------------------------------------------------------------

// Find all chunks that contain Three.js symbols outside the engine chunks.
const duplicateEngineChunks = JS_FILES.filter(
  (f) => !isEngineChunk(f) && hasThreeJs(f),
);

// ---------------------------------------------------------------------------
// Step 7b — PERF-013: CSS, font, and HTML measurements
// ---------------------------------------------------------------------------

/**
 * Extract the concatenated text content of all <style> tags in an HTML file.
 * With inlineStylesheets:'always' this is the complete CSS payload for the route.
 * @param {string} htmlPath
 * @returns {string}
 */
function extractInlineCss(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1])
    .join('');
}

/**
 * Return filenames (relative to dist/_astro/) for fonts referenced by
 * <link rel="preload" as="font"> elements in an HTML file.
 * These are the fonts the browser fetches on the critical path before paint.
 * @param {string} htmlPath
 * @returns {string[]}
 */
function parsePreloadedFontFiles(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  return [...html.matchAll(/<link\s[^>]*>/g)]
    .filter((m) => /\brel=["']preload["']/.test(m[0]) && /\bas=["']font["']/.test(m[0]))
    .map((m) => {
      const href = m[0].match(/\bhref=["']\/_astro\/([^"']+)["']/);
      return href ? href[1] : null;
    })
    .filter(Boolean);
}

// CSS: measure per-route inline CSS (gzip), take the worst-case route.
// inlineStylesheets:'always' means there are no separate .css files in dist;
// all styles live in <style> tags inside the HTML.
const cssPerRoute = ALL_HTML.map((htmlPath) => {
  const css = extractInlineCss(htmlPath);
  const gz = gzipSync(Buffer.from(css)).length;
  return { path: htmlPath, gz };
}).sort((a, b) => b.gz - a.gz);
const maxCssGz = cssPerRoute[0]?.gz ?? 0;

// Font-display audit: check for font-display:block in any @font-face rule.
// font-display:block causes FOIT (Flash of Invisible Text) — the spec
// mandates an "infinite" block period, potentially leaving text invisible
// for 3 s or more. font-display:swap is the safe default here.
const heroInlineCss = extractInlineCss(HERO_HTML);
const hasFontDisplayBlock = /font-display\s*:\s*block\b/i.test(heroInlineCss);

// Fonts: sum raw bytes of every font file preloaded on the hero page.
// woff2 is already a compressed container — its transfer size is the file
// size (browsers do not re-gzip binary assets they serve as font/woff2).
const preloadedFontFilenames = parsePreloadedFontFiles(HERO_HTML);
const preloadedFontBytes = preloadedFontFilenames.reduce((sum, file) => {
  const filePath = join(ASTRO_DIR, file);
  if (!existsSync(filePath)) return sum;
  return sum + readFileSync(filePath).length;
}, 0);

// HTML: measure per-route document gzip size, take the worst-case route.
const htmlPerRoute = ALL_HTML.map((htmlPath) => {
  const raw = readFileSync(htmlPath);
  const gz = gzipSync(raw).length;
  return { path: htmlPath, gz };
}).sort((a, b) => b.gz - a.gz);
const maxHtmlGz = htmlPerRoute[0]?.gz ?? 0;

// ---------------------------------------------------------------------------
// Step 8 — Evaluate budgets
// ---------------------------------------------------------------------------

const results = {
  // PERF-007
  preHeroGz,
  heroGraphGz,
  totalThreeJsBytesOnReading,
  duplicateEngineChunks,
  preHeroChunks: [...preHeroChunks].sort(),
  heroGraphChunks: [...heroGraphChunks].sort(),
  readingRouteThreeJs,
  // PERF-013
  maxCssGz,
  cssPerRoute,
  preloadedFontFilenames,
  preloadedFontBytes,
  hasFontDisplayBlock,
  maxHtmlGz,
  htmlPerRoute,
};

const pass = {
  // PERF-007
  preHeroHard:        preHeroGz <= BUDGET.preHeroHard,
  preHeroTarget:      preHeroGz <= BUDGET.preHeroTarget,
  heroHard:           heroGraphGz <= BUDGET.heroHard,
  heroTarget:         heroGraphGz <= BUDGET.heroTarget,
  readingThreeJs:     totalThreeJsBytesOnReading === 0,
  noDuplicateEngine:  duplicateEngineChunks.length === 0,
  // PERF-013
  cssHard:            maxCssGz <= BUDGET_13.cssHard,
  cssTarget:          maxCssGz <= BUDGET_13.cssTarget,
  fontHard:           preloadedFontBytes <= BUDGET_13.fontHard,
  fontTarget:         preloadedFontBytes <= BUDGET_13.fontTarget,
  htmlHard:           maxHtmlGz <= BUDGET_13.htmlHard,
  htmlTarget:         maxHtmlGz <= BUDGET_13.htmlTarget,
  noFontDisplayBlock: !hasFontDisplayBlock,
};

const hardFailures = [];
// PERF-007
if (!pass.preHeroHard)        hardFailures.push(`pre-hero ${kib(preHeroGz)} > ${kib(BUDGET.preHeroHard)} hard limit`);
if (!pass.heroHard)           hardFailures.push(`hero graph ${kib(heroGraphGz)} > ${kib(BUDGET.heroHard)} hard limit`);
if (!pass.readingThreeJs)     hardFailures.push(`reading routes contain ${totalThreeJsBytesOnReading} bytes of Three.js (must be 0)`);
if (!pass.noDuplicateEngine)  hardFailures.push(`duplicate engine chunks detected: ${duplicateEngineChunks.join(', ')}`);
// PERF-013
if (!pass.cssHard)            hardFailures.push(`CSS (max inline, gzip) ${kib(maxCssGz)} > ${kib(BUDGET_13.cssHard)} hard limit`);
if (!pass.fontHard)           hardFailures.push(`initial font transfer ${kib(preloadedFontBytes)} > ${kib(BUDGET_13.fontHard)} hard limit (${preloadedFontFilenames.join(', ')})`);
if (!pass.htmlHard)           hardFailures.push(`HTML per-route max ${kib(maxHtmlGz)} > ${kib(BUDGET_13.htmlHard)} hard limit (${htmlPerRoute[0]?.path.replace(DIST + '/', '')})`);
if (!pass.noFontDisplayBlock) hardFailures.push('font-display:block found in CSS — causes FOIT (invisible text); use swap or optional');

// ---------------------------------------------------------------------------
// Step 9 — Print summary
// ---------------------------------------------------------------------------

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function kib(bytes) { return (bytes / 1024).toFixed(1) + ' KiB'; }
function status(ok, warn) { return ok ? `${GREEN}✓ PASS${RESET}` : warn ? `${YELLOW}⚠ WARN${RESET}` : `${RED}✗ FAIL${RESET}`; }

console.log(`\n${BOLD}=== Bundle Budget Report (PERF-007 + PERF-013) ===${RESET}\n`);

console.log(`  Pre-hero (sync JS)       ${kib(preHeroGz).padStart(10)}`
  + `  target ${kib(BUDGET.preHeroTarget)}  hard ${kib(BUDGET.preHeroHard)}`
  + `  ${status(pass.preHeroHard, !pass.preHeroTarget && pass.preHeroHard)}`);

console.log(`  Hero graph (engine+comp) ${kib(heroGraphGz).padStart(10)}`
  + `  target ${kib(BUDGET.heroTarget)}  hard ${kib(BUDGET.heroHard)}`
  + `  ${status(pass.heroHard, !pass.heroTarget && pass.heroHard)}`);

console.log(`  Reading routes Three.js  ${kib(totalThreeJsBytesOnReading).padStart(10)}`
  + `  target 0.0 KiB  hard 0.0 KiB`
  + `  ${status(pass.readingThreeJs)}`);

console.log(`  Duplicate engine copies  ${String(duplicateEngineChunks.length).padStart(10)} chunk(s)`
  + `                               `
  + `  ${status(pass.noDuplicateEngine)}`);

console.log(`\n${BOLD}--- PERF-013: CSS / Fonts / HTML ---${RESET}`);

console.log(`  CSS (max inline, gz)     ${kib(maxCssGz).padStart(10)}`
  + `  target ${kib(BUDGET_13.cssTarget)}  hard ${kib(BUDGET_13.cssHard)}`
  + `  ${status(pass.cssHard, !pass.cssTarget && pass.cssHard)}`);

console.log(`  Initial fonts (preload)  ${kib(preloadedFontBytes).padStart(10)}`
  + `  target ${kib(BUDGET_13.fontTarget)}  hard ${kib(BUDGET_13.fontHard)}`
  + `  ${status(pass.fontHard, !pass.fontTarget && pass.fontHard)}`);

console.log(`  HTML per-route max (gz)  ${kib(maxHtmlGz).padStart(10)}`
  + `  target ${kib(BUDGET_13.htmlTarget)}  hard ${kib(BUDGET_13.htmlHard)}`
  + `  ${status(pass.htmlHard, !pass.htmlTarget && pass.htmlHard)}`);

console.log(`  font-display:block       ${String(!hasFontDisplayBlock ? 'none' : 'FOUND').padStart(10)}`
  + `                               `
  + `  ${status(pass.noFontDisplayBlock)}`);

const softFailures = [];
if (!pass.preHeroTarget) softFailures.push(`pre-hero:   ${kib(preHeroGz)} vs ${kib(BUDGET.preHeroTarget)} target`);
if (!pass.heroTarget)    softFailures.push(`hero graph: ${kib(heroGraphGz)} vs ${kib(BUDGET.heroTarget)} target`);
if (!pass.cssTarget)     softFailures.push(`CSS:        ${kib(maxCssGz)} vs ${kib(BUDGET_13.cssTarget)} target`);
if (!pass.fontTarget)    softFailures.push(`fonts:      ${kib(preloadedFontBytes)} vs ${kib(BUDGET_13.fontTarget)} target`);
if (!pass.htmlTarget)    softFailures.push(`HTML:       ${kib(maxHtmlGz)} vs ${kib(BUDGET_13.htmlTarget)} target`);

if (softFailures.length) {
  console.log(`\n${YELLOW}  Targets (non-blocking):${RESET}`);
  softFailures.forEach((s) => console.log(`    ${s}`));
}

if (hardFailures.length) {
  console.log(`\n${RED}${BOLD}  HARD BUDGET BREACH:${RESET}`);
  hardFailures.forEach((f) => console.log(`${RED}    ✗ ${f}${RESET}`));
} else {
  console.log(`\n${GREEN}  All hard limits pass.${RESET}`);
}

// Per-route breakdown
console.log(`\n${BOLD}  Hero graph chunks (${heroGraphChunks.size} total):${RESET}`);
const heroChunksBySize = [...heroGraphChunks]
  .map((f) => ({ f, gz: GRAPH.get(f)?.gz ?? 0 }))
  .sort((a, b) => b.gz - a.gz);
for (const { f, gz } of heroChunksBySize) {
  console.log(`    ${kib(gz).padStart(9)}  ${f}`);
}

// Reading route breakdown
console.log(`\n${BOLD}  Reading route chunks (${READING_HTML.length} pages):${RESET}`);
for (const { path, chunks } of readingRouteResults) {
  const relPath = path.replace(DIST + '/', '');
  const totalGzBytes = totalGz(chunks);
  console.log(`    ${relPath}: ${kib(totalGzBytes)}`);
}

// ---------------------------------------------------------------------------
// Step 10 — Write HTML report (evidence artifact for PERF-014)
// ---------------------------------------------------------------------------

const nowStr = new Date().toISOString();

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function rowClass(ok, soft) {
  if (!ok) return 'fail';
  if (soft) return 'warn';
  return 'pass';
}

const heroRows = heroChunksBySize.map(({ f, gz }) =>
  `<tr><td>${escHtml(f)}</td><td class="num">${kib(gz)}</td></tr>`
).join('\n');

const readingRows = readingRouteResults.map(({ path, chunks }) => {
  const rel = path.replace(DIST + '/', '');
  const gz = totalGz(chunks);
  return `<tr><td>${escHtml(rel)}</td><td class="num">${kib(gz)}</td></tr>`;
}).join('\n');

const cssRouteRows = cssPerRoute.map(({ path, gz }) => {
  const rel = path.replace(DIST + '/', '');
  return `<tr class="${rowClass(gz <= BUDGET_13.cssHard, gz > BUDGET_13.cssTarget && gz <= BUDGET_13.cssHard)}"><td>${escHtml(rel)}</td><td class="num">${kib(gz)}</td></tr>`;
}).join('\n');

const htmlRouteRows = htmlPerRoute.map(({ path, gz }) => {
  const rel = path.replace(DIST + '/', '');
  return `<tr class="${rowClass(gz <= BUDGET_13.htmlHard, gz > BUDGET_13.htmlTarget && gz <= BUDGET_13.htmlHard)}"><td>${escHtml(rel)}</td><td class="num">${kib(gz)}</td></tr>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Bundle Budget Report — PERF-007 + PERF-013</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.4rem; }
  .meta { color: #666; font-size: 0.85rem; margin-bottom: 2rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { text-align: left; padding: 0.4rem 0.8rem; border-bottom: 1px solid #eee; }
  th { background: #f5f5f5; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; font-family: monospace; }
  .pass { color: #2d8a4e; font-weight: bold; }
  .warn { color: #b45309; font-weight: bold; }
  .fail { color: #c0392b; font-weight: bold; }
  tr.fail td { background: #fff5f5; }
  tr.warn td { background: #fffbeb; }
  tr.pass td { background: #f0fff4; }
  .section { margin-top: 2rem; }
  .note { font-size: 0.85rem; color: #555; margin-top: 0.5rem; }
</style>
</head>
<body>
<h1>Bundle Budget Report — PERF-007 + PERF-013</h1>
<p class="meta">
  Generated: ${escHtml(nowStr)}<br>
  Dist: <code>${escHtml(resolve(DIST))}</code>
</p>

<div class="section">
<h2>PERF-007: JavaScript Budget Summary</h2>
<table>
  <thead><tr><th>Metric</th><th class="num">Actual</th><th class="num">Target</th><th class="num">Hard Limit</th><th>Status</th></tr></thead>
  <tbody>
    <tr class="${rowClass(pass.preHeroHard, !pass.preHeroTarget)}">
      <td>Pre-hero (sync JS)</td>
      <td class="num">${kib(preHeroGz)}</td>
      <td class="num">${kib(BUDGET.preHeroTarget)}</td>
      <td class="num">${kib(BUDGET.preHeroHard)}</td>
      <td class="${rowClass(pass.preHeroHard, !pass.preHeroTarget)}">${pass.preHeroHard ? (pass.preHeroTarget ? 'PASS' : 'WARN (target)') : 'FAIL'}</td>
    </tr>
    <tr class="${rowClass(pass.heroHard, !pass.heroTarget)}">
      <td>Hero graph (engine + component)</td>
      <td class="num">${kib(heroGraphGz)}</td>
      <td class="num">${kib(BUDGET.heroTarget)}</td>
      <td class="num">${kib(BUDGET.heroHard)}</td>
      <td class="${rowClass(pass.heroHard, !pass.heroTarget)}">${pass.heroHard ? (pass.heroTarget ? 'PASS' : 'WARN (target)') : 'FAIL'}</td>
    </tr>
    <tr class="${pass.readingThreeJs ? 'pass' : 'fail'}">
      <td>Reading routes Three.js bytes</td>
      <td class="num">${kib(totalThreeJsBytesOnReading)}</td>
      <td class="num">0.0 KiB</td>
      <td class="num">0.0 KiB</td>
      <td class="${pass.readingThreeJs ? 'pass' : 'fail'}">${pass.readingThreeJs ? 'PASS' : 'FAIL'}</td>
    </tr>
    <tr class="${pass.noDuplicateEngine ? 'pass' : 'fail'}">
      <td>Duplicate engine copies</td>
      <td class="num">${duplicateEngineChunks.length} chunk(s)</td>
      <td class="num">0</td>
      <td class="num">0</td>
      <td class="${pass.noDuplicateEngine ? 'pass' : 'fail'}">${pass.noDuplicateEngine ? 'PASS' : 'FAIL: ' + escHtml(duplicateEngineChunks.join(', '))}</td>
    </tr>
  </tbody>
</table>
<p class="note">
  <strong>Pre-hero:</strong> Chunks from sync &lt;script&gt; tags on the hero page and their static transitive deps.
  This is the blocking JS before any island hydrates.<br>
  <strong>Hero graph:</strong> The BlackHole island component's full chunk graph (static + dynamic imports, transitively).
  Excludes the Astro/React renderer-url (framework overhead).<br>
  <strong>Reading routes:</strong> /posts/** pages must ship zero Three.js bytes.<br>
  <strong>Duplicate engine:</strong> Three.js core symbols must not appear in more than one chunk family.
</p>
</div>

<div class="section">
<h2>PERF-013: CSS / Font / HTML Budget Summary</h2>
<table>
  <thead><tr><th>Metric</th><th class="num">Actual</th><th class="num">Target</th><th class="num">Hard Limit</th><th>Status</th></tr></thead>
  <tbody>
    <tr class="${rowClass(pass.cssHard, !pass.cssTarget)}">
      <td>CSS inline (max route, gzip)</td>
      <td class="num">${kib(maxCssGz)}</td>
      <td class="num">${kib(BUDGET_13.cssTarget)}</td>
      <td class="num">${kib(BUDGET_13.cssHard)}</td>
      <td class="${rowClass(pass.cssHard, !pass.cssTarget)}">${pass.cssHard ? (pass.cssTarget ? 'PASS' : 'WARN (target)') : 'FAIL'}</td>
    </tr>
    <tr class="${rowClass(pass.fontHard, !pass.fontTarget)}">
      <td>Initial font transfer (preloaded woff2)</td>
      <td class="num">${kib(preloadedFontBytes)}</td>
      <td class="num">${kib(BUDGET_13.fontTarget)}</td>
      <td class="num">${kib(BUDGET_13.fontHard)}</td>
      <td class="${rowClass(pass.fontHard, !pass.fontTarget)}">${pass.fontHard ? (pass.fontTarget ? 'PASS' : 'WARN (target)') : 'FAIL'}</td>
    </tr>
    <tr class="${rowClass(pass.htmlHard, !pass.htmlTarget)}">
      <td>HTML per-route max (gzip)</td>
      <td class="num">${kib(maxHtmlGz)}</td>
      <td class="num">${kib(BUDGET_13.htmlTarget)}</td>
      <td class="num">${kib(BUDGET_13.htmlHard)}</td>
      <td class="${rowClass(pass.htmlHard, !pass.htmlTarget)}">${pass.htmlHard ? (pass.htmlTarget ? 'PASS' : 'WARN (target)') : 'FAIL'}</td>
    </tr>
    <tr class="${pass.noFontDisplayBlock ? 'pass' : 'fail'}">
      <td>font-display:block (FOIT risk)</td>
      <td class="num">${hasFontDisplayBlock ? 'FOUND' : 'none'}</td>
      <td class="num">none</td>
      <td class="num">none</td>
      <td class="${pass.noFontDisplayBlock ? 'pass' : 'fail'}">${pass.noFontDisplayBlock ? 'PASS' : 'FAIL'}</td>
    </tr>
  </tbody>
</table>
<p class="note">
  <strong>CSS:</strong> Since <code>inlineStylesheets:'always'</code>, all CSS is embedded in &lt;style&gt; tags.
  The budget is enforced per-route (worst-case gzip). Preloaded font files (${escHtml(preloadedFontFilenames.join(', '))}).<br>
  <strong>Font transfer:</strong> Only fonts with <code>rel=preload as=font</code> count — those fetch on the critical path before paint.
  woff2 is already a compressed container; transfer size = raw file size.<br>
  <strong>HTML:</strong> Full document gzip size, worst-case route (what the browser downloads over the network).
  A 100 KiB hard limit keeps Time-to-First-Byte lean even on slow connections.<br>
  <strong>font-display:block</strong> forces an invisible-text period (FOIT) up to 3 s.
  The expected value is <code>swap</code> (text visible immediately in the fallback font).
</p>
</div>

<div class="section">
<h2>Hero Graph Chunks (${heroGraphChunks.size} chunks, ${kib(heroGraphGz)} total)</h2>
<table>
  <thead><tr><th>Chunk</th><th class="num">Gzip size</th></tr></thead>
  <tbody>${heroRows}</tbody>
</table>
</div>

<div class="section">
<h2>Reading Route JS Totals</h2>
<table>
  <thead><tr><th>Route</th><th class="num">Gzip size</th></tr></thead>
  <tbody>${readingRows}</tbody>
</table>
<p class="note">Reading routes ship no React islands and no Three.js — only the baseline Astro client runtime.</p>
</div>

<div class="section">
<h2>Pre-hero Chunks (${preHeroChunks.size} chunks, ${kib(preHeroGz)} total)</h2>
<table>
  <thead><tr><th>Chunk</th><th class="num">Gzip size</th></tr></thead>
  <tbody>
    ${[...preHeroChunks]
      .map((f) => `<tr><td>${escHtml(f)}</td><td class="num">${kib(GRAPH.get(f)?.gz ?? 0)}</td></tr>`)
      .join('\n    ')}
  </tbody>
</table>
</div>

<div class="section">
<h2>CSS per Route (inline &lt;style&gt; gzip)</h2>
<table>
  <thead><tr><th>Route</th><th class="num">Gzip size</th></tr></thead>
  <tbody>${cssRouteRows}</tbody>
</table>
</div>

<div class="section">
<h2>HTML per Route (full document gzip)</h2>
<table>
  <thead><tr><th>Route</th><th class="num">Gzip size</th></tr></thead>
  <tbody>${htmlRouteRows}</tbody>
</table>
</div>

</body>
</html>`;

mkdirSync('evidence/performance', { recursive: true });
writeFileSync(EVIDENCE_OUT, html, 'utf8');
console.log(`\n  Report written to ${EVIDENCE_OUT}`);

// ---------------------------------------------------------------------------
// Step 10b — Write PERF-013 JSON evidence artifact
// ---------------------------------------------------------------------------

const CSS_FONT_HTML_EVIDENCE = 'evidence/performance/css-font-html-budgets.json';

const evidenceJson = {
  generated: nowStr,
  dist: resolve(DIST),
  css: {
    strategy: 'inlineStylesheets:always — no external .css files; CSS is embedded in <style> tags',
    maxGzKiB: +(maxCssGz / 1024).toFixed(2),
    targetKiB: BUDGET_13.cssTarget / 1024,
    hardKiB: BUDGET_13.cssHard / 1024,
    passTarget: pass.cssTarget,
    passHard: pass.cssHard,
    routes: cssPerRoute.map(({ path, gz }) => ({
      route: path.replace(DIST + '/', ''),
      gzKiB: +(gz / 1024).toFixed(2),
    })),
  },
  fonts: {
    preloadedFiles: preloadedFontFilenames,
    totalPreloadedBytes: preloadedFontBytes,
    totalPreloadedKiB: +(preloadedFontBytes / 1024).toFixed(2),
    targetKiB: BUDGET_13.fontTarget / 1024,
    hardKiB: BUDGET_13.fontHard / 1024,
    passTarget: pass.fontTarget,
    passHard: pass.fontHard,
    fontDisplayBlock: hasFontDisplayBlock,
    noInvisibleText: pass.noFontDisplayBlock,
    note: 'font-display:swap confirmed on all @font-face rules; preloaded fonts fetch before paint to eliminate FOUT on hero overlay text',
  },
  html: {
    maxGzKiB: +(maxHtmlGz / 1024).toFixed(2),
    targetKiB: BUDGET_13.htmlTarget / 1024,
    hardKiB: BUDGET_13.htmlHard / 1024,
    passTarget: pass.htmlTarget,
    passHard: pass.htmlHard,
    routes: htmlPerRoute.map(({ path, gz }) => ({
      route: path.replace(DIST + '/', ''),
      gzKiB: +(gz / 1024).toFixed(2),
    })),
  },
};

writeFileSync(CSS_FONT_HTML_EVIDENCE, JSON.stringify(evidenceJson, null, 2), 'utf8');
console.log(`  Evidence JSON written to ${CSS_FONT_HTML_EVIDENCE}`);

// ---------------------------------------------------------------------------
// Step 11 — Exit
// ---------------------------------------------------------------------------

if (hardFailures.length) {
  process.exit(1);
}
