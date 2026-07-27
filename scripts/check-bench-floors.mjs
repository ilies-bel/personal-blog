#!/usr/bin/env node
// Asserts smoothness floors from a bench summary file.
//
// Usage:
//   node scripts/check-bench-floors.mjs [--summary <path>] [--help]
//
// Floors checked (against the supplied summary):
//   1. Post routes: every device x post scenario must hold >= POST_HOLD_FPS_FLOOR fps.
//   2. Home / low-mobile: holdFps >= LOW_MOBILE_HOME_FLOOR fps.
//   3. Home / desktop and mid-laptop on docker tag: heroMode must be 'poster'
//      (i.e. the software-GL fallback must have fired, NOT the live WebGL scene).
//   4. Every device x scenario on the 4gb tag: holdFps >= FOURGB_HOLD_FPS_FLOOR.
//
// Two classes of run are never gated:
//   • FILTERED runs (BENCH_DEVICES / BENCH_SCENARIOS) — a partial pass reads
//     exactly like a full one, so the script exits 1 rather than mislead.
//   • DIAGNOSTIC devices ("diagnostic": true in bench/devices.json) — profiles
//     that force a configuration the product never serves. Recorded, not gated.
//
// The default summary path is evidence/performance/bench-summary-docker.json so the
// script targets the SwiftShader docker run out-of-the-box. Pass --summary to override.
//
// Exit 0 when all floors pass; exit 1 with a formatted violation table otherwise.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const POST_HOLD_FPS_FLOOR = 55;
const LOW_MOBILE_HOME_FLOOR = 50;
// The 4GB bar: on a 4GB / 2-CPU SwiftShader container EVERY device x scenario
// must hold at least this. Deliberately lower than POST_HOLD_FPS_FLOOR — this
// is the constrained-hardware floor, not the healthy-hardware one — and it
// applies to every row rather than a named device, because the whole point of
// the 4gb profile is that nothing gets a pass.
const FOURGB_HOLD_FPS_FLOOR = 45;

// --- CLI --------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
check-bench-floors.mjs — assert WebGL hero smoothness floors from a bench summary

Usage:
  node scripts/check-bench-floors.mjs [--summary <path>] [--help]

Options:
  --summary <path>   Path to bench summary JSON.
                     Default: evidence/performance/bench-summary-docker.json
  --help, -h         Show this help text and exit 0.

Floors asserted:
  • Post routes (all devices):    holdFps >= ${POST_HOLD_FPS_FLOOR} fps
  • Home / low-mobile:            holdFps >= ${LOW_MOBILE_HOME_FLOOR} fps
  • Home / desktop + mid-laptop   heroMode must be 'poster' (only when summary
    (docker-tagged runs only):    tag === 'docker', i.e. software-GL run)
  • Every device x scenario       holdFps >= ${FOURGB_HOLD_FPS_FLOOR} fps (only when summary
    (4gb-tagged runs only):       tag === '4gb', i.e. 4GB/2-CPU container run)

Exit codes:
  0  All floors pass (or summary does not yet exist — printed as a warning).
  1  One or more floors violated, or the summary is a filtered (partial) run.
`.trim());
  process.exit(0);
}

const summaryIdx = args.indexOf('--summary');
const summaryPath = summaryIdx !== -1
  ? args[summaryIdx + 1]
  : join(ROOT, 'evidence', 'performance', 'bench-summary-docker.json');

if (!summaryPath) {
  console.error('check-bench-floors: --summary requires a path argument');
  process.exit(1);
}

// --- load summary -----------------------------------------------------------

let summary;
try {
  summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
} catch (err) {
  if (err.code === 'ENOENT') {
    console.warn(`[check-bench-floors] WARN: summary not found at ${summaryPath} — skipping floor check (run pnpm bench:docker first)`);
    process.exit(0);
  }
  console.error(`[check-bench-floors] ERROR: could not read ${summaryPath}: ${err.message}`);
  process.exit(1);
}

const results = summary.results ?? [];
const isDockerTag = summary.tag === 'docker';
const isFourGbTag = summary.tag === '4gb';

// A filtered run (BENCH_DEVICES / BENCH_SCENARIOS) covers only part of the
// matrix, so passing it would mean "the profiles I bothered to run are fine" —
// which reads identically to a real pass. Refuse rather than mislead.
if (summary.filtered) {
  console.error(
    `[check-bench-floors] ERROR: ${summaryPath} is a FILTERED run ` +
    `(devices=${summary.deviceFilter?.join(',') ?? 'all'}, scenarios=${summary.scenarioFilter?.join(',') ?? 'all'}). ` +
    `Floors must be gated on a full-matrix run — re-run without BENCH_DEVICES/BENCH_SCENARIOS.`,
  );
  process.exit(1);
}

// --- floor checks -----------------------------------------------------------

/**
 * @typedef {{ rule: string, device: string, scenario: string, actual: string, floor: string }} Violation
 */

/** @type {Violation[]} */
const violations = [];

for (const r of results) {
  if (!r.started) continue; // skip failed-to-start runs — a separate alert
  // Diagnostic profiles (bench/devices.json "diagnostic": true) force a
  // configuration the product never serves — e.g. ?tier= pinning the live WebGL
  // scene onto a software rasteriser, where the shipped code path is the poster
  // fallback. Their numbers are recorded and worth tracking, but holding them to
  // a smoothness floor would assert a guarantee about a state no visitor reaches.
  if (r.diagnostic) continue;

  const scenario = r.scenario ?? '';
  const device = r.device ?? '';

  // 0. The 4GB bar — every device, every scenario, on a 4gb-tagged summary.
  if (isFourGbTag) {
    const fps = r.holdFps ?? null;
    if (fps !== null && fps < FOURGB_HOLD_FPS_FLOOR) {
      violations.push({
        rule: `4gb hold >= ${FOURGB_HOLD_FPS_FLOOR} fps`,
        device,
        scenario,
        actual: `${fps} fps`,
        floor: `${FOURGB_HOLD_FPS_FLOOR} fps`,
      });
    }
  }

  // 1. Post routes: every device, holdFps >= POST_HOLD_FPS_FLOOR
  if (scenario === 'post') {
    const fps = r.holdFps ?? null;
    if (fps !== null && fps < POST_HOLD_FPS_FLOOR) {
      violations.push({
        rule: `post hold >= ${POST_HOLD_FPS_FLOOR} fps`,
        device,
        scenario,
        actual: `${fps} fps`,
        floor: `${POST_HOLD_FPS_FLOOR} fps`,
      });
    }
  }

  if (scenario === 'home') {
    // 2. Low-mobile home: holdFps >= LOW_MOBILE_HOME_FLOOR
    if (device === 'low-mobile') {
      const fps = r.holdFps ?? null;
      if (fps !== null && fps < LOW_MOBILE_HOME_FLOOR) {
        violations.push({
          rule: `low-mobile home hold >= ${LOW_MOBILE_HOME_FLOOR} fps`,
          device,
          scenario,
          actual: `${fps} fps`,
          floor: `${LOW_MOBILE_HOME_FLOOR} fps`,
        });
      }
    }

    // 3. Docker desktop + mid-laptop: heroMode must be 'poster'
    //    (the software-GL fallback must have fired, not the live WebGL scene).
    if (isDockerTag && (device === 'desktop' || device === 'mid-laptop')) {
      const mode = r.heroMode ?? null;
      if (mode !== 'poster') {
        violations.push({
          rule: `docker home must boot poster fallback (not live scene)`,
          device,
          scenario,
          actual: mode !== null ? `heroMode=${mode}` : 'heroMode=null (scene-ready not observed)',
          floor: `heroMode=poster`,
        });
      }
    }
  }
}

// --- report -----------------------------------------------------------------

if (violations.length === 0) {
  const deviceCount = new Set(results.map((r) => r.device)).size;
  const tag = summary.tag ? ` [tag=${summary.tag}]` : '';
  console.log(`[check-bench-floors] ✓ All floors pass${tag} (${results.length} runs, ${deviceCount} devices)`);
  process.exit(0);
}

console.error(`[check-bench-floors] ✗ ${violations.length} floor violation${violations.length === 1 ? '' : 's'}:\n`);

// Print a formatted violation table.
const cols = ['rule', 'device', 'scenario', 'actual', 'floor'];
const widths = cols.map((c) =>
  Math.max(c.length, ...violations.map((v) => String(v[c] ?? '').length)),
);
const line = (cells) => cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ');
console.error(line(cols));
console.error(widths.map((w) => '-'.repeat(w)).join('  '));
for (const v of violations) console.error(line(cols.map((c) => v[c] ?? '')));
console.error('');

process.exit(1);
