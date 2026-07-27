import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import {
  LOADER_GONE_BODY_CLASS,
  LOADER_MIN_MS,
  LOADER_SAFETY_MS,
  LOADER_SEEN_STORAGE_KEY,
  LOADER_WARM_MAX_MS,
  NATIVE_SCROLL_INTENT_PX,
  SCENE_PAINTED_BODY_DATA_KEY,
  SCENE_READY_BODY_CLASS,
  SCENE_READY_EVENT,
  SCENE_WARM_DONE_EVENT,
  SCENE_WARM_PENDING_EVENT,
  WARM_SESSION_STORAGE_KEY,
  WEBGL_UNAVAILABLE_BODY_CLASS,
} from '../src/hero/lib/constants.ts';

const source = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const scriptMatch = source.match(/<script\s+is:inline[\s\S]*?define:vars=\{\{[\s\S]*?\}\}\s*>\s*([\s\S]*?)\s*<\/script>/);
assert.ok(scriptMatch, 'home loader must remain a parser-inline script');
const loaderScript = scriptMatch[1];

const loaderConstants = {
  SCENE_READY_EVENT,
  SCENE_PAINTED_BODY_DATA_KEY,
  SCENE_READY_BODY_CLASS,
  SCENE_WARM_PENDING_EVENT,
  SCENE_WARM_DONE_EVENT,
  WEBGL_UNAVAILABLE_BODY_CLASS,
  LOADER_GONE_BODY_CLASS,
  LOADER_MIN_MS,
  LOADER_WARM_MAX_MS,
  LOADER_SAFETY_MS,
  LOADER_SEEN_STORAGE_KEY,
  NATIVE_SCROLL_INTENT_PX,
  WARM_SESSION_STORAGE_KEY,
};

function createHarness({ alreadyPainted = false, seen = true } = {}) {
  const bodyClasses = new Set();
  const timers = new Map();
  const storage = new Map(seen ? [[LOADER_SEEN_STORAGE_KEY, '1']] : []);
  let nextTimer = 1;

  const skip = new EventTarget();
  const loader = new EventTarget();
  loader.dataset = {};
  loader.isConnected = true;
  loader.querySelector = (selector) => selector === '.scene-loader-skip' ? skip : null;

  const body = {
    dataset: alreadyPainted ? { [SCENE_PAINTED_BODY_DATA_KEY]: 'true' } : {},
    classList: {
      add: (...names) => names.forEach((name) => bodyClasses.add(name)),
      contains: (name) => bodyClasses.has(name),
    },
  };

  const documentTarget = new EventTarget();
  const document = Object.assign(documentTarget, {
    body,
    querySelector: (selector) => selector === '.scene-loader' ? loader : null,
  });
  const windowTarget = new EventTarget();
  const window = Object.assign(windowTarget, {
    scrollY: 0,
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    getComputedStyle: () => ({ transitionDuration: '0s' }),
    setTimeout: (callback, delay) => {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });

  const definitions = Object.entries(loaderConstants)
    .map(([name, value]) => `const ${name} = ${JSON.stringify(value)};`)
    .join('\n');
  vm.runInNewContext(`${definitions}\n${loaderScript}`, {
    document,
    window,
    performance: { now: () => 0 },
  });

  return {
    body,
    bodyClasses,
    loader,
    timers,
    window,
    runTimer(delay) {
      const entry = [...timers.values()].find((timer) => timer.delay === delay);
      assert.ok(entry, `expected a ${delay}ms timer`);
      entry.callback();
    },
  };
}

test('the loader bootstrap is parser-inline and runs before the hero island', () => {
  const loaderOffset = source.indexOf('<script\n    is:inline');
  const islandOffset = source.indexOf('<BlackHole');
  assert.ok(loaderOffset >= 0, 'inline loader bootstrap exists');
  assert.ok(islandOffset > loaderOffset, 'loader bootstrap precedes island hydration markup');
  assert.doesNotMatch(loaderScript, /\bimport\s*(?:\(|\{)/, 'bootstrap has no fallible runtime import');
});

test('a real scene-ready signal releases the loader without entering fallback', () => {
  const harness = createHarness();
  harness.body.dataset[SCENE_PAINTED_BODY_DATA_KEY] = 'true';
  harness.window.dispatchEvent(new Event(SCENE_READY_EVENT));

  assert.equal(harness.bodyClasses.has(SCENE_READY_BODY_CLASS), true);
  assert.equal(harness.bodyClasses.has(LOADER_GONE_BODY_CLASS), true);
  assert.equal(harness.bodyClasses.has(WEBGL_UNAVAILABLE_BODY_CLASS), false);
});

test('a handled ready signal cancels the failure backstop', () => {
  const harness = createHarness();
  harness.window.dispatchEvent(new Event(SCENE_READY_EVENT));

  assert.equal(harness.bodyClasses.has(SCENE_READY_BODY_CLASS), true);
  assert.equal(
    [...harness.timers.values()].some((timer) => timer.delay === LOADER_SAFETY_MS),
    false,
  );
  assert.equal(harness.bodyClasses.has(WEBGL_UNAVAILABLE_BODY_CLASS), false);
});

test('a late loader recovers an already-painted real scene from the durable latch', () => {
  const harness = createHarness({ alreadyPainted: true });

  assert.equal(harness.bodyClasses.has(SCENE_READY_BODY_CLASS), true);
  assert.equal(harness.bodyClasses.has(LOADER_GONE_BODY_CLASS), true);
  assert.equal(harness.bodyClasses.has(WEBGL_UNAVAILABLE_BODY_CLASS), false);
});

test('boot failure fails open to the usable fallback at the safety ceiling', () => {
  const harness = createHarness({ seen: false });
  harness.runTimer(LOADER_SAFETY_MS);

  assert.equal(harness.bodyClasses.has(SCENE_READY_BODY_CLASS), true);
  assert.equal(harness.bodyClasses.has(LOADER_GONE_BODY_CLASS), true);
  assert.equal(harness.bodyClasses.has(WEBGL_UNAVAILABLE_BODY_CLASS), true);
});

test('a stale safety timer cannot mark the next route as a WebGL failure', () => {
  const harness = createHarness({ seen: false });
  harness.loader.isConnected = false;
  harness.runTimer(LOADER_SAFETY_MS);

  assert.deepEqual([...harness.bodyClasses], []);
});
