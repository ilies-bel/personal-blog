/**
 * scripts/gen-favicons.mjs
 *
 * Generate light and dark theme favicon raster files from the favicon.svg glyph geometry.
 * The glyph is a black-hole / accretion-disk line drawing (same paths as public/favicon.svg).
 *
 * Produces TWO sets:
 *   LIGHT (dark-on-cream, default): overwrites the existing filenames
 *     favicon-16x16.png  (16px)
 *     favicon-32x32.png  (32px)
 *     apple-touch-icon.png (180px, opaque — iOS ignores transparency)
 *     icon-512.png       (512px)
 *     favicon.ico        (48px encoded as .ico, universal fallback)
 *
 *   DARK (cream-on-dark): new files with -dark suffix
 *     favicon-16x16-dark.png
 *     favicon-32x32-dark.png
 *     apple-touch-icon-dark.png
 *     icon-512-dark.png
 *     favicon-dark.ico
 *
 * Usage:  node scripts/gen-favicons.mjs
 * Deps:   sharp (already in node_modules), png-to-ico (devDependency)
 */

import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');

const INK   = '#0a1017'; // dark ink  — matches favicon.svg light-mode stroke
const CREAM = '#F5ECD9'; // cream     — matches favicon.svg dark-mode stroke

/**
 * Build a self-contained SVG string with hardcoded colors.
 * No media-query needed here; each variant is a static raster target.
 * Paths/circles are identical to public/favicon.svg (viewBox 0 0 128 128).
 */
function buildSVG(strokeColor, bgColor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <rect width="128" height="128" fill="${bgColor}" />
  <g stroke="${strokeColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <!-- Accretion disk: straight diameter line, full width through the hole -->
    <path d="M2 64 H126" />
    <!-- Left fork: line swells up &amp; down to merge onto the outer ring -->
    <path d="M27 64 C38 64 34.53 50.76 43.16 42.42" />
    <path d="M27 64 C38 64 34.53 77.24 43.16 85.58" />
    <!-- Right fork (mirror) -->
    <path d="M101 64 C90 64 93.47 50.76 84.84 42.42" />
    <path d="M101 64 C90 64 93.47 77.24 84.84 85.58" />
    <!-- Outer event-horizon ring -->
    <circle cx="64" cy="64" r="30" />
    <!-- Inner ring -->
    <circle cx="64" cy="64" r="18" />
  </g>
</svg>`;
}

async function toPNG(svgString, size) {
  return sharp(Buffer.from(svgString))
    .resize(size, size)
    .png()
    .toBuffer();
}

async function writePNG(svgString, size, outputPath) {
  const buf = await toPNG(svgString, size);
  await fs.writeFile(outputPath, buf);
  console.log(`  wrote ${path.relative(process.cwd(), outputPath)}`);
}

async function writeICO(pngBuffer, outputPath) {
  const icoBuffer = await pngToIco([pngBuffer]);
  await fs.writeFile(outputPath, icoBuffer);
  console.log(`  wrote ${path.relative(process.cwd(), outputPath)}`);
}

async function main() {
  const lightSVG = buildSVG(INK, CREAM);   // dark ink on cream
  const darkSVG  = buildSVG(CREAM, INK);   // cream glyph on dark

  console.log('Generating LIGHT favicons (dark-on-cream)…');
  await writePNG(lightSVG, 16,  path.join(PUBLIC, 'favicon-16x16.png'));
  await writePNG(lightSVG, 32,  path.join(PUBLIC, 'favicon-32x32.png'));
  await writePNG(lightSVG, 180, path.join(PUBLIC, 'apple-touch-icon.png'));
  await writePNG(lightSVG, 512, path.join(PUBLIC, 'icon-512.png'));
  const light48 = await toPNG(lightSVG, 48);
  await writeICO(light48, path.join(PUBLIC, 'favicon.ico'));

  console.log('Generating DARK favicons (cream-on-dark)…');
  await writePNG(darkSVG, 16,  path.join(PUBLIC, 'favicon-16x16-dark.png'));
  await writePNG(darkSVG, 32,  path.join(PUBLIC, 'favicon-32x32-dark.png'));
  await writePNG(darkSVG, 180, path.join(PUBLIC, 'apple-touch-icon-dark.png'));
  await writePNG(darkSVG, 512, path.join(PUBLIC, 'icon-512-dark.png'));
  const dark48 = await toPNG(darkSVG, 48);
  await writeICO(dark48, path.join(PUBLIC, 'favicon-dark.ico'));

  console.log('\nDone — all favicons generated.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
