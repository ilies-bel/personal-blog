// check-asset-sizes.mjs — build-output size gate.
//
//   node scripts/check-asset-sizes.mjs [dist]
//
// Phase-2 scope: raster images. Any raster over HARD_LIMIT fails the build;
// anything over WARN_LIMIT is reported. JS bundle budgets (gzip, per-route)
// land with budgets.json in the performance phase and extend this script.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const distDir = resolve(process.argv[2] ?? 'dist');
const HARD_LIMIT = 500 * 1024; // fail: no raster above 500KB ships
const WARN_LIMIT = 250 * 1024; // warn: target ceiling per delivered raster

const RASTER_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);

// KNOWN OVERAGES — pre-existing assets grandfathered until the image pipeline
// phase (P5) moves them through astro:assets. Each entry is a deliberate,
// dated debt; P5 removes this list entirely. Do NOT add new entries.
const KNOWN_OVERAGES = new Set([
  'inspirations/voyager-golden-record.jpg', // 4.0MB — P5 target ≤150KB AVIF
  'graveyard/heydaniel.png', // 679KB — P5
  'graveyard/keywordlens.png', // 509KB — P5
]);

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

const rasters = walk(distDir).filter((f) => RASTER_EXT.has(extname(f).toLowerCase()));
const failures = [];
const warnings = [];

for (const file of rasters) {
  const size = statSync(file).size;
  const rel = file.slice(distDir.length + 1);
  if (size > HARD_LIMIT) {
    if (KNOWN_OVERAGES.has(rel)) {
      warnings.push({ rel, size, grandfathered: true });
    } else {
      failures.push({ rel, size });
    }
  } else if (size > WARN_LIMIT) {
    warnings.push({ rel, size });
  }
}

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

console.log(`check-asset-sizes: ${rasters.length} raster(s) scanned in ${distDir}`);
for (const w of warnings)
  console.warn(
    `  WARN  ${w.rel} ${kb(w.size)} ${w.grandfathered ? '(GRANDFATHERED until P5 — over hard cap)' : `(target ≤${kb(WARN_LIMIT)})`}`,
  );
for (const f of failures) console.error(`  FAIL  ${f.rel} ${kb(f.size)} (hard cap ${kb(HARD_LIMIT)})`);

if (failures.length > 0) {
  console.error(`\n${failures.length} raster(s) over the ${kb(HARD_LIMIT)} hard cap.`);
  console.error('Optimize via the image pipeline (src/assets + astro:assets) before shipping.');
  process.exit(1);
}
console.log('check-asset-sizes: within budget ✓');
