// contextRegistry — cap invariants.
//
// Bundles the TypeScript source with esbuild (same pattern as
// presentation-clock.test.mjs) so the REAL implementation is exercised,
// not an inline replica. The tests verify the BEHAVIOUR (acquire grants /
// denies slots, release frees them, underflow is safe) through the module's
// public interface only.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const entry = new URL('../src/hero/scene/contextRegistry.ts', import.meta.url).pathname;
const bundled = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  write: false,
  // 'neutral' keeps import.meta intact so the module runs in Node.js.
  // Define DEV=false so the dev-only warnings are dead-code eliminated.
  platform: 'neutral',
  define: { 'import.meta.env.DEV': 'false' },
  logLevel: 'silent',
});
const mod = await import(
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
);
const { acquire, release, liveContextCount, _resetForTest, CONTEXT_CAP } = mod;

// Helper: reset the singleton between tests so each starts from a known state.
function reset() {
  _resetForTest();
}

describe('contextRegistry', () => {
  test('CONTEXT_CAP equals 2', () => {
    assert.equal(CONTEXT_CAP, 2);
  });

  test('acquire grants up to CONTEXT_CAP slots', () => {
    reset();
    assert.equal(acquire(), true, 'first acquire');
    assert.equal(liveContextCount(), 1);
    assert.equal(acquire(), true, 'second acquire');
    assert.equal(liveContextCount(), 2);
    reset();
  });

  test('acquire returns false when cap is full', () => {
    reset();
    acquire(); acquire();
    assert.equal(acquire(), false, 'third acquire must be denied');
    assert.equal(liveContextCount(), CONTEXT_CAP, 'count must not exceed cap');
    reset();
  });

  test('release decrements the live count', () => {
    reset();
    acquire(); acquire();
    release();
    assert.equal(liveContextCount(), 1);
    reset();
  });

  test('releasing a slot allows a new acquire to succeed', () => {
    reset();
    acquire(); acquire();
    release();
    assert.equal(acquire(), true, 'freed slot should be re-acquirable');
    assert.equal(liveContextCount(), CONTEXT_CAP);
    reset();
  });

  test('release does not underflow below 0', () => {
    reset();
    release(); // release when already at 0
    assert.equal(liveContextCount(), 0, 'count must not go negative');
    reset();
  });

  test('full acquire/release cycle returns count to 0', () => {
    reset();
    acquire(); acquire();
    release(); release();
    assert.equal(liveContextCount(), 0);
    reset();
  });

  test('liveContextCount reflects every acquire and release', () => {
    reset();
    assert.equal(liveContextCount(), 0);
    acquire();
    assert.equal(liveContextCount(), 1);
    acquire();
    assert.equal(liveContextCount(), 2);
    release();
    assert.equal(liveContextCount(), 1);
    release();
    assert.equal(liveContextCount(), 0);
    reset();
  });
});
