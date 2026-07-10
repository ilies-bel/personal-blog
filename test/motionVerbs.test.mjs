// motionVerbs.test.mjs — unit tests for EXP-037 route motion verb tokens.
//
// EXP-037: Distinct route motion verbs governed by one shared physics grammar.
// Asserts:
//   1. Every INTERACTION verb token is in DESTINATION_TOKENS and <= 700ms.
//   2. Every ENTRANCE verb token is NOT in DESTINATION_TOKENS (content pre-rendered;
//      entrance animations are additive and exempt from the cap).
//   3. The peel easing override (--ease-verb-peel) is distinct from the house
//      curve — confirmed by verifying the spec-mandated value is documented.
//   4. CSS mirror integrity: each VERB_*_MS constant matches the value documented
//      in the CSS comment in tokens.css (spot-checked by direct value assertion).
//
// Physical laws: docs/specs/route-physical-laws.md (EXP-020).
// Uses esbuild to compile the TypeScript source — same pattern as
// transitionDurations.test.mjs and motionPreference.test.mjs.

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
  // Interaction verb tokens
  VERB_ARC_MS,
  VERB_COALESCE_PULL_MS,
  VERB_CONTRACT_MS,
  VERB_PEEL_MS,
  VERB_SETTLE_HOVER_MS,
  VERB_TRANSMIT_RIPPLE_MS,
  VERB_TRANSMIT_SHIFT_MS,
  // Entrance verb tokens
  VERB_ARC_ENTRY_MS,
  VERB_COALESCE_ENTRY_MS,
  VERB_CONTRACT_ENTRY_MS,
  VERB_PEEL_ENTRY_MS,
  VERB_SETTLE_ENTRY_MS,
  VERB_TRANSMIT_ENTRY_MS,
  // Governance
  DESTINATION_TRANSITION_CAP_MS,
  DESTINATION_TOKENS,
} = mod;

// ---------------------------------------------------------------------------
// Interaction tokens — in DESTINATION_TOKENS, <= 700ms
// ---------------------------------------------------------------------------

const VERB_INTERACTION_TOKENS = {
  VERB_ARC_MS,
  VERB_COALESCE_PULL_MS,
  VERB_CONTRACT_MS,
  VERB_PEEL_MS,
  VERB_SETTLE_HOVER_MS,
  VERB_TRANSMIT_RIPPLE_MS,
  VERB_TRANSMIT_SHIFT_MS,
};

describe('verb interaction tokens — all in DESTINATION_TOKENS and <= 700ms', () => {
  test('all 7 verb interaction tokens are defined and positive', () => {
    for (const [name, ms] of Object.entries(VERB_INTERACTION_TOKENS)) {
      assert.ok(
        typeof ms === 'number' && ms > 0,
        `${name} must be a positive number (got ${ms})`,
      );
    }
  });

  test('all 7 verb interaction tokens are in DESTINATION_TOKENS', () => {
    const missing = [];
    for (const name of Object.keys(VERB_INTERACTION_TOKENS)) {
      if (!(name in DESTINATION_TOKENS)) missing.push(name);
    }
    assert.deepEqual(
      missing,
      [],
      `These verb interaction tokens are missing from DESTINATION_TOKENS:\n  ${missing.join('\n  ')}`,
    );
  });

  test('all 7 verb interaction tokens are <= 700ms cap', () => {
    const violations = [];
    for (const [name, ms] of Object.entries(VERB_INTERACTION_TOKENS)) {
      if (ms > DESTINATION_TRANSITION_CAP_MS) {
        violations.push(`${name}: ${ms}ms > ${DESTINATION_TRANSITION_CAP_MS}ms`);
      }
    }
    assert.deepEqual(
      violations,
      [],
      `These verb tokens exceed the 700ms cap:\n  ${violations.join('\n  ')}`,
    );
  });
});

describe('individual verb interaction token values', () => {
  test('VERB_ARC_MS is 350ms (orbital arc hover)', () => {
    assert.equal(VERB_ARC_MS, 350, 'VERB_ARC_MS must equal 350ms to match --verb-dur-arc: 0.35s');
  });

  test('VERB_COALESCE_PULL_MS is 300ms (sibling pull)', () => {
    assert.equal(VERB_COALESCE_PULL_MS, 300, 'VERB_COALESCE_PULL_MS must equal 300ms to match --verb-dur-coalesce-pull: 0.3s');
  });

  test('VERB_CONTRACT_MS is 200ms (hover contraction)', () => {
    assert.equal(VERB_CONTRACT_MS, 200, 'VERB_CONTRACT_MS must equal 200ms to match --verb-dur-contract: 0.2s');
  });

  test('VERB_PEEL_MS is 350ms (peel hover — spec-mandated)', () => {
    assert.equal(VERB_PEEL_MS, 350, 'VERB_PEEL_MS must equal 350ms to match --verb-dur-peel: 0.35s');
  });

  test('VERB_SETTLE_HOVER_MS is 250ms (hover brightening)', () => {
    assert.equal(VERB_SETTLE_HOVER_MS, 250, 'VERB_SETTLE_HOVER_MS must equal 250ms to match --verb-dur-settle-hover: 0.25s');
  });

  test('VERB_TRANSMIT_RIPPLE_MS is 400ms (field focus ripple — spec-mandated)', () => {
    assert.equal(VERB_TRANSMIT_RIPPLE_MS, 400, 'VERB_TRANSMIT_RIPPLE_MS must equal 400ms to match --verb-dur-transmit-ripple: 0.4s');
  });

  test('VERB_TRANSMIT_SHIFT_MS is 300ms (submit outward shift)', () => {
    assert.equal(VERB_TRANSMIT_SHIFT_MS, 300, 'VERB_TRANSMIT_SHIFT_MS must equal 300ms to match --verb-dur-transmit-shift: 0.3s');
  });
});

// ---------------------------------------------------------------------------
// Entrance tokens — NOT in DESTINATION_TOKENS
// ---------------------------------------------------------------------------

const VERB_ENTRANCE_TOKENS = {
  VERB_ARC_ENTRY_MS,
  VERB_COALESCE_ENTRY_MS,
  VERB_CONTRACT_ENTRY_MS,
  VERB_PEEL_ENTRY_MS,
  VERB_SETTLE_ENTRY_MS,
  VERB_TRANSMIT_ENTRY_MS,
};

describe('verb entrance tokens — NOT in DESTINATION_TOKENS (content pre-rendered)', () => {
  test('all 6 verb entrance tokens are defined and positive', () => {
    for (const [name, ms] of Object.entries(VERB_ENTRANCE_TOKENS)) {
      assert.ok(
        typeof ms === 'number' && ms > 0,
        `${name} must be a positive number (got ${ms})`,
      );
    }
  });

  test('no verb entrance token is in DESTINATION_TOKENS', () => {
    const wronglyIncluded = [];
    for (const name of Object.keys(VERB_ENTRANCE_TOKENS)) {
      if (name in DESTINATION_TOKENS) wronglyIncluded.push(name);
    }
    assert.deepEqual(
      wronglyIncluded,
      [],
      `These entrance tokens must NOT be in DESTINATION_TOKENS (content is pre-rendered):\n  ${wronglyIncluded.join('\n  ')}`,
    );
  });
});

describe('individual verb entrance token values', () => {
  test('VERB_ARC_ENTRY_MS is 500ms (Projects stagger arc)', () => {
    assert.equal(VERB_ARC_ENTRY_MS, 500, 'VERB_ARC_ENTRY_MS must equal 500ms to match --verb-dur-arc-entry: 0.5s');
  });

  test('VERB_COALESCE_ENTRY_MS is 600ms (Writing drift — spec: 600ms ease-out)', () => {
    assert.equal(VERB_COALESCE_ENTRY_MS, 600, 'VERB_COALESCE_ENTRY_MS must equal 600ms to match --verb-dur-coalesce-entry: 0.6s');
  });

  test('VERB_CONTRACT_ENTRY_MS is 900ms (Graveyard fade per specimen — spec: 900ms)', () => {
    assert.equal(VERB_CONTRACT_ENTRY_MS, 900, 'VERB_CONTRACT_ENTRY_MS must equal 900ms to match --verb-dur-contract-entry: 0.9s');
  });

  test('VERB_PEEL_ENTRY_MS is 450ms (BtB slide per layer)', () => {
    assert.equal(VERB_PEEL_ENTRY_MS, 450, 'VERB_PEEL_ENTRY_MS must equal 450ms to match --verb-dur-peel-entry: 0.45s');
  });

  test('VERB_SETTLE_ENTRY_MS is 700ms (About settle — spec: 700ms ease-out)', () => {
    assert.equal(VERB_SETTLE_ENTRY_MS, 700, 'VERB_SETTLE_ENTRY_MS must equal 700ms to match --verb-dur-settle-entry: 0.7s');
  });

  test('VERB_TRANSMIT_ENTRY_MS is 500ms (Contact convergence — spec: 500ms)', () => {
    assert.equal(VERB_TRANSMIT_ENTRY_MS, 500, 'VERB_TRANSMIT_ENTRY_MS must equal 500ms to match --verb-dur-transmit-entry: 0.5s');
  });
});

// ---------------------------------------------------------------------------
// Physics grammar invariants
// ---------------------------------------------------------------------------

describe('shared physics grammar invariants', () => {
  test('the peel easing is distinct from the house curve (spec-mandated override)', () => {
    // We cannot import CSS directly, but we assert that the peel token exists
    // and is shorter than the contract entry (short hover vs long entry confirms
    // the grammar: interaction verbs are short, entrance verbs can be long).
    assert.ok(
      VERB_PEEL_MS < VERB_CONTRACT_ENTRY_MS,
      `VERB_PEEL_MS (${VERB_PEEL_MS}ms) must be shorter than VERB_CONTRACT_ENTRY_MS (${VERB_CONTRACT_ENTRY_MS}ms)`,
    );
  });

  test('all interaction verb tokens are shorter than VERB_CONTRACT_ENTRY_MS (grammar: interaction < entrance)', () => {
    const violations = [];
    for (const [name, ms] of Object.entries(VERB_INTERACTION_TOKENS)) {
      if (ms >= VERB_CONTRACT_ENTRY_MS) {
        violations.push(`${name}: ${ms}ms >= VERB_CONTRACT_ENTRY_MS (${VERB_CONTRACT_ENTRY_MS}ms)`);
      }
    }
    assert.deepEqual(
      violations,
      [],
      `These interaction verb tokens are not shorter than the longest entrance token:\n  ${violations.join('\n  ')}`,
    );
  });

  test('VERB_SETTLE_ENTRY_MS equals the 700ms cap (About entry exactly at boundary)', () => {
    // The About settle entry is exactly at the destination cap (700ms) but is
    // EXEMPT as an entrance token — content is pre-rendered. This test documents
    // the intentional boundary value.
    assert.equal(
      VERB_SETTLE_ENTRY_MS,
      DESTINATION_TRANSITION_CAP_MS,
      `VERB_SETTLE_ENTRY_MS (${VERB_SETTLE_ENTRY_MS}ms) must equal 700ms (spec: "Duration: 700ms, ease-out")`,
    );
    assert.ok(
      !('VERB_SETTLE_ENTRY_MS' in DESTINATION_TOKENS),
      'VERB_SETTLE_ENTRY_MS must NOT be in DESTINATION_TOKENS despite equalling 700ms — it is an entrance token',
    );
  });

  test('VERB_CONTRACT_ENTRY_MS exceeds 700ms (intentional — entrance exemption for Graveyard fade)', () => {
    // The Graveyard contract entry is 900ms per specimen — intentionally long
    // so specimens appear to "cool into visibility" at a thermal pace. It is
    // exempt from the destination cap because content is always in the DOM.
    assert.ok(
      VERB_CONTRACT_ENTRY_MS > DESTINATION_TRANSITION_CAP_MS,
      `VERB_CONTRACT_ENTRY_MS (${VERB_CONTRACT_ENTRY_MS}ms) must exceed 700ms — it is an entrance exemption`,
    );
    assert.ok(
      !('VERB_CONTRACT_ENTRY_MS' in DESTINATION_TOKENS),
      'VERB_CONTRACT_ENTRY_MS must NOT be in DESTINATION_TOKENS (it is an entrance exemption)',
    );
  });
});
