// check-bundle-budgets.mjs — gzip JS/HTML budget gate over the built site.
//
//   node scripts/check-bundle-budgets.mjs [dist]
//
// Enforces budgets.json (repo root) against dist/:
//   • hero engine graph (three-core + three-post + createScene + warmThree)
//   • per-route eager JS — engine pages vs reading routes, separately budgeted
//   • per-page HTML gzip (stylesheets are inlined, so this caps CSS too)
//
// 'hard' violations fail the build; 'target' overages print as warnings.
// Everything is measured from dist bytes — deterministic on any machine, no
// wall clock, no renderer — so this gate is safe to enforce on software-
// rendered CI where Lighthouse wall-clock numbers are advisory only.
//
// The measurement core lives in scripts/lib/bundle-metrics.mjs and is shared
// with scripts/gen-perf-report.mjs, so the number this gate enforces is the
// same number the site publishes on /behind-the-build.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureDist } from './lib/bundle-metrics.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(process.argv[2] ?? join(repoRoot, 'dist'));
const budgetsPath = join(repoRoot, 'budgets.json');

if (!existsSync(distDir)) {
  console.error(`check-bundle-budgets: build directory not found: ${distDir}`);
  process.exit(1);
}
const budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'));
const { heroGraph, routes, rasters } = measureDist(distDir);

const failures = [];
const warnings = [];

/** Compare a measured KiB value to a { hard, target } budget row. */
function judge(label, valueKiB, { hard, target }, detail = '') {
  if (valueKiB > hard) {
    failures.push({ label, valueKiB, limit: hard, detail });
    return 'FAIL';
  }
  if (valueKiB > target) {
    warnings.push({ label, valueKiB, limit: target, detail });
    return 'warn';
  }
  return 'ok';
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------
const rows = [];
rows.push({
  what: 'hero engine graph (gz)',
  measured: heroGraph.gzipKiB,
  target: budgets.js.heroGraphGzipKiB.target,
  hard: budgets.js.heroGraphGzipKiB.hard,
  verdict: judge(
    'hero engine graph',
    heroGraph.gzipKiB,
    budgets.js.heroGraphGzipKiB,
    heroGraph.files.map((f) => `${f.name} ${f.gzipKiB}K`).join(' + '),
  ),
});

for (const r of routes) {
  const jsBudget =
    r.kind === 'engine' ? budgets.js.preHeroRouteGzipKiB : budgets.js.readingRouteGzipKiB;
  rows.push({
    what: `${r.route} ${r.kind === 'engine' ? 'pre-engine' : 'eager'} JS (gz)`,
    measured: r.jsGzipKiB,
    target: jsBudget.target,
    hard: jsBudget.hard,
    verdict: judge(
      `${r.route} eager JS`,
      r.jsGzipKiB,
      jsBudget,
      r.files
        .slice(0, 3)
        .map((f) => `${f.name} ${f.gzipKiB}K`)
        .join(', ') + (r.files.length > 3 ? ` … (${r.files.length} files)` : ''),
    ),
  });
  rows.push({
    what: `${r.route} HTML (gz)`,
    measured: r.htmlGzipKiB,
    target: budgets.html.perPageGzipKiB.target,
    hard: budgets.html.perPageGzipKiB.hard,
    verdict: judge(`${r.route} HTML`, r.htmlGzipKiB, budgets.html.perPageGzipKiB),
  });
}

const width = Math.max(...rows.map((r) => r.what.length));
console.log(`check-bundle-budgets: ${distDir}`);
console.log(
  `  ${'what'.padEnd(width)}  ${'measured'.padStart(9)}  ${'target'.padStart(7)}  ${'hard'.padStart(6)}  verdict`,
);
for (const r of rows) {
  console.log(
    `  ${r.what.padEnd(width)}  ${`${r.measured}K`.padStart(9)}  ${`${r.target}K`.padStart(7)}  ${`${r.hard}K`.padStart(6)}  ${r.verdict}`,
  );
}
console.log(
  `  (rasters: ${rasters.count} shipped, largest ${rasters.largestKiB}K — enforced by check-asset-sizes.mjs)`,
);

for (const w of warnings) {
  console.warn(`  WARN  ${w.label}: ${w.valueKiB}K over the ${w.limit}K target${w.detail ? ` — ${w.detail}` : ''}`);
}
for (const f of failures) {
  console.error(`  FAIL  ${f.label}: ${f.valueKiB}K over the ${f.limit}K hard cap${f.detail ? ` — ${f.detail}` : ''}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} budget(s) over hard caps. Budgets live in budgets.json;`);
  console.error('if a raise is genuinely justified, change the number IN THE SAME COMMIT');
  console.error('as the code that needs it, with the reason in budgets.json comments.');
  process.exit(1);
}
console.log('check-bundle-budgets: within budgets ✓');
