// check-asset-sizes.mjs — build-output image gates.
//
//   node scripts/check-asset-sizes.mjs [dist]
//
// Three gates over the built site:
//   1. SIZE — any raster over HARD_LIMIT fails the build; anything over
//      WARN_LIMIT is reported. No grandfather list: P5 moved every content
//      raster through astro:assets, so an overage is a regression, not debt.
//   2. DIMENSIONS — every <img> in dist HTML must carry width AND height
//      attributes (intrinsic-size CLS guard). astro:assets emits them for
//      free; a raw <img> that forgot is exactly what this catches.
//   3. DUPLICATES — identical raster bytes under two dist paths (warn-level:
//      usually a public/ copy of something astro:assets already emits).
//
// JS bundle budgets (gzip, per-route) land with budgets.json in the
// performance phase and extend this script.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, extname } from 'node:path';

const distDir = resolve(process.argv[2] ?? 'dist');
const HARD_LIMIT = 500 * 1024; // fail: no raster above 500KB ships
const WARN_LIMIT = 250 * 1024; // warn: target ceiling per delivered raster

const RASTER_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);

if (!existsSync(distDir)) {
  console.error(`check-asset-sizes: build directory not found: ${distDir}`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(distDir);
const rasters = files.filter((f) => RASTER_EXT.has(extname(f).toLowerCase()));
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

// ---------------------------------------------------------------------------
// Gate 1: raster size budget
// ---------------------------------------------------------------------------
const failures = [];
const warnings = [];

for (const file of rasters) {
  const size = statSync(file).size;
  const rel = file.slice(distDir.length + 1);
  if (size > HARD_LIMIT) failures.push({ rel, size });
  else if (size > WARN_LIMIT) warnings.push({ rel, size });
}

console.log(`check-asset-sizes: ${rasters.length} raster(s) scanned in ${distDir}`);
for (const w of warnings) console.warn(`  WARN  ${w.rel} ${kb(w.size)} (target ≤${kb(WARN_LIMIT)})`);
for (const f of failures) console.error(`  FAIL  ${f.rel} ${kb(f.size)} (hard cap ${kb(HARD_LIMIT)})`);

// ---------------------------------------------------------------------------
// Gate 2: every <img> in dist HTML carries width + height attributes
// ---------------------------------------------------------------------------
// Pragmatic regex sweep — the build output is static, attribute-quoted Astro
// HTML, so tag-level matching is the whole truth (same reasoning as
// check-links.mjs). Client-rendered <img> (React islands) are covered by the
// e2e images spec instead; this gate owns the server-rendered HTML.
const dimensionless = [];
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const page = file.slice(distDir.length);
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const hasWidth = /\bwidth\s*=\s*["']?\d/i.test(tag);
    const hasHeight = /\bheight\s*=\s*["']?\d/i.test(tag);
    if (!hasWidth || !hasHeight) {
      dimensionless.push({ page, tag: tag.length > 140 ? `${tag.slice(0, 140)}…` : tag });
    }
  }
}
for (const d of dimensionless) {
  console.error(`  FAIL  ${d.page}: <img> missing width/height attributes (CLS): ${d.tag}`);
}

// ---------------------------------------------------------------------------
// Gate 3 (warn): duplicate raster payloads by content hash
// ---------------------------------------------------------------------------
const byHash = new Map();
for (const file of rasters) {
  const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
  const rel = file.slice(distDir.length + 1);
  if (!byHash.has(hash)) byHash.set(hash, []);
  byHash.get(hash).push(rel);
}
for (const [, paths] of byHash) {
  if (paths.length > 1) {
    console.warn(`  WARN  duplicate raster shipped ${paths.length}×: ${paths.join(' = ')}`);
  }
}

// ---------------------------------------------------------------------------
if (failures.length > 0 || dimensionless.length > 0) {
  if (failures.length > 0) {
    console.error(`\n${failures.length} raster(s) over the ${kb(HARD_LIMIT)} hard cap.`);
    console.error('Route the asset through the image pipeline (src/assets + astro:assets) before shipping.');
  }
  if (dimensionless.length > 0) {
    console.error(`\n${dimensionless.length} <img> tag(s) missing intrinsic dimensions.`);
    console.error('Render through astro:assets (<Image>/<Picture>) or add explicit width/height.');
  }
  process.exit(1);
}
console.log('check-asset-sizes: within budget, all <img> dimensioned ✓');
