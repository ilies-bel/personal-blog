// Unit tests for scripts/check-bench-floors.mjs.
//
// The script is a pure Node.js module (no TypeScript, no bundling needed).
// We test its floor-checking logic by importing its internals through a
// thin wrapper — the script uses process.argv for the CLI, so we test the
// logic via its exported helpers where possible, and end-to-end via child
// process spawn for the CLI surface.
//
// IMPORTANT: the script reads a file path and exits; we test the logic that
// drives it (the violation rules) directly as pure functions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'check-bench-floors.mjs');

// --- helpers ----------------------------------------------------------------

function run(...extraArgs) {
  return spawnSync(process.execPath, [SCRIPT, ...extraArgs], {
    encoding: 'utf8',
    env: { ...process.env },
  });
}

function writeSummary(dir, data) {
  const path = join(dir, 'summary.json');
  writeFileSync(path, JSON.stringify(data));
  return path;
}

function makeTmpDir() {
  const d = join(tmpdir(), `bench-floor-test-${Date.now()}`);
  mkdirSync(d, { recursive: true });
  return d;
}

// --- tests ------------------------------------------------------------------

test('--help exits 0 and prints usage', () => {
  const r = run('--help');
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stderr}`);
  assert.match(r.stdout, /--summary/, '--help must mention --summary');
  assert.match(r.stdout, /55/, '--help must mention post fps floor');
});

test('-h exits 0', () => {
  const r = run('-h');
  assert.equal(r.status, 0);
});

test('missing summary file exits 0 with a warning (run not yet done)', () => {
  const r = run('--summary', '/nonexistent/path/bench-summary.json');
  assert.equal(r.status, 0, `expected exit 0 for missing file, got ${r.status}`);
  assert.match(r.stderr + r.stdout, /WARN|not found|skipping/i);
});

test('all floors pass → exit 0', () => {
  const tmp = makeTmpDir();
  try {
    const summary = {
      tag: 'docker',
      results: [
        { device: 'desktop', scenario: 'home', started: true, holdFps: 60, heroMode: 'poster' },
        { device: 'mid-laptop', scenario: 'home', started: true, holdFps: 60, heroMode: 'poster' },
        { device: 'low-mobile', scenario: 'home', started: true, holdFps: 60, heroMode: 'poster' },
        { device: 'desktop', scenario: 'post', started: true, holdFps: 60, heroMode: 'live' },
        { device: 'low-mobile', scenario: 'post', started: true, holdFps: 60, heroMode: 'live' },
      ],
    };
    const path = writeSummary(tmp, summary);
    const r = run('--summary', path);
    assert.equal(r.status, 0, `all floors pass → exit 0\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test('post holdFps below 55 → exit 1', () => {
  const tmp = makeTmpDir();
  try {
    const summary = {
      tag: 'docker',
      results: [
        { device: 'desktop', scenario: 'post', started: true, holdFps: 40, heroMode: 'live' },
      ],
    };
    const path = writeSummary(tmp, summary);
    const r = run('--summary', path);
    assert.equal(r.status, 1, `post fps below floor → exit 1\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /post|55/i, 'violation table must mention post or 55');
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test('post holdFps exactly 55 passes', () => {
  const tmp = makeTmpDir();
  try {
    const summary = {
      tag: null,
      results: [
        { device: 'desktop', scenario: 'post', started: true, holdFps: 55, heroMode: 'live' },
      ],
    };
    const path = writeSummary(tmp, summary);
    const r = run('--summary', path);
    assert.equal(r.status, 0, `holdFps === floor → pass\nstderr: ${r.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test('low-mobile home holdFps below 50 → exit 1', () => {
  const tmp = makeTmpDir();
  try {
    const summary = {
      tag: 'docker',
      results: [
        { device: 'low-mobile', scenario: 'home', started: true, holdFps: 40, heroMode: 'poster' },
      ],
    };
    const path = writeSummary(tmp, summary);
    const r = run('--summary', path);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /low-mobile|50/i);
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test('low-mobile home holdFps exactly 50 passes', () => {
  const tmp = makeTmpDir();
  try {
    const summary = {
      tag: 'docker',
      results: [
        { device: 'low-mobile', scenario: 'home', started: true, holdFps: 50, heroMode: 'poster' },
      ],
    };
    const path = writeSummary(tmp, summary);
    const r = run('--summary', path);
    assert.equal(r.status, 0);
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test('docker desktop home heroMode=live → exit 1', () => {
  const tmp = makeTmpDir();
  try {
    const summary = {
      tag: 'docker',
      results: [
        { device: 'desktop', scenario: 'home', started: true, holdFps: 60, heroMode: 'live' },
      ],
    };
    const path = writeSummary(tmp, summary);
    const r = run('--summary', path);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /poster|fallback/i, 'must mention poster in violation');
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test('docker mid-laptop home heroMode=live → exit 1', () => {
  const tmp = makeTmpDir();
  try {
    const summary = {
      tag: 'docker',
      results: [
        { device: 'mid-laptop', scenario: 'home', started: true, holdFps: 60, heroMode: 'live' },
      ],
    };
    const path = writeSummary(tmp, summary);
    const r = run('--summary', path);
    assert.equal(r.status, 1);
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test('non-docker desktop home heroMode=live is fine (no poster requirement on host)', () => {
  const tmp = makeTmpDir();
  try {
    const summary = {
      tag: null, // host run, not docker
      results: [
        { device: 'desktop', scenario: 'home', started: true, holdFps: 60, heroMode: 'live' },
      ],
    };
    const path = writeSummary(tmp, summary);
    const r = run('--summary', path);
    assert.equal(r.status, 0, `host run: desktop live scene is expected\nstderr: ${r.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true });
  }
});

test('failed-to-start runs are skipped (not counted as violations)', () => {
  const tmp = makeTmpDir();
  try {
    const summary = {
      tag: 'docker',
      results: [
        { device: 'desktop', scenario: 'post', started: false, holdFps: null, heroMode: null, error: 'FAILED-TO-START' },
      ],
    };
    const path = writeSummary(tmp, summary);
    const r = run('--summary', path);
    // A failed-to-start run is not a floor violation (it's a separate alert).
    assert.equal(r.status, 0, `failed-to-start is skipped\nstderr: ${r.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true });
  }
});
