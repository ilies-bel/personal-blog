import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
    source.indexOf('id="arm-outer-pillar-ridge"') < source.indexOf('id="console-cowl-plate"'),
    'the central cowl must paint over the continuous lower sill',
  );
});

test('approved upper fork source stays byte-stable while the lower deck evolves', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const lowerMarker = '  <!-- LOWER COCKPIT STRUCTURE';
  const lowerStart = source.indexOf(lowerMarker);
  assert.notEqual(lowerStart, -1, 'lower cockpit marker must remain the upper/lower authoring seam');

  const approvedUpper = source.slice(0, lowerStart);
  assert.equal(approvedUpper.length, 5228);
  assert.equal(
    createHash('sha256').update(approvedUpper).digest('hex'),
    'c4121f4218d38fd3cb923c5b01831b87f3c2ee8330693842862503f72ad13b53',
  );
});

test('lower cockpit is mirrored plate topology with joined, occluded load paths', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const lower = source.slice(source.indexOf('  <!-- LOWER COCKPIT STRUCTURE'));

  assert.equal(lower.match(/id="lower-deck-left"/g)?.length, 1);
  assert.equal(lower.match(/id="lower-brace-interior-left"/g)?.length, 1);
  assert.match(lower, /<use href="#lower-deck-left" transform="translate\(1920 0\) scale\(-1 1\)"\/>/);
  assert.match(
    lower,
    /<use href="#lower-brace-interior-left" transform="translate\(1920 0\) scale\(-1 1\)"\/>/,
  );

  for (const id of [
    'left-deck-shelf-plate',
    'left-instrument-panel-plate',
    'left-upper-flare-primary',
    'left-shelf-primary',
    'left-panel-primary-exterior',
    'console-cowl-plate',
    'console-cowl-outer-contour',
    'left-panel-primary-interior',
    'console-screen',
    'console-bezel-load-path',
  ]) {
    assert.equal(lower.match(new RegExp(`id="${id}"`, 'g'))?.length, 1, `${id} must have one author`);
  }

  const paintOrder = [
    'id="left-deck-shelf-plate"',
    'id="left-upper-flare-primary"',
    'id="canopy-primary-sill"',
    'id="console-cowl-plate"',
    'id="console-cowl-outer-contour"',
    'id="left-panel-primary-interior"',
    'id="console-screen"',
    'id="console-bezel-load-path"',
  ].map((token) => lower.indexOf(token));
  assert.ok(paintOrder.every((index) => index >= 0), 'every lower paint layer must exist');
  assert.ok(
    paintOrder.every((index, position) => position === 0 || paintOrder[position - 1] < index),
    'plates, ridges, cowl, recess and bezel must retain their occlusion order',
  );

  const cowlPlateTag = lower.match(/<path\s+id="console-cowl-plate"[\s\S]*?\/>/)?.[0];
  assert.ok(cowlPlateTag, 'filled cowl plate must exist');
  const cowlPlateD = cowlPlateTag.match(/\bd="([^"]+)"/s)?.[1]?.replace(/\s+/g, ' ');
  assert.ok(cowlPlateD);
  assert.match(cowlPlateD, /M520 1090L611 1020L579 958 C574\.5 949 602 906 610 888/);
  assert.match(cowlPlateD, /1310 888 C1318 906 1345\.5 949 1341 958L1304 1020L1400 1090Z/);
  assert.doesNotMatch(
    cowlPlateD,
    /M520 1090L610 888|L1310 888L1400 1090/,
    'filled cowl silhouette must stay under the amber brace/bezel chain',
  );

  const contourTag = lower.match(/<path\s+id="console-cowl-outer-contour"[\s\S]*?\/>/)?.[0];
  assert.ok(contourTag, 'open cowl contour must exist');
  const contourD = contourTag.match(/\bd="([^"]+)"/s)?.[1];
  assert.ok(contourD);
  assert.doesNotMatch(contourD, /[zZ]/, 'the visible cowl contour must remain open');
  assert.match(contourTag, /stroke-linecap="butt"/);
  assert.match(contourD, /M585 970L579 958/);
  assert.doesNotMatch(contourD, /520 1090|1400 1090/, 'neutral shoulders must not re-emerge below the brace');

  const interiorTag = lower.match(/<path\s+id="left-panel-primary-interior"[\s\S]*?\/>/)?.[0];
  assert.match(interiorTag ?? '', /d="M579 958L611 1020"/);
  assert.ok(
    lower.indexOf('id="console-cowl-outer-contour"') < lower.indexOf('id="left-panel-primary-interior"'),
    'the wider amber brace must paint over the coincident neutral handoff',
  );

  assert.equal(lower.match(/id="canopy-primary-sill"/g)?.length, 1);
  assert.equal(lower.match(/<rect\b/g)?.length, 1, 'the only lower rectangle is the fixed outer hull datum');
  assert.doesNotMatch(lower, /id="console-cowl-inner-companion"/);
  assert.doesNotMatch(lower, /deck-upper-ridge|deck-lower-ridge/);
  assert.doesNotMatch(lower, /<filter\b|filter=|id="[^"]*(?:patch|cap|hook)[^"]*"/i);
});

test('live and reduced paths consume the same plate without runtime beam assembly', async () => {
  const [live, reduced] = await Promise.all([
    readFile(path.join(root, 'src/hero/scene/buildCockpit.ts'), 'utf8'),
    readFile(path.join(root, 'src/hero/components/CockpitFrame.tsx'), 'utf8'),
  ]);
  assert.match(live, /TextureLoader\(\)\.load\(COCKPIT_PLATE_URL\)/);
  assert.match(reduced, /src=\{COCKPIT_PLATE_URL\}/);
  assert.doesNotMatch(live, /buildBeamRibbons|Y_JUNCTION_PATCHES|cockpitGeometry/);
  assert.equal(live.match(/new THREE\.TextureLoader\(\)\.load\(COCKPIT_PLATE_URL\)/g)?.length, 1);
  assert.equal(live.match(/const plate = new THREE\.Mesh\(plateGeo, plateMat\)/g)?.length, 1);
});
