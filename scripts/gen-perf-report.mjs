// gen-perf-report.mjs — generated performance telemetry (P10).
//
//   node scripts/gen-perf-report.mjs           # write src/data/perf-report.json from dist/
//   node scripts/gen-perf-report.mjs --check   # CI staleness gate: committed report vs fresh dist
//
// The /behind-the-build budget table used to be a hand-entered array claiming
// "measured on this branch" — un-regenerable, un-checkable, and it drifted.
// This script REPLACES that: it measures the just-built dist (same core as
// scripts/check-bundle-budgets.mjs) and writes src/data/perf-report.json,
// which the page renders verbatim with a provenance line. If Lighthouse CI
// results exist (.lighthouseci/ after `pnpm lhci autorun`), their lab numbers
// are folded in; otherwise a previous report's Lighthouse block is carried
// forward unchanged (it keeps its own measuredAt stamp, so the page can say
// exactly how old each number is).
//
// --check (runs in CI after the build): the COMMITTED report's deterministic
// numbers (bundle gzip + HTML gzip + rasters) must match the freshly built
// dist within ±5% (with a ±0.5 KiB absolute allowance so 1-KiB-scale chunks
// don't trip on rounding). This makes a stale committed report a build
// failure: you cannot change what ships without regenerating what the site
// SAYS ships. Fix: pnpm build && node scripts/gen-perf-report.mjs, commit.
//
// Regeneration is part of a release, not of every build — the JSON is
// committed so the deployed page's claims are reviewable in the diff.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureDist } from './lib/bundle-metrics.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const checkMode = args.includes('--check');
const distDir = resolve(args.find((a) => !a.startsWith('--')) ?? join(repoRoot, 'dist'));
const reportPath = join(repoRoot, 'src/data/perf-report.json');

if (!existsSync(distDir)) {
  console.error(`gen-perf-report: build directory not found: ${distDir} (run pnpm build first)`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Measure (deterministic part)
// ---------------------------------------------------------------------------
const budgets = JSON.parse(readFileSync(join(repoRoot, 'budgets.json'), 'utf8'));
const { heroGraph, routes, rasters } = measureDist(distDir);

const perRoute = {};
for (const r of routes) {
  perRoute[r.route] = { kind: r.kind, jsGzipKiB: r.jsGzipKiB, htmlGzipKiB: r.htmlGzipKiB };
}
const home = routes.find((r) => r.route === '/');
const readingMax = Math.max(...routes.filter((r) => r.kind === 'reading').map((r) => r.jsGzipKiB));
const htmlMax = Math.max(...routes.map((r) => r.htmlGzipKiB));

const fresh = {
  bundle: {
    heroGraphGzipKiB: heroGraph.gzipKiB,
    heroGraphFiles: heroGraph.files,
    preHeroGzipKiB: home?.jsGzipKiB ?? 0,
    readingRouteMaxGzipKiB: readingMax,
    perRoute,
  },
  html: { maxPageGzipKiB: htmlMax },
  rasters: { count: rasters.count, largestKiB: rasters.largestKiB, largest: rasters.largest },
};

// ---------------------------------------------------------------------------
// Lighthouse lab numbers (advisory part) — folded in when a run exists.
// ---------------------------------------------------------------------------
function collectLighthouse() {
  const lhciDir = join(repoRoot, '.lighthouseci');
  if (!existsSync(lhciDir)) return null;
  const lhrFiles = readdirSync(lhciDir).filter((f) => /^lhr-.*\.json$/.test(f));
  if (lhrFiles.length === 0) return null;
  // Multiple runs per URL are possible; keep the MEDIAN-by-performance run per
  // URL (lhci's own representative-run heuristic, approximated).
  const byUrl = new Map();
  for (const f of lhrFiles) {
    const lhr = JSON.parse(readFileSync(join(lhciDir, f), 'utf8'));
    const route = new URL(lhr.finalDisplayedUrl ?? lhr.requestedUrl).pathname;
    if (!byUrl.has(route)) byUrl.set(route, []);
    byUrl.get(route).push(lhr);
  }
  const perRouteLab = {};
  for (const [route, runs] of byUrl) {
    runs.sort(
      (a, b) => (a.categories?.performance?.score ?? 0) - (b.categories?.performance?.score ?? 0),
    );
    const lhr = runs[Math.floor(runs.length / 2)];
    const audit = (id) => lhr.audits?.[id]?.numericValue;
    perRouteLab[route] = {
      performance: Math.round((lhr.categories?.performance?.score ?? 0) * 100),
      lcpMs: Math.round(audit('largest-contentful-paint') ?? -1),
      cls: Math.round((audit('cumulative-layout-shift') ?? -1) * 1000) / 1000,
      tbtMs: Math.round(audit('total-blocking-time') ?? -1),
      totalByteWeightKiB: Math.round((audit('total-byte-weight') ?? 0) / 1024),
    };
  }
  return {
    measuredAt: new Date().toISOString().slice(0, 10),
    // Software-rendered environments make wall-clock lab numbers advisory;
    // record where they came from so the page can say so.
    environment: process.env.CI ? 'ci' : 'local',
    perRoute: perRouteLab,
  };
}

const previous = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
const lighthouse = collectLighthouse() ?? previous?.lighthouse ?? null;

// ---------------------------------------------------------------------------
// --check: committed report vs freshly built dist, ±5% on deterministic numbers
// ---------------------------------------------------------------------------
if (checkMode) {
  if (!previous) {
    console.error(`gen-perf-report --check: ${reportPath} missing — run gen-perf-report and commit it.`);
    process.exit(1);
  }
  const TOLERANCE = 0.05;
  const ABS_KIB = 0.5;
  const drifts = [];
  const compare = (label, committed, current) => {
    if (typeof committed !== 'number' || typeof current !== 'number') {
      drifts.push(`${label}: missing from committed report (regenerate)`);
      return;
    }
    const delta = Math.abs(current - committed);
    if (delta > ABS_KIB && delta > committed * TOLERANCE) {
      drifts.push(`${label}: committed ${committed}K, built ${current}K (Δ ${(current - committed).toFixed(1)}K > ±5%)`);
    }
  };
  compare('bundle.heroGraphGzipKiB', previous.bundle?.heroGraphGzipKiB, fresh.bundle.heroGraphGzipKiB);
  compare('bundle.preHeroGzipKiB', previous.bundle?.preHeroGzipKiB, fresh.bundle.preHeroGzipKiB);
  compare('bundle.readingRouteMaxGzipKiB', previous.bundle?.readingRouteMaxGzipKiB, fresh.bundle.readingRouteMaxGzipKiB);
  compare('html.maxPageGzipKiB', previous.html?.maxPageGzipKiB, fresh.html.maxPageGzipKiB);
  compare('rasters.largestKiB', previous.rasters?.largestKiB, fresh.rasters.largestKiB);
  for (const [route, current] of Object.entries(fresh.bundle.perRoute)) {
    compare(`perRoute ${route} JS`, previous.bundle?.perRoute?.[route]?.jsGzipKiB, current.jsGzipKiB);
    compare(`perRoute ${route} HTML`, previous.bundle?.perRoute?.[route]?.htmlGzipKiB, current.htmlGzipKiB);
  }
  for (const route of Object.keys(previous.bundle?.perRoute ?? {})) {
    if (!(route in fresh.bundle.perRoute)) drifts.push(`perRoute ${route}: in committed report but not in dist`);
  }

  if (drifts.length > 0) {
    console.error('gen-perf-report --check: committed src/data/perf-report.json is STALE:');
    for (const d of drifts) console.error(`  ${d}`);
    console.error('\nWhat ships changed but what the site CLAIMS did not.');
    console.error('Fix: pnpm build && node scripts/gen-perf-report.mjs && pnpm build, commit the result.');
    process.exit(1);
  }
  console.log('gen-perf-report --check: committed report matches the built dist (±5%) ✓');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------
let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
} catch {
  /* no git — leave 'unknown' */
}

const report = {
  generatedAt: new Date().toISOString().slice(0, 10),
  commit,
  ...fresh,
  budgets,
  ...(lighthouse ? { lighthouse } : {}),
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`gen-perf-report: wrote ${reportPath}`);
console.log(`  hero graph ${fresh.bundle.heroGraphGzipKiB}K gz · home pre-engine ${fresh.bundle.preHeroGzipKiB}K gz · reading max ${fresh.bundle.readingRouteMaxGzipKiB}K gz`);
console.log(`  HTML max ${fresh.html.maxPageGzipKiB}K gz · rasters ${fresh.rasters.count} (largest ${fresh.rasters.largestKiB}K)`);
console.log(lighthouse ? `  lighthouse: ${Object.keys(lighthouse.perRoute).length} route(s), measured ${lighthouse.measuredAt} (${lighthouse.environment})` : '  lighthouse: no results found (.lighthouseci absent) — run pnpm lhci autorun to fold lab numbers in');
console.log('  NOTE: the page renders this file — rebuild after regenerating so dist picks it up.');
