// transitionDurations — unit test for the centralized transition duration tokens.
//
// EXP-014: Cross-route transition contract.
// Asserts that every DESTINATION and INTERACTION duration token satisfies the
// 700ms cap defined in DESTINATION_TRANSITION_CAP_MS, and that set-piece tokens
// (WARP_JUMP_MS) are correctly documented as exempt.
//
// Uses esbuild to compile the TypeScript source — exactly the same pattern as
// motionPreference.test.mjs and contextRegistry.test.mjs. No browser globals
// are needed because transitionDurations.ts is pure numeric exports.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// ---------------------------------------------------------------------------
// Compile the real implementation
// ---------------------------------------------------------------------------

const entry = new URL('../src/lib/transitionDurations.ts', import.meta.url).pathname;
const bundled = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'neutral',
  define: { 'import.meta.env.DEV': 'false' },
  logLevel: 'silent',
});

const mod = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundled.outputFiles[0].text).toString('base64'),
);

const {
  WARP_JUMP_MS,
  WARP_ARRIVE_MS,
  WARP_NAV_BEFORE_END_MS,
  VT_SETTLE_MS,
  VT_RISE_MS,
  PAGE_ENTER_MS,
  PAGE_ENTER_ROWS_MS,
  DECODE_HOVER_MS,
  CARD_FLIP_MS,
  DESTINATION_TRANSITION_CAP_MS,
  DESTINATION_TOKENS,
} = mod;

// ---------------------------------------------------------------------------
// Cap constant
// ---------------------------------------------------------------------------

describe('DESTINATION_TRANSITION_CAP_MS', () => {
  test('is 700', () => {
    assert.equal(DESTINATION_TRANSITION_CAP_MS, 700,
      'The destination-transition cap must be exactly 700ms');
  });
});

// ---------------------------------------------------------------------------
// DESTINATION_TOKENS — every entry must satisfy the cap
// ---------------------------------------------------------------------------

describe('DESTINATION_TOKENS — all entries <= 700ms', () => {
  test('DESTINATION_TOKENS is a non-empty object', () => {
    assert.ok(
      typeof DESTINATION_TOKENS === 'object' && DESTINATION_TOKENS !== null,
      'DESTINATION_TOKENS must be an object',
    );
    assert.ok(
      Object.keys(DESTINATION_TOKENS).length > 0,
      'DESTINATION_TOKENS must contain at least one entry',
    );
  });

  test('every destination token value is a positive number', () => {
    for (const [name, ms] of Object.entries(DESTINATION_TOKENS)) {
      assert.ok(
        typeof ms === 'number' && ms > 0,
        `${name} must be a positive number (got ${ms})`,
      );
    }
  });

  test('every destination token is <= DESTINATION_TRANSITION_CAP_MS (700ms)', () => {
    const violations = [];
    for (const [name, ms] of Object.entries(DESTINATION_TOKENS)) {
      if (ms > DESTINATION_TRANSITION_CAP_MS) {
        violations.push(`${name}: ${ms}ms > ${DESTINATION_TRANSITION_CAP_MS}ms`);
      }
    }
    assert.deepEqual(
      violations,
      [],
      `These destination tokens exceed the 700ms cap:\n  ${violations.join('\n  ')}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Individual token assertions
// ---------------------------------------------------------------------------

describe('warp transition tokens', () => {
  test('WARP_ARRIVE_MS is <= 700ms (destination: streaks fade over loaded content)', () => {
    assert.ok(
      WARP_ARRIVE_MS <= DESTINATION_TRANSITION_CAP_MS,
      `WARP_ARRIVE_MS (${WARP_ARRIVE_MS}ms) exceeds the 700ms cap`,
    );
  });

  test('WARP_ARRIVE_MS is present in DESTINATION_TOKENS', () => {
    assert.ok(
      'WARP_ARRIVE_MS' in DESTINATION_TOKENS,
      'WARP_ARRIVE_MS must appear in DESTINATION_TOKENS so future regressions are caught',
    );
  });

  test('WARP_JUMP_MS is NOT in DESTINATION_TOKENS (set-piece; exempt from cap)', () => {
    // The jump-out is a narrative departure choreography, not a content gate.
    // Navigation fires at the flash apex BEFORE the jump ends, so content loads
    // while the canvas is still white — the jump never gates the destination.
    assert.ok(
      !('WARP_JUMP_MS' in DESTINATION_TOKENS),
      'WARP_JUMP_MS must not be in DESTINATION_TOKENS (it is exempt as a set-piece)',
    );
  });

  test('WARP_JUMP_MS exceeds 700ms (set-piece departure, intentionally long)', () => {
    assert.ok(
      WARP_JUMP_MS > DESTINATION_TRANSITION_CAP_MS,
      `WARP_JUMP_MS (${WARP_JUMP_MS}ms) should be a deliberate set-piece longer than 700ms`,
    );
  });

  test('WARP_NAV_BEFORE_END_MS is less than WARP_JUMP_MS', () => {
    // Navigation must fire before the jump ends.
    assert.ok(
      WARP_NAV_BEFORE_END_MS < WARP_JUMP_MS,
      `WARP_NAV_BEFORE_END_MS (${WARP_NAV_BEFORE_END_MS}ms) must be less than WARP_JUMP_MS (${WARP_JUMP_MS}ms)`,
    );
  });

  test('navigation fires at the flash apex (WARP_JUMP_MS - WARP_NAV_BEFORE_END_MS < WARP_JUMP_MS)', () => {
    const navAt = WARP_JUMP_MS - WARP_NAV_BEFORE_END_MS;
    assert.ok(
      navAt > 0 && navAt < WARP_JUMP_MS,
      `Navigation timing (${navAt}ms) must be between 0 and WARP_JUMP_MS (${WARP_JUMP_MS}ms)`,
    );
  });
});

describe('view-transition tokens', () => {
  test('VT_SETTLE_MS is <= 700ms', () => {
    assert.ok(
      VT_SETTLE_MS <= DESTINATION_TRANSITION_CAP_MS,
      `VT_SETTLE_MS (${VT_SETTLE_MS}ms) exceeds 700ms`,
    );
  });

  test('VT_RISE_MS is <= 700ms', () => {
    assert.ok(
      VT_RISE_MS <= DESTINATION_TRANSITION_CAP_MS,
      `VT_RISE_MS (${VT_RISE_MS}ms) exceeds 700ms`,
    );
  });

  test('VT_SETTLE_MS is in DESTINATION_TOKENS', () => {
    assert.ok('VT_SETTLE_MS' in DESTINATION_TOKENS);
  });

  test('VT_RISE_MS is in DESTINATION_TOKENS', () => {
    assert.ok('VT_RISE_MS' in DESTINATION_TOKENS);
  });

  test('settle is faster than rise (outgoing move should be quicker)', () => {
    assert.ok(
      VT_SETTLE_MS < VT_RISE_MS,
      `VT_SETTLE_MS (${VT_SETTLE_MS}ms) should be shorter than VT_RISE_MS (${VT_RISE_MS}ms) — the incoming rise owns the moment`,
    );
  });
});

describe('decode hover token', () => {
  test('DECODE_HOVER_MS is <= 700ms', () => {
    assert.ok(
      DECODE_HOVER_MS <= DESTINATION_TRANSITION_CAP_MS,
      `DECODE_HOVER_MS (${DECODE_HOVER_MS}ms) exceeds 700ms`,
    );
  });

  test('DECODE_HOVER_MS is in DESTINATION_TOKENS', () => {
    assert.ok('DECODE_HOVER_MS' in DESTINATION_TOKENS);
  });
});

describe('hard-load entrance tokens (exempt from cap — content is pre-rendered)', () => {
  test('PAGE_ENTER_MS is defined and positive', () => {
    assert.ok(typeof PAGE_ENTER_MS === 'number' && PAGE_ENTER_MS > 0);
  });

  test('PAGE_ENTER_ROWS_MS is defined and positive', () => {
    assert.ok(typeof PAGE_ENTER_ROWS_MS === 'number' && PAGE_ENTER_ROWS_MS > 0);
  });

  test('PAGE_ENTER_MS is NOT in DESTINATION_TOKENS (content pre-rendered; animation is additive)', () => {
    assert.ok(
      !('PAGE_ENTER_MS' in DESTINATION_TOKENS),
      'PAGE_ENTER_MS must not be in DESTINATION_TOKENS — content is always pre-rendered; the animation is additive only',
    );
  });

  test('PAGE_ENTER_ROWS_MS is NOT in DESTINATION_TOKENS', () => {
    assert.ok(
      !('PAGE_ENTER_ROWS_MS' in DESTINATION_TOKENS),
      'PAGE_ENTER_ROWS_MS must not be in DESTINATION_TOKENS',
    );
  });
});

describe('card flip token (reserved — not yet implemented)', () => {
  test('CARD_FLIP_MS is defined and <= 700ms', () => {
    assert.ok(typeof CARD_FLIP_MS === 'number' && CARD_FLIP_MS > 0);
    assert.ok(
      CARD_FLIP_MS <= DESTINATION_TRANSITION_CAP_MS,
      `CARD_FLIP_MS (${CARD_FLIP_MS}ms) exceeds 700ms — fix before card-flip component ships`,
    );
  });

  test('CARD_FLIP_MS is in DESTINATION_TOKENS (reserved for future implementation)', () => {
    assert.ok('CARD_FLIP_MS' in DESTINATION_TOKENS,
      'CARD_FLIP_MS must be in DESTINATION_TOKENS so the cap is enforced once the component ships',
    );
  });
});

// ---------------------------------------------------------------------------
// CSS mirror values — verify the JS constants match the documented CSS values.
// CSS custom properties cannot be imported here, but these assertions act as
// a documentation gate: if you change the JS, this test will remind you to
// update tokens.css too, and vice versa.
// ---------------------------------------------------------------------------

describe('CSS mirror integrity (JS constants must match tokens.css --transition-dur-*)', () => {
  test('VT_SETTLE_MS matches the CSS --transition-dur-settle: 0.25s = 250ms', () => {
    assert.equal(VT_SETTLE_MS, 250, 'VT_SETTLE_MS must equal 250ms to match --transition-dur-settle: 0.25s');
  });

  test('VT_RISE_MS matches the CSS --transition-dur-rise: 0.45s = 450ms', () => {
    assert.equal(VT_RISE_MS, 450, 'VT_RISE_MS must equal 450ms to match --transition-dur-rise: 0.45s');
  });

  test('PAGE_ENTER_MS matches the CSS --transition-dur-page-enter: 0.6s = 600ms', () => {
    assert.equal(PAGE_ENTER_MS, 600, 'PAGE_ENTER_MS must equal 600ms to match --transition-dur-page-enter: 0.6s');
  });

  test('PAGE_ENTER_ROWS_MS matches the CSS --transition-dur-page-enter-rows: 0.5s = 500ms', () => {
    assert.equal(PAGE_ENTER_ROWS_MS, 500, 'PAGE_ENTER_ROWS_MS must equal 500ms to match --transition-dur-page-enter-rows: 0.5s');
  });
});
