// check-figure-staleness.mjs — CI gate for the committed SceneFigure captures.
//
//   node scripts/check-figure-staleness.mjs
//
// The figure plates on /behind-the-build (and the projects ambient backdrop)
// are BUILD-TIME captures of the live engine, committed under src/assets/
// (see scripts/capture-figures.mjs). If the engine's look changes — any shader
// in src/hero/shaders/ or the scene controller createScene.ts — the committed
// stills silently stop matching what an opt-in "Run live" click would show.
// This script recomputes the same source hash the capture run stamped into
// src/assets/figures/manifest.json and FAILS when they drift, with one
// instruction: rerun capture-figures and commit the result.
//
// The hash recipe is twinned with capture-figures.mjs on purpose (importing it
// would execute the whole capture run). Keep the two in sync.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = resolve(root, 'src/assets/figures/manifest.json');
const HASHED_SOURCES = ['src/hero/shaders', 'src/hero/scene/createScene.ts'];

async function engineHash() {
  const files = [];
  for (const entry of HASHED_SOURCES) {
    const abs = resolve(root, entry);
    const names = entry.endsWith('.ts')
      ? [abs]
      : (await readdir(abs)).sort().map((n) => join(abs, n));
    files.push(...names);
  }
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.slice(root.length + 1));
    hash.update(await readFile(file));
  }
  return hash.digest('hex');
}

if (!existsSync(MANIFEST)) {
  console.error('check-figure-staleness: src/assets/figures/manifest.json is missing.');
  console.error('  Run `node scripts/capture-figures.mjs` and commit the generated captures.');
  process.exit(1);
}

const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
const current = await engineHash();

// Every capture the manifest claims must actually be committed.
const missing = (manifest.captures ?? []).filter((name) => {
  const dir = name.startsWith('backdrop-') ? 'src/assets/backdrops' : 'src/assets/figures';
  return !existsSync(resolve(root, dir, name));
});

if (missing.length > 0) {
  console.error(`check-figure-staleness: ${missing.length} capture(s) in the manifest are not committed:`);
  for (const name of missing) console.error(`  MISSING ${name}`);
  console.error('  Run `node scripts/capture-figures.mjs` and commit the generated captures.');
  process.exit(1);
}

if (manifest.engineHash !== current) {
  console.error('check-figure-staleness: the engine sources changed since the captures were taken.');
  console.error(`  manifest: ${manifest.engineHash}`);
  console.error(`  current:  ${current}`);
  console.error('  The committed figure/backdrop stills no longer match what "Run live" renders.');
  console.error('  Rerun `node scripts/capture-figures.mjs` and commit the refreshed captures.');
  process.exit(1);
}

console.log(
  `check-figure-staleness: ${manifest.captures?.length ?? 0} capture(s) fresh (hash ${current.slice(0, 12)}…) ✓`,
);
