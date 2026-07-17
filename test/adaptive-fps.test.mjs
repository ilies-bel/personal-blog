// Adaptive FPS downgrade — unit tests for the pure helper functions exported
// from src/hero/lib/config.ts.
//
// We bundle config.ts with esbuild (the same pattern as presentation-clock.test.mjs)
// because config.ts imports from './constants' without the .ts extension, which
// Node's native type-stripping does not rewrite. Bundling resolves all dependencies
// at build time and emits a single self-contained ESM module we can data:-import.
//
// The helpers under test (shouldAdaptiveDowngrade / medianFpsFromDeltas) are PURE
// functions with no DOM / WebGL / window dependency, so the bundle runs fine on Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Stub the browser globals that config.ts touches at IMPORT TIME (none) and
// that the adaptive helpers touch at CALL TIME (also none — they are pure).
// Other functions in the module (detectDeviceTier, resolveParticleRTScale, …)
// do touch window/navigator/sessionStorage, but we never call them here.

const entry = new URL('../src/hero/lib/config.ts', import.meta.url).pathname;
const bundled = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'browser', // lets esbuild resolve Astro/browser-targeted imports without error
  logLevel: 'silent',
  // Tree-shake everything except what we actually test; preserving named exports.
  treeShaking: false,
});

// Stub window so module-level code in the bundle that branches on `typeof window`
// resolves safely. None of the test targets actually use it.
globalThis.window = globalThis;

const {
  shouldAdaptiveDowngrade,
  medianFpsFromDeltas,
  classifyGpuRenderer,
  stepDownTier,
  ADAPTIVE_FPS_FLOOR,
  ADAPTIVE_SAMPLE_MS,
} = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundled.outputFiles[0].text).toString('base64')
);

// Helpers ----------------------------------------------------------------

/** Create N identical frame-time deltas (ms) representing a given FPS. */
function deltasAt(fps, count = 20) {
  const dt = 1_000 / fps;
  return Array.from({ length: count }, () => dt);
}

// medianFpsFromDeltas ---------------------------------------------------

test('medianFpsFromDeltas: empty array returns 0', () => {
  assert.equal(medianFpsFromDeltas([]), 0);
});

test('medianFpsFromDeltas: all identical deltas → correct FPS', () => {
  // 100 ms per frame = 10 fps
  const fps = medianFpsFromDeltas(deltasAt(10));
  assert.ok(Math.abs(fps - 10) < 0.01, `expected ~10, got ${fps}`);
});

test('medianFpsFromDeltas: 60 fps deltas', () => {
  const fps = medianFpsFromDeltas(deltasAt(60));
  assert.ok(Math.abs(fps - 60) < 0.01, `expected ~60, got ${fps}`);
});

test('medianFpsFromDeltas: single element returns correct FPS', () => {
  // 16.67 ms per frame ≈ 60 fps
  const fps = medianFpsFromDeltas([1_000 / 60]);
  assert.ok(Math.abs(fps - 60) < 0.01, `expected ~60, got ${fps}`);
});

test('medianFpsFromDeltas: even-count array uses middle two values', () => {
  // Sorted deltas: [25, 25, 100, 100] → median = (25+100)/2 = 62.5 ms → 16 fps
  const fps = medianFpsFromDeltas([100, 25, 100, 25]);
  const expected = 1_000 / 62.5;
  assert.ok(Math.abs(fps - expected) < 0.01, `expected ~${expected}, got ${fps}`);
});

test('medianFpsFromDeltas: outlier slow frames do not skew median', () => {
  // 19 fast frames (16.7 ms = 60 fps) + 1 very slow (500 ms). Median should stay near 60.
  const deltas = [...deltasAt(60, 19), 500];
  const fps = medianFpsFromDeltas(deltas);
  assert.ok(fps > 50, `median should be near 60 fps, got ${fps}`);
});

// shouldAdaptiveDowngrade -----------------------------------------------

test('shouldAdaptiveDowngrade: fewer than 5 samples → no downgrade (noise guard)', () => {
  // Even if FPS looks terrible, too few samples → false.
  assert.equal(shouldAdaptiveDowngrade(deltasAt(5, 4)), false);
});

test('shouldAdaptiveDowngrade: empty array → no downgrade', () => {
  assert.equal(shouldAdaptiveDowngrade([]), false);
});

test('shouldAdaptiveDowngrade: ~10 fps (100 ms / frame) → downgrade', () => {
  // The measured baseline was ~10 fps under 4× CPU throttle.
  assert.equal(shouldAdaptiveDowngrade(deltasAt(10, 20)), true);
});

test('shouldAdaptiveDowngrade: ~25 fps → below floor → downgrade', () => {
  assert.equal(shouldAdaptiveDowngrade(deltasAt(25, 20)), true);
});

test('shouldAdaptiveDowngrade: above floor → no downgrade', () => {
  // 31 fps is clearly above the 30 fps floor — should not trigger.
  assert.equal(shouldAdaptiveDowngrade(deltasAt(ADAPTIVE_FPS_FLOOR + 1, 20)), false);
});

test('shouldAdaptiveDowngrade: ~60 fps → no downgrade', () => {
  assert.equal(shouldAdaptiveDowngrade(deltasAt(60, 20)), false);
});

test('shouldAdaptiveDowngrade: ~120 fps → no downgrade', () => {
  assert.equal(shouldAdaptiveDowngrade(deltasAt(120, 20)), false);
});

test('shouldAdaptiveDowngrade: custom floor respected', () => {
  // With a floor of 50, 40 fps should trigger.
  assert.equal(shouldAdaptiveDowngrade(deltasAt(40, 20), 50), true);
  // And 60 fps should not.
  assert.equal(shouldAdaptiveDowngrade(deltasAt(60, 20), 50), false);
});

// stepDownTier (the one-rung safety-net ladder) ---------------------------

test('stepDownTier: high → mid (one rung, not the old high→low cliff)', () => {
  assert.equal(stepDownTier('high'), 'mid');
});

test('stepDownTier: mid → low', () => {
  assert.equal(stepDownTier('mid'), 'low');
});

test('stepDownTier: low stays low (floor)', () => {
  assert.equal(stepDownTier('low'), 'low');
});

// classifyGpuRenderer (the proactive classification table) ----------------
// Pure string → class; real-world unmasked renderer strings per family.

const GPU_CASES = [
  // software rasterisers → low (the SwiftShader bench: 9-11fps on desktop-high)
  ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'low'],
  ['Google SwiftShader', 'low'],
  ['llvmpipe (LLVM 15.0.7, 256 bits)', 'low'],
  ['Microsoft Basic Render Driver', 'low'],
  // discrete NVIDIA → high
  ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
  ['ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
  // older / laptop NVIDIA → mid
  ['ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'mid'],
  ['ANGLE (NVIDIA, NVIDIA GeForce MX250 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'mid'],
  // AMD: RX → high, APU/other Radeon → mid
  ['ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
  ['ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'mid'],
  // Apple Silicon → high (mobile clamp in detectDeviceTier caps iPhones at mid)
  ['ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)', 'high'],
  ['Apple GPU', 'high'],
  // Intel iGPU → mid (the canonical "high on paper, 10fps in practice" class)
  ['ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'mid'],
  ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'mid'],
  ['Intel(R) HD Graphics 4000', 'mid'],
  // recent mobile GPUs → mid; older → low
  ['ANGLE (Qualcomm, Adreno (TM) 740, OpenGL ES 3.2)', 'mid'],
  ['ANGLE (Qualcomm, Adreno (TM) 630, OpenGL ES 3.2)', 'low'],
  ['ANGLE (ARM, Mali-G78, OpenGL ES 3.2)', 'mid'],
  ['Mali-T880', 'low'],
  ['PowerVR Rogue GE8320', 'low'],
  // masked / unknown strings → unknown (→ the fill-rate microprobe tie-breaker)
  ['', 'unknown'],
  ['WebKit WebGL', 'unknown'],
];

for (const [renderer, expected] of GPU_CASES) {
  test(`classifyGpuRenderer: ${renderer || '(empty)'} → ${expected}`, () => {
    assert.equal(classifyGpuRenderer(renderer), expected);
  });
}

// Constants sanity checks -----------------------------------------------

test('ADAPTIVE_SAMPLE_MS is a positive number (≥ 1 s)', () => {
  assert.ok(typeof ADAPTIVE_SAMPLE_MS === 'number' && ADAPTIVE_SAMPLE_MS >= 1_000);
});

test('ADAPTIVE_FPS_FLOOR is between 20 and 60', () => {
  assert.ok(ADAPTIVE_FPS_FLOOR >= 20 && ADAPTIVE_FPS_FLOOR <= 60);
});
