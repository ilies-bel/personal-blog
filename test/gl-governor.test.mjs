// GL governor — the 2-context WebGL budget's token policy, pinned.
//
// Unlike the scene-curve/transitions tests (which hand-translate shader math),
// this suite imports the REAL module: glGovernor.ts is pure erasable TypeScript
// (no GL, no DOM), and node >= 22.18 strips types on import — the same
// mechanism scripts/inspect-joins.mjs uses for cockpitGeometry.ts. So the
// policy asserted here is the policy production runs, not a copy that drifts.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGlGovernor,
  MAX_CONTEXTS,
  PRIORITY_HERO,
  PRIORITY_AMBIENT,
  PRIORITY_FIGURE,
} from '../src/hero/lib/glGovernor.ts';

test('grants freely below the cap', () => {
  const gov = createGlGovernor();
  const a = gov.acquire({ priority: PRIORITY_FIGURE, onEvict: () => {} });
  const b = gov.acquire({ priority: PRIORITY_FIGURE, onEvict: () => {} });
  assert.ok(a, 'first grant');
  assert.ok(b, 'second grant');
  assert.equal(gov.liveCount(), MAX_CONTEXTS);
});

test('denies an equal-priority requester when full (no equal-evicts-equal)', () => {
  const gov = createGlGovernor();
  let evictions = 0;
  gov.acquire({ priority: PRIORITY_FIGURE, onEvict: () => { evictions += 1; } });
  gov.acquire({ priority: PRIORITY_FIGURE, onEvict: () => { evictions += 1; } });
  const third = gov.acquire({ priority: PRIORITY_FIGURE, onEvict: () => {} });
  assert.equal(third, null, 'a second live figure cannot bump the first');
  assert.equal(evictions, 0, 'nothing was evicted');
  assert.equal(gov.liveCount(), 2);
});

test('a higher-priority requester evicts the lowest-priority holder', () => {
  const gov = createGlGovernor();
  const evicted = [];
  gov.acquire({ priority: PRIORITY_AMBIENT, onEvict: () => evicted.push('ambient') });
  gov.acquire({ priority: PRIORITY_FIGURE, onEvict: () => evicted.push('figure') });
  const hero = gov.acquire({ priority: PRIORITY_HERO, onEvict: () => evicted.push('hero') });
  assert.ok(hero, 'the hero always gets a slot');
  assert.deepEqual(evicted, ['figure'], 'the LOWEST priority goes, not the ambient backdrop');
  assert.equal(gov.liveCount(), 2);
});

test('denies when every holder outranks the requester', () => {
  const gov = createGlGovernor();
  gov.acquire({ priority: PRIORITY_HERO, onEvict: () => {} });
  gov.acquire({ priority: PRIORITY_AMBIENT, onEvict: () => {} });
  const figure = gov.acquire({ priority: PRIORITY_FIGURE, onEvict: () => {} });
  assert.equal(figure, null, 'a figure never bumps the hero or the ambient layer');
});

test('LRU tie-break among equal priorities: least-recently-touched is evicted', () => {
  const gov = createGlGovernor();
  const evicted = [];
  const first = gov.acquire({ priority: PRIORITY_FIGURE, onEvict: () => evicted.push('first') });
  gov.acquire({ priority: PRIORITY_FIGURE, onEvict: () => evicted.push('second') });
  // `first` renders actively and touches its token — `second` is now the stalest.
  gov.touch(first);
  const ambient = gov.acquire({ priority: PRIORITY_AMBIENT, onEvict: () => evicted.push('ambient') });
  assert.ok(ambient);
  assert.deepEqual(evicted, ['second'], 'the untouched (stalest) equal-priority token goes first');
});

test('without touch(), grant order is the recency order (oldest grant evicted)', () => {
  const gov = createGlGovernor();
  const evicted = [];
  gov.acquire({ priority: PRIORITY_FIGURE, onEvict: () => evicted.push('first') });
  gov.acquire({ priority: PRIORITY_FIGURE, onEvict: () => evicted.push('second') });
  gov.acquire({ priority: PRIORITY_AMBIENT, onEvict: () => evicted.push('ambient') });
  assert.deepEqual(evicted, ['first']);
});

test('release is idempotent and frees the slot', () => {
  const gov = createGlGovernor();
  const a = gov.acquire({ priority: PRIORITY_FIGURE, onEvict: () => {} });
  gov.acquire({ priority: PRIORITY_FIGURE, onEvict: () => {} });
  gov.release(a);
  gov.release(a); // double release must not free someone else's slot
  gov.release(null); // and null/undefined are ignored
  assert.equal(gov.liveCount(), 1);
  const c = gov.acquire({ priority: PRIORITY_FIGURE, onEvict: () => {} });
  assert.ok(c, 'the released slot is grantable again');
  assert.equal(gov.liveCount(), 2);
});

test('an evicted token is already released when onEvict runs (defensive release is a no-op)', () => {
  const gov = createGlGovernor();
  let tokenA = null;
  tokenA = gov.acquire({
    priority: PRIORITY_FIGURE,
    onEvict: () => {
      // Dispose paths call release() unconditionally — must be safe mid-eviction.
      gov.release(tokenA);
      assert.equal(gov.liveCount(), 1, 'the victim is out of the ledger before onEvict');
    },
  });
  gov.acquire({ priority: PRIORITY_AMBIENT, onEvict: () => {} });
  const hero = gov.acquire({ priority: PRIORITY_HERO, onEvict: () => {} });
  assert.ok(hero);
  assert.equal(gov.liveCount(), 2);
});

test('touch on a released/unknown token is ignored', () => {
  const gov = createGlGovernor();
  const a = gov.acquire({ priority: PRIORITY_FIGURE, onEvict: () => {} });
  gov.release(a);
  gov.touch(a); // must not resurrect it
  gov.touch(null);
  assert.equal(gov.liveCount(), 0);
});

test('priority constants keep their designed order (hero > ambient > figure)', () => {
  assert.ok(PRIORITY_HERO > PRIORITY_AMBIENT);
  assert.ok(PRIORITY_AMBIENT > PRIORITY_FIGURE);
  assert.equal(MAX_CONTEXTS, 2);
});
