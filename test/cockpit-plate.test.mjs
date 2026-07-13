import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'src/assets/cockpit/cockpit-plate.source.svg');
const platePath = path.join(root, 'src/assets/cockpit/cockpit-plate.png');

test('cockpit plate is a 1920x1080 RGBA asset', async () => {
  const metadata = await sharp(platePath).metadata();
  assert.equal(metadata.width, 1920);
  assert.equal(metadata.height, 1080);
  assert.equal(metadata.channels, 4);
  assert.equal(metadata.hasAlpha, true);
});

test('checked-in cockpit plate is current with its authoring source', () => {
  const result = spawnSync(process.execPath, ['scripts/generate-cockpit-plate.mjs', '--check'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('fork topology has two continuous amber primaries and no glow filter', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.equal(source.match(/id="arm-outer-pillar-ridge"/g)?.length, 1);
  assert.equal(source.match(/id="roof-inner-pillar-ridge"/g)?.length, 1);
  assert.equal(source.match(/stroke="#f0a126"/g)?.length, 2);
  assert.doesNotMatch(source, /<filter\b|filter=|Y_JUNCTION|blur/i);
  assert.ok(
    source.indexOf('id="arm-outer-pillar-ridge"') < source.indexOf('id="console-housing"'),
    'the central housing must paint over the continuous lower sill',
  );
});

test('live and reduced paths consume the same plate without runtime beam assembly', async () => {
  const [live, reduced] = await Promise.all([
    readFile(path.join(root, 'src/hero/scene/buildCockpit.ts'), 'utf8'),
    readFile(path.join(root, 'src/hero/components/CockpitFrame.tsx'), 'utf8'),
  ]);
  assert.match(live, /TextureLoader\(\)\.load\(COCKPIT_PLATE_URL\)/);
  assert.match(reduced, /src=\{COCKPIT_PLATE_URL\}/);
  assert.doesNotMatch(live, /buildBeamRibbons|Y_JUNCTION_PATCHES|cockpitGeometry/);
});
