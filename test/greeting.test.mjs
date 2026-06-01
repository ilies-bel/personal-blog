// Tests for the hero personalization logic. The modules are TypeScript, so we
// compile them in-memory with esbuild (a project dependency) and import.
//
//   npm test
import { build } from 'esbuild';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function loadGreeting() {
  const res = await build({
    stdin: { contents: `export * from './src/hero/greeting.ts';`, resolveDir: root, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    absWorkingDir: root,
  });
  const b64 = Buffer.from(res.outputFiles[0].text).toString('base64');
  return import(`data:text/javascript;base64,${b64}`);
}

const signals = (over = {}) => ({
  hour: 14,
  partOfDay: 'afternoon',
  weekday: 'Friday',
  isWeekend: false,
  timezone: 'Europe/Paris',
  language: 'en-US',
  languageName: 'English',
  device: 'desktop',
  os: 'macOS',
  browser: 'Chrome',
  touch: false,
  prefersDark: true,
  prefersReducedMotion: false,
  screenW: 1920,
  screenH: 1080,
  viewportW: 1440,
  viewportH: 900,
  fullscreenish: false,
  referrer: { raw: '', kind: 'direct', source: null },
  battery: null,
  connection: '4g',
  ...over,
});

test('returns a complete sentence for a basic visitor', async () => {
  const { buildGreeting } = await loadGreeting();
  const line = buildGreeting({ signals: signals(), priorVisits: 0 });
  assert.equal(typeof line, 'string');
  assert.ok(line.length > 15);
  assert.match(line, /[.!]$/); // ends with terminal punctuation
});

test('time of day drives the opener', async () => {
  const { buildGreeting } = await loadGreeting();
  // Check across several picks since the opener is chosen randomly from a pool.
  const morningLines = Array.from({ length: 12 }, () =>
    buildGreeting({ signals: signals({ partOfDay: 'morning', hour: 9 }), priorVisits: 0 }),
  );
  const nightLines = Array.from({ length: 12 }, () =>
    buildGreeting({ signals: signals({ partOfDay: 'small hours', hour: 3 }), priorVisits: 0 }),
  );
  // Every morning opener references the morning.
  assert.ok(morningLines.every((l) => /morning/i.test(l)), 'all morning lines mention morning');
  // Every small-hours opener evokes the late hour (night / 3 a.m. / debugging / oil).
  assert.ok(
    nightLines.every((l) => /night|3 a\.m\.|debugging|oil/i.test(l)),
    'all small-hours lines evoke the late hour',
  );
});

test('returning visitors are acknowledged', async () => {
  const { buildGreeting } = await loadGreeting();
  // priorVisits > 0 should reliably surface a "back/again/regular" flavour.
  const lines = Array.from({ length: 8 }, () =>
    buildGreeting({ signals: signals(), priorVisits: 1 }),
  );
  assert.ok(
    lines.some((l) => /back|flattered|regular|again|counting/i.test(l)),
    'at least one returning-visitor line mentions the return',
  );
});

test('referrer produces a relevant jab', async () => {
  const { buildGreeting } = await loadGreeting();
  const fromHN = signals({ referrer: { raw: 'https://news.ycombinator.com/', kind: 'aggregator', source: 'Hacker News' } });
  const lines = Array.from({ length: 12 }, () => buildGreeting({ signals: fromHN, priorVisits: 0 }));
  assert.ok(lines.some((l) => /Hacker News/.test(l)), 'mentions the referrer at least once');
});

test('falls back gracefully when no jab applies', async () => {
  const { buildGreeting, FALLBACK_GREETING } = await loadGreeting();
  // An unknown OS + unknown browser + direct + desktop = no applicable jab.
  const bare = signals({ os: 'an unknown OS', browser: 'Chrome' });
  // Chrome still has a jab, so force the truly bare case:
  const trulyBare = signals({
    os: 'an unknown OS',
    browser: 'a browser you keep quiet about',
    device: 'desktop',
    referrer: { raw: '', kind: 'internal', source: null },
  });
  const line = buildGreeting({ signals: trulyBare, priorVisits: 0 });
  assert.equal(typeof line, 'string');
  assert.ok(line.length > 10);
  assert.equal(typeof FALLBACK_GREETING, 'string');
});
