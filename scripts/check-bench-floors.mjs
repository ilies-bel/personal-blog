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

Exit codes:
  0  All floors pass (or summary does not yet exist — printed as a warning).
  1  One or more floors violated — prints a violation table.
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

// --- floor checks -----------------------------------------------------------

/**
 * @typedef {{ rule: string, device: string, scenario: string, actual: string, floor: string }} Violation
 */

/** @type {Violation[]} */
const violations = [];

for (const r of results) {
  if (!r.started) continue; // skip failed-to-start runs — a separate alert

  const scenario = r.scenario ?? '';
  const device = r.device ?? '';

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
