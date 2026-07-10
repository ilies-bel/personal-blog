// motionPreference — centralized motion-preference service unit tests.
//
// Uses esbuild to bundle the TypeScript source (same pattern as
// contextRegistry.test.mjs) so the REAL implementation is exercised.
//
// Browser globals are mocked via globalThis BEFORE the import — the module's
// init side-effects run with the mocked environment so the tests cover the
// full lifecycle without a real browser.
//
// Tests verify BEHAVIOUR through the public interface only:
//   • getOsPreference()         — reads the mocked matchMedia
//   • getManualOverride()       — reads the mocked localStorage
//   • resolveMotionPreference() — override ?? OS precedence
//   • setManualOverride()       — writes storage, sets root attr, broadcasts event
//   • Module init               — root attribute stamped on import, listeners wired
//   • OS change propagation     — matchMedia change listener calls applyAndBroadcast
//   • SPA navigation            — astro:page-load listener calls applyAndBroadcast

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// ---------------------------------------------------------------------------
// Mutable mock environment — set up on globalThis BEFORE the module is loaded.
// Tests mutate these references to simulate different preference states.
// ---------------------------------------------------------------------------

// Mutable backing state the tests adjust between assertions.
const env = {
  osReduced: false,
  storedValue: null,   // null | 'true' | 'false'
  rootAttrs: {},
  mqChangeListeners: [],
  windowListeners: {},
  documentListeners: {},
  dispatchedEventDetails: [],   // detail objects from MOTION_CHANGE_EVENT dispatches
};

function reset() {
  env.osReduced = false;
  env.storedValue = null;
  env.rootAttrs = {};
  env.dispatchedEventDetails = [];
  // NOTE: mqChangeListeners / windowListeners / documentListeners are NOT reset
  // between tests — the module only registers them once at init time. Tests that
  // want to trigger them call the helpers below.
}

// matchMedia mock — env.osReduced controls .matches.
const mqMock = {
  get matches() { return env.osReduced; },
  addEventListener: (type, fn) => {
    if (type === 'change') env.mqChangeListeners.push(fn);
  },
  removeEventListener: () => {},
};

// Helpers the tests call to simulate external events.
function triggerOsChange() {
  for (const fn of env.mqChangeListeners) fn();
}
function triggerPageLoad() {
  for (const fn of (env.documentListeners['astro:page-load'] ?? [])) fn();
}

// Set up globals before the module is imported.
globalThis.window = {
  matchMedia: () => mqMock,
  addEventListener: (type, fn) => {
    env.windowListeners[type] = env.windowListeners[type] ?? [];
    env.windowListeners[type].push(fn);
  },
  removeEventListener: () => {},
  dispatchEvent: (e) => {
    if (e.type === 'bh:motion-preference-change') {
      env.dispatchedEventDetails.push(e.detail);
    }
    for (const fn of (env.windowListeners[e.type] ?? [])) fn(e);
  },
};

globalThis.localStorage = {
  getItem: () => env.storedValue,
  setItem: (_key, val) => { env.storedValue = val; },
  removeItem: () => { env.storedValue = null; },
};

globalThis.document = {
  documentElement: {
    setAttribute: (name, val) => { env.rootAttrs[name] = val; },
    getAttribute: (name) => env.rootAttrs[name] ?? null,
  },
  addEventListener: (type, fn) => {
    env.documentListeners[type] = env.documentListeners[type] ?? [];
    env.documentListeners[type].push(fn);
  },
  removeEventListener: () => {},
};

// ---------------------------------------------------------------------------
// Load the real implementation via esbuild
// ---------------------------------------------------------------------------

const entry = new URL('../src/lib/motionPreference.ts', import.meta.url).pathname;
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
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
);

const {
  MOTION_CHANGE_EVENT,
  getOsPreference,
  getManualOverride,
  resolveMotionPreference,
  setManualOverride,
} = mod;

// ---------------------------------------------------------------------------
// Module init (side-effects that ran at import time)
// ---------------------------------------------------------------------------

describe('module initialization', () => {
  test('MOTION_CHANGE_EVENT is the expected string', () => {
    assert.equal(MOTION_CHANGE_EVENT, 'bh:motion-preference-change');
  });

  test('root attribute is set to "false" on import when no override and OS is not reduced', () => {
    // The init side-effect ran with env.osReduced=false, env.storedValue=null.
    // Root attribute must have been stamped as 'false'.
    assert.equal(env.rootAttrs['data-reduced-motion'], 'false');
  });

  test('an initial MOTION_CHANGE_EVENT was dispatched on import', () => {
    // applyAndBroadcast() fires at init; at least one event with detail.reduced=false.
    assert.ok(env.dispatchedEventDetails.length >= 1, 'no event dispatched at init');
    assert.equal(env.dispatchedEventDetails[0].reduced, false);
  });

  test('matchMedia change listener was registered', () => {
    assert.ok(
      env.mqChangeListeners.length >= 1,
      'no matchMedia change listener registered at init',
    );
  });

  test('astro:page-load listener was registered on document', () => {
    assert.ok(
      (env.documentListeners['astro:page-load'] ?? []).length >= 1,
      'no astro:page-load listener registered at init',
    );
  });
});

// ---------------------------------------------------------------------------
// getOsPreference
// ---------------------------------------------------------------------------

describe('getOsPreference', () => {
  test('returns false when OS does not prefer reduced motion', () => {
    env.osReduced = false;
    assert.equal(getOsPreference(), false);
  });

  test('returns true when OS prefers reduced motion', () => {
    env.osReduced = true;
    assert.equal(getOsPreference(), true);
    env.osReduced = false; // restore
  });
});

// ---------------------------------------------------------------------------
// getManualOverride
// ---------------------------------------------------------------------------

describe('getManualOverride', () => {
  test('returns null when nothing is stored', () => {
    env.storedValue = null;
    assert.equal(getManualOverride(), null);
  });

  test('returns true when "true" is stored', () => {
    env.storedValue = 'true';
    assert.equal(getManualOverride(), true);
    env.storedValue = null;
  });

  test('returns false when "false" is stored', () => {
    env.storedValue = 'false';
    assert.equal(getManualOverride(), false);
    env.storedValue = null;
  });

  test('returns null for unrecognized stored values', () => {
    env.storedValue = 'yes';
    assert.equal(getManualOverride(), null);
    env.storedValue = null;
  });
});

// ---------------------------------------------------------------------------
// resolveMotionPreference — override wins; OS is the fallback
// ---------------------------------------------------------------------------

describe('resolveMotionPreference', () => {
  test('returns OS preference when no manual override is set', () => {
    env.storedValue = null;
    env.osReduced = false;
    assert.equal(resolveMotionPreference(), false);

    env.osReduced = true;
    assert.equal(resolveMotionPreference(), true);
    env.osReduced = false;
  });

  test('manual override true wins over OS=false', () => {
    env.storedValue = 'true';
    env.osReduced = false;
    assert.equal(resolveMotionPreference(), true);
    env.storedValue = null;
  });

  test('manual override false wins over OS=true', () => {
    env.storedValue = 'false';
    env.osReduced = true;
    assert.equal(resolveMotionPreference(), false);
    env.storedValue = null;
    env.osReduced = false;
  });
});

// ---------------------------------------------------------------------------
// setManualOverride
// ---------------------------------------------------------------------------

describe('setManualOverride', () => {
  test('stores "true" in localStorage when called with true', () => {
    reset();
    setManualOverride(true);
    assert.equal(env.storedValue, 'true');
  });

  test('stores "false" in localStorage when called with false', () => {
    reset();
    setManualOverride(false);
    assert.equal(env.storedValue, 'false');
  });

  test('updates the root attribute to match the new preference', () => {
    reset();
    setManualOverride(true);
    assert.equal(env.rootAttrs['data-reduced-motion'], 'true');

    reset();
    env.storedValue = null; // reset() clears storedValue
    setManualOverride(false);
    assert.equal(env.rootAttrs['data-reduced-motion'], 'false');
  });

  test('dispatches MOTION_CHANGE_EVENT with correct detail', () => {
    reset();
    setManualOverride(true);
    const last = env.dispatchedEventDetails[env.dispatchedEventDetails.length - 1];
    assert.ok(last, 'no event dispatched by setManualOverride');
    assert.equal(last.reduced, true);

    reset();
    setManualOverride(false);
    const last2 = env.dispatchedEventDetails[env.dispatchedEventDetails.length - 1];
    assert.equal(last2.reduced, false);
  });
});

// ---------------------------------------------------------------------------
// OS matchMedia change propagation
// ---------------------------------------------------------------------------

describe('OS matchMedia change propagation', () => {
  test('triggerOsChange recomputes the root attribute from the new OS value', () => {
    reset();
    env.osReduced = true;
    triggerOsChange();
    assert.equal(env.rootAttrs['data-reduced-motion'], 'true');
    env.osReduced = false;
  });

  test('manual override false blocks an OS=true flip', () => {
    reset();
    env.storedValue = 'false'; // override: reduced=false
    env.osReduced = true;      // OS: would be reduced=true
    triggerOsChange();
    // Override wins: attribute must stay false
    assert.equal(env.rootAttrs['data-reduced-motion'], 'false');
    env.storedValue = null;
    env.osReduced = false;
  });

  test('MOTION_CHANGE_EVENT is dispatched on OS change', () => {
    reset();
    env.osReduced = true;
    triggerOsChange();
    const last = env.dispatchedEventDetails[env.dispatchedEventDetails.length - 1];
    assert.ok(last, 'no event dispatched on OS change');
    assert.equal(last.reduced, true);
    env.osReduced = false;
  });
});

// ---------------------------------------------------------------------------
// SPA navigation (astro:page-load re-broadcast)
// ---------------------------------------------------------------------------

describe('astro:page-load re-broadcast', () => {
  test('re-stamps the root attribute on page-load with the current preference', () => {
    reset();
    env.storedValue = 'true'; // manual override set before nav
    triggerPageLoad();
    assert.equal(env.rootAttrs['data-reduced-motion'], 'true');
    env.storedValue = null;
  });

  test('dispatches MOTION_CHANGE_EVENT on page-load', () => {
    reset();
    env.storedValue = 'true';
    triggerPageLoad();
    const last = env.dispatchedEventDetails[env.dispatchedEventDetails.length - 1];
    assert.ok(last, 'no event dispatched on astro:page-load');
    assert.equal(last.reduced, true);
    env.storedValue = null;
  });

  test('page-load with no override broadcasts the OS preference', () => {
    reset();
    env.storedValue = null;
    env.osReduced = false;
    triggerPageLoad();
    const last = env.dispatchedEventDetails[env.dispatchedEventDetails.length - 1];
    assert.equal(last.reduced, false);
  });
});
