#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'src/assets/cockpit/cockpit-plate.source.svg');
const outputPath = path.join(root, 'src/assets/cockpit/cockpit-plate.png');

export async function renderCockpitPlate() {
  const source = await readFile(sourcePath);
  return sharp(source, { density: 96 })
    .resize(1920, 1080, { fit: 'fill' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

const rendered = await renderCockpitPlate();

if (process.argv.includes('--check')) {
  const current = await readFile(outputPath).catch(() => null);
  if (!current || !current.equals(rendered)) {
    console.error('cockpit plate is missing or stale; run: node scripts/generate-cockpit-plate.mjs');
    process.exitCode = 1;
  } else {
    console.log('cockpit plate is current (1920x1080 RGBA)');
  }
} else {
  await writeFile(outputPath, rendered);
  console.log(`generated ${path.relative(root, outputPath)} (${rendered.length} bytes)`);
}
