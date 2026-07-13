// bundle-metrics.mjs — shared measurement core for the P10 performance gates.
//
// Consumed by scripts/check-bundle-budgets.mjs (the CI gate) and
// scripts/gen-perf-report.mjs (the telemetry generator), so the number the gate
// enforces and the number the site PUBLISHES are, by construction, the same
// measurement — a budget table that can't drift from its own gate.
//
// What it measures, all from dist/ (fully deterministic — no wall clock, no
// renderer, no network; identical on a laptop and on SwiftShader CI):
//
//   • HERO ENGINE GRAPH — the dynamically-imported three.js graph
//     (three-core* + three-post* + the createScene scene-code chunk +
//     the warmThree facade). Identified by following dynamic-import specifiers
//     (`import("./warmThree…")` / `import("./createScene…")`) out of the eager
//     chunks, with a chunk-name-pattern fallback, so a hash change can never
//     silently drop a file from the measurement. Shared support chunks the
//     engine ALSO uses (config, glGovernor, cockpitPlate…) are counted once,
//     in the route budgets, not double-counted here.
//
//   • PER-ROUTE EAGER JS — for every dist HTML page: the JS actually requested
//     before (and without) the engine import. Entry points are the page's
//     `<script type="module" src>` tags plus its astro-island `component-url` /
//     `renderer-url` attributes, expanded through the STATIC import closure
//     (`import …from"./x.js"` / bare `import"./x.js"` / `export …from"./x.js"`).
//     Dynamic imports (`import("./x.js")`) deliberately do NOT propagate — that
//     boundary is exactly what separates "pre-hero" JS from the engine graph.
//
//   • PER-ROUTE HTML GZIP — stylesheets are inlined (astro.config
//     inlineStylesheets:'always'), so this single number also caps CSS growth,
//     including the P9 grain/backdrop data-URIs.
//
//   • RASTERS — count + largest, for the generated telemetry (the enforcement
//     gate for rasters stays in check-asset-sizes.mjs).
//
// Routes are classified ENGINE vs READING: a page is an engine page when its
// eager closure contains a chunk that dynamically imports the createScene
// chunk (home's BlackHole, behind-the-build / graveyard's ArticleScene +
// SceneFigure). Engine pages carry the React island runtime and the engine
// shell; reading routes must stay an order of magnitude lighter.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, extname } from 'node:path';

const RASTER_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);

export const KIB = 1024;
export const toKiB = (bytes) => Math.round((bytes / KIB) * 10) / 10;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const gzipSize = (file) => gzipSync(readFileSync(file), { level: 9 }).length;

/** "dist/about/index.html" → "/about/"; "dist/404.html" → "/404.html". */
function routeOf(htmlPath, distDir) {
  const rel = htmlPath.slice(distDir.length).replace(/\\/g, '/');
  if (rel.endsWith('/index.html')) return rel.slice(0, -'index.html'.length) || '/';
  return rel;
}

/**
 * Parse a built chunk's import specifiers.
 * Static: `import{a}from"./x.js"`, bare `import"./x.js"`, `export{a}from"./x.js"`.
 * Dynamic: `import("./x.js")`. Rollup emits sibling-relative "./name.hash.js"
 * specifiers in dist/_astro, so matching that shape is the whole truth.
 */
function parseImports(source) {
  const staticImports = new Set();
  const dynamicImports = new Set();
  for (const m of source.matchAll(/(?:import|export)\s*[\w$*{},:\s]*?\s*from\s*["']\.\/([^"']+\.m?js)["']/g)) {
    staticImports.add(m[1]);
  }
  // Bare side-effect imports: `import"./x.js"` (quote directly after import —
  // dynamic `import(` cannot match because its next char is a parenthesis).
  for (const m of source.matchAll(/(?<![.\w$])import\s*["']\.\/([^"']+\.m?js)["']/g)) {
    staticImports.add(m[1]);
  }
  for (const m of source.matchAll(/import\(\s*["']\.\/([^"']+\.m?js)["']\s*\)/g)) {
    dynamicImports.add(m[1]);
  }
  return { staticImports: [...staticImports], dynamicImports: [...dynamicImports] };
}

/**
 * Measure everything the budgets gate on. Returns
 * { chunks, heroGraph, routes, rasters } where
 *   chunks:    Map(name → { raw, gzip, staticImports, dynamicImports })
 *   heroGraph: { files: [{ name, gzipKiB }], gzipKiB }
 *   routes:    [{ route, kind: 'engine'|'reading', jsGzipKiB, htmlGzipKiB, files }]
 *   rasters:   { count, largestKiB, largest }
 */
export function measureDist(distDir) {
  const files = walk(distDir);

  // --- chunk graph ---------------------------------------------------------
  const chunkPaths = files.filter((f) => f.includes(`${join('_astro')}`) && /\.m?js$/.test(f));
  const chunks = new Map();
  for (const p of chunkPaths) {
    const name = p.slice(p.lastIndexOf('/') + 1);
    const source = readFileSync(p, 'utf8');
    chunks.set(name, {
      raw: statSync(p).size,
      gzip: gzipSize(p),
      ...parseImports(source),
    });
  }

  // --- hero engine graph ---------------------------------------------------
  // Seed from dynamic-import specifiers so renamed hashes still resolve; the
  // name-pattern fallback catches a chunk nothing currently points at (which
  // would itself be a bug worth seeing in the table).
  const HERO_PATTERNS = [/^three-core\./, /^three-post\./, /^createScene\./, /^warmThree\./];
  const heroNames = new Set();
  for (const [, meta] of chunks) {
    for (const spec of meta.dynamicImports) {
      if (/^(createScene|warmThree)\./.test(spec)) heroNames.add(spec);
    }
  }
  for (const name of chunks.keys()) {
    if (HERO_PATTERNS.some((re) => re.test(name))) heroNames.add(name);
  }
  // three-core / three-post are reached via the createScene chunk's static
  // imports; pull them in explicitly through the closure of the seeds, but
  // ONLY the three-* chunks (support chunks stay with the route budgets).
  for (const seed of [...heroNames]) {
    const meta = chunks.get(seed);
    if (!meta) continue;
    for (const spec of meta.staticImports) {
      if (/^three-(core|post)\./.test(spec)) heroNames.add(spec);
    }
  }
  const heroFiles = [...heroNames]
    .filter((n) => chunks.has(n))
    .map((n) => ({ name: n, gzipKiB: toKiB(chunks.get(n).gzip) }))
    .sort((a, b) => b.gzipKiB - a.gzipKiB);
  const heroGraph = {
    files: heroFiles,
    gzipKiB: toKiB(heroFiles.reduce((sum, f) => sum + chunks.get(f.name).gzip, 0)),
  };

  // --- per-route eager JS ---------------------------------------------------
  const htmlFiles = files.filter((f) => f.endsWith('.html'));
  const routes = [];
  for (const htmlPath of htmlFiles) {
    const html = readFileSync(htmlPath, 'utf8');
    const route = routeOf(htmlPath, distDir);

    const entries = new Set();
    for (const m of html.matchAll(/<script[^>]*\bsrc="[^"]*\/_astro\/([^"]+\.m?js)"/g)) entries.add(m[1]);
    for (const m of html.matchAll(/\b(?:component-url|renderer-url|before-hydration-url)="[^"]*\/_astro\/([^"]+\.m?js)"/g)) {
      entries.add(m[1]);
    }

    // Static-import closure. Dynamic imports do not propagate (see header).
    const eager = new Set();
    const queue = [...entries];
    while (queue.length > 0) {
      const name = queue.pop();
      if (eager.has(name) || heroNames.has(name)) continue; // engine graph never counts as eager
      const meta = chunks.get(name);
      if (!meta) continue;
      eager.add(name);
      queue.push(...meta.staticImports);
    }

    const isEngine = [...eager].some((name) =>
      chunks.get(name).dynamicImports.some((spec) => /^createScene\./.test(spec)),
    );

    const routeFiles = [...eager]
      .map((name) => ({ name, gzipKiB: toKiB(chunks.get(name).gzip) }))
      .sort((a, b) => b.gzipKiB - a.gzipKiB);
    routes.push({
      route,
      kind: isEngine ? 'engine' : 'reading',
      jsGzipKiB: toKiB(routeFiles.reduce((sum, f) => sum + chunks.get(f.name).gzip, 0)),
      htmlGzipKiB: toKiB(gzipSize(htmlPath)),
      files: routeFiles,
    });
  }
  routes.sort((a, b) => (a.route < b.route ? -1 : 1));

  // --- rasters ---------------------------------------------------------------
  const rasterPaths = files.filter((f) => RASTER_EXT.has(extname(f).toLowerCase()));
  let largest = { path: null, size: 0 };
  for (const p of rasterPaths) {
    const size = statSync(p).size;
    if (size > largest.size) largest = { path: p.slice(distDir.length + 1), size };
  }
  const rasters = {
    count: rasterPaths.length,
    largest: largest.path,
    largestKiB: toKiB(largest.size),
  };

  return { chunks, heroGraph, routes, rasters };
}
