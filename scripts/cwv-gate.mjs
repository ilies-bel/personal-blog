// cwv-gate.mjs — PERF-008 lab CWV gate: record-target checks + evidence archive.
//
//   node scripts/cwv-gate.mjs [--reports <dir>] [--out <file>]
//
// Run AFTER `pnpm lhci autorun` (which enforces hard limits and exits 1 if any
// ERROR assertion fails). This script reads the LHCI report JSONs written by
// that step, extracts per-route metric medians, checks them against the tighter
// record targets, prints a report table, and archives the summary to
// evidence/performance/cwv-lab.json (overwritten each run; CI archives it as a
// named artifact per SHA — see .github/workflows/ci.yml).
//
// THRESHOLDS (PERF-008):
//   Metric  lhci ERROR (lighthouserc.cjs)        Script hard (standalone backstop)  Record target
//   LCP     2500 ms (all routes except /)         2500 ms                            2000 ms
//   INP      200 ms (all routes except /)          200 ms                             150 ms
//   CLS       0.02 ERROR on ALL routes (P10)        0.10 (outer backstop)             0.02
//   TBT      200 ms (all routes except /)          200 ms                             150 ms
//
//   Home route (/): LCP / INP / TBT are WARN-only in lhci (SwiftShader WebGL
//   artifact; promoted to ERROR per INPUTS-NEEDED #8). CLS stays ERROR everywhere.
//   See lighthouserc.cjs assertMatrix and RC-1 §3.
//
// Hard limits are checked by `pnpm lhci` (lighthouserc.cjs assertMatrix).
// This script checks both tiers and exits 1 only if a hard limit is violated
// (providing a second enforcement layer when run standalone).
//
// NOTE: Field / RUM monitoring is deferred to the release-phase task.  This
// script covers the lab half of PERF-008 only.  The field half (CrUX data,
// RUM pipeline) will be tracked in a follow-up task once the site ships.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// ---------------------------------------------------------------------------
// Pure functions — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Compute the median of a numeric array.  Returns null for empty input.
 * @param {number[]} arr
 * @returns {number | null}
 */
export function median(arr) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Check a metric value against target and hard-limit thresholds.
 * Returns 'ok' | 'warn' | 'fail'.
 *
 * @param {number | null} value
 * @param {{ target: number, hard: number }} thresholds
 * @returns {'ok' | 'warn' | 'fail' | 'n/a'}
 */
export function checkThreshold(value, { target, hard }) {
  if (value === null || value === undefined) return 'n/a';
  if (value > hard) return 'fail';
  if (value > target) return 'warn';
  return 'ok';
}

// ---------------------------------------------------------------------------
// Thresholds — PERF-008
// ---------------------------------------------------------------------------

const THRESHOLDS = {
  lcp: { target: 2000, hard: 2500, unit: 'ms',    label: 'LCP' },
  inp: { target: 150,  hard: 200,  unit: 'ms',    label: 'INP' },
  cls: { target: 0.02, hard: 0.10, unit: '',      label: 'CLS' },
  tbt: { target: 150,  hard: 200,  unit: 'ms',    label: 'TBT' },
};

// Audit keys in the Lighthouse result JSON.
const AUDIT_KEYS = {
  lcp: 'largest-contentful-paint',
  inp: 'interaction-to-next-paint',
  cls: 'cumulative-layout-shift',
  tbt: 'total-blocking-time',
};

// ---------------------------------------------------------------------------
// Main — only runs when executed directly
// ---------------------------------------------------------------------------

async function main() {
  // Parse args.
  const args = process.argv.slice(2);
  const reportsArg = args[args.indexOf('--reports') + 1];
  const outArg    = args[args.indexOf('--out') + 1];

  const reportsDir = reportsArg
    ? resolve(reportsArg)
    : join(root, '.lighthouseci', 'reports');

  const outFile = outArg
    ? resolve(outArg)
    : join(root, 'evidence', 'performance', 'cwv-lab.json');

  // ---- Read LHCI report files -------------------------------------------

  if (!existsSync(reportsDir)) {
    console.error(
      `cwv-gate: reports directory not found: ${reportsDir}\n` +
      '  Run `pnpm lhci autorun` first to generate Lighthouse reports.',
    );
    process.exit(1);
  }

  const jsonFiles = readdirSync(reportsDir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('manifest'))
    .map((f) => join(reportsDir, f));

  if (jsonFiles.length === 0) {
    console.error(`cwv-gate: no Lighthouse report JSON files found in ${reportsDir}`);
    process.exit(1);
  }

  // ---- Parse reports, group by URL --------------------------------------

  /** @type {Map<string, { lcp: number[], inp: number[], cls: number[], tbt: number[] }>} */
  const byUrl = new Map();

  for (const file of jsonFiles) {
    let report;
    try {
      report = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      console.warn(`cwv-gate: skipping unreadable file: ${file}`);
      continue;
    }

    // LHCI filesystem reports are wrapped: { lhr: <LighthouseResult> }
    // or unwrapped (just the LHR directly).
    const lhr = report.lhr ?? report;
    const url = lhr.finalDisplayedUrl ?? lhr.requestedUrl ?? 'unknown';
    const audits = lhr.audits ?? {};

    if (!byUrl.has(url)) {
      byUrl.set(url, { lcp: [], inp: [], cls: [], tbt: [] });
    }
    const entry = byUrl.get(url);

    for (const [key, auditName] of Object.entries(AUDIT_KEYS)) {
      const val = audits[auditName]?.numericValue;
      if (typeof val === 'number') entry[key].push(val);
    }
  }

  if (byUrl.size === 0) {
    console.error('cwv-gate: could not parse any Lighthouse results from reports dir');
    process.exit(1);
  }

  // ---- Compute medians + check thresholds --------------------------------

  const results = [];
  let hardLimitViolations = 0;
  let targetViolations = 0;

  for (const [url, runs] of byUrl) {
    const medians = {
      lcp: median(runs.lcp),
      inp: median(runs.inp),
      cls: median(runs.cls),
      tbt: median(runs.tbt),
    };
    const verdicts = {
      lcp: checkThreshold(medians.lcp, THRESHOLDS.lcp),
      inp: checkThreshold(medians.inp, THRESHOLDS.inp),
      cls: checkThreshold(medians.cls, THRESHOLDS.cls),
      tbt: checkThreshold(medians.tbt, THRESHOLDS.tbt),
    };
    for (const v of Object.values(verdicts)) {
      if (v === 'fail') hardLimitViolations++;
      if (v === 'warn') targetViolations++;
    }
    results.push({ url, runs: runs.lcp.length, medians, verdicts });
  }

  // ---- Print table -------------------------------------------------------

  const urlWidth = Math.max(3, ...results.map((r) => r.url.length));
  const fmt = (v, unit) => (v === null || v === undefined ? '  n/a ' : `${v.toFixed(unit === '' ? 3 : 0)}${unit}`);
  const verdict = (v) => v === 'ok' ? '✓' : v === 'warn' ? '⚠' : v === 'fail' ? '✗' : '-';

  console.log('\ncwv-gate: PERF-008 lab CWV results — mid-range mobile throttle, median of 3 runs');
  console.log(
    `  ${'URL'.padEnd(urlWidth)}  ${'runs'.padStart(4)}  ${'LCP(ms)'.padStart(9)}  ${'INP(ms)'.padStart(9)}  ${'CLS'.padStart(6)}  ${'TBT(ms)'.padStart(9)}  verdict`,
  );
  for (const r of results) {
    const { lcp, inp, cls, tbt } = r.medians;
    const v = r.verdicts;
    const anyFail = Object.values(v).includes('fail');
    const anyWarn = !anyFail && Object.values(v).includes('warn');
    const rowVerdict = anyFail ? '✗ FAIL' : anyWarn ? '⚠ warn' : '✓  ok ';
    console.log(
      `  ${r.url.padEnd(urlWidth)}  ${String(r.runs).padStart(4)}  ` +
      `${fmt(lcp, 'ms').padStart(9)} ${verdict(v.lcp)}  ` +
      `${fmt(inp, 'ms').padStart(9)} ${verdict(v.inp)}  ` +
      `${fmt(cls, '').padStart(6)} ${verdict(v.cls)}  ` +
      `${fmt(tbt, 'ms').padStart(9)} ${verdict(v.tbt)}  ` +
      rowVerdict,
    );
  }

  console.log(`\n  Thresholds:`);
  for (const [, t] of Object.entries(THRESHOLDS)) {
    console.log(
      `    ${t.label.padEnd(4)}  target ≤ ${String(t.target).padStart(5)}${t.unit}   hard limit ≤ ${String(t.hard).padStart(5)}${t.unit}`,
    );
  }

  if (targetViolations > 0) {
    console.warn(
      `\n  ⚠ ${targetViolations} route×metric(s) exceeded record targets (but within hard limits).`,
    );
    console.warn('    Investigate before marking as production-ready.');
  }
  if (hardLimitViolations > 0) {
    console.error(
      `\n  ✗ ${hardLimitViolations} route×metric(s) exceeded hard limits — gate FAILED.`,
    );
    console.error('    Hard limits are enforced by `pnpm lhci` (lighthouserc.cjs assertions).');
  }

  console.log('\n  NOTE: Field/RUM monitoring deferred to release-phase task (PERF-008 field half).');

  // ---- Archive evidence --------------------------------------------------

  const sha = process.env.GITHUB_SHA
    ?? (() => {
        try { return execSync('git rev-parse HEAD', { cwd: root }).toString().trim(); }
        catch { return 'local'; }
      })();

  const summary = {
    generatedAt: new Date().toISOString(),
    sha,
    throttleProfile: 'mid-range mobile (4× CPU, Slow 4G)',
    thresholds: THRESHOLDS,
    routes: results,
    totals: {
      hardLimitViolations,
      targetViolations,
      passed: hardLimitViolations === 0,
    },
    note: 'Field/RUM monitoring deferred to release-phase task (PERF-008 field half).',
  };

  try {
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, JSON.stringify(summary, null, 2));
    console.log(`\ncwv-gate: evidence archived → ${outFile}`);
  } catch (err) {
    console.warn(`cwv-gate: could not write evidence file: ${err.message}`);
  }

  // ---- Exit code ---------------------------------------------------------

  if (hardLimitViolations > 0) {
    process.exit(1);
  }
  console.log('cwv-gate: all hard limits satisfied ✓');
}

// Guard so importing this module in tests doesn't trigger side effects.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('cwv-gate: unexpected error:', err);
    process.exit(1);
  });
}
