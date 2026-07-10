// optimize-public-images.mjs — recompress the rasters that MUST live in
// public/ (stable-URL assets astro:assets cannot own: the OG card, favicons,
// PWA icons, the reduced-motion posters). Everything else belongs in
// src/assets/ and goes through the astro:assets pipeline — this script exists
// only for the public/ stragglers.
//
//   node scripts/optimize-public-images.mjs           # optimize in place
//   node scripts/optimize-public-images.mjs --check   # CI gate: fail if a
//                                                     # public raster is
//                                                     # committed unoptimized
//
// In-place mode losslessly re-encodes PNGs (palette where it survives — see
// below) and recompresses JPEGs with mozjpeg, keeping pixels' dimensions and
// format (the URLs are load-bearing: og:image consumers, manifest icons).
// It is idempotent: a file is only rewritten when re-encoding shrinks it by
// more than SLACK, so running it twice is a no-op.
//
// --check mode re-encodes into memory and FAILS if any file would shrink by
// more than SLACK — meaning someone committed an unoptimized raster into
// public/. It never writes; the fix is running the script without --check and
// committing the result. SLACK is 10%: palette/mozjpeg wins below that are
// noise (encoder version drift), above it it's a real unoptimized asset.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, extname, relative } from 'node:path';
import sharp from 'sharp';

const publicDir = resolve(process.argv[2]?.startsWith('--') ? 'public' : (process.argv[2] ?? 'public'));
const CHECK = process.argv.includes('--check');
const SLACK = 0.10; // only act on >10% shrink — below that is encoder noise

const RASTER_EXT = new Set(['.png', '.jpg', '.jpeg']);

/** Recursively list files under dir. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/**
 * Re-encode a raster in place (same format, same pixels' dimensions).
 * PNG: try palette quantization first (the OG card and icons are flat-color
 * design surfaces where 256 colors are visually lossless), fall back to plain
 * max-effort deflate if palette somehow comes out bigger. JPEG: mozjpeg.
 */
async function reencode(buffer, ext) {
  if (ext === '.png') {
    const palette = await sharp(buffer)
      .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
      .toBuffer();
    const plain = await sharp(buffer).png({ effort: 10, compressionLevel: 9 }).toBuffer();
    return palette.length <= plain.length ? palette : plain;
  }
  // .jpg / .jpeg
  return sharp(buffer).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
}

const files = walk(publicDir).filter((f) => RASTER_EXT.has(extname(f).toLowerCase()));
const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

let failures = 0;
let rewritten = 0;

for (const file of files) {
  const rel = relative(publicDir, file);
  const ext = extname(file).toLowerCase();
  const original = readFileSync(file);
  let before = original.length;
  let after = await reencode(original, ext);
  let shrink = (before - after.length) / before;

  if (shrink <= SLACK) continue; // already optimized (or not worth touching)

  if (CHECK) {
    failures += 1;
    console.error(
      `  FAIL  ${rel} ${kb(before)} → would be ${kb(after.length)} (-${(shrink * 100).toFixed(0)}%) — ` +
        'unoptimized raster committed to public/. Run `node scripts/optimize-public-images.mjs` and commit.',
    );
  } else {
    // Re-encode to a FIXPOINT so the write is idempotent under --check: a
    // freshly-quantized palette PNG can shrink again on the next pass (the
    // quantizer converges over 2-3 rounds), and --check must see <SLACK on
    // what we commit.
    for (let pass = 0; pass < 5; pass += 1) {
      const next = await reencode(after, ext);
      const nextShrink = (after.length - next.length) / after.length;
      if (next.length >= after.length) break;
      after = next;
      if (nextShrink <= SLACK) break;
    }
    writeFileSync(file, after);
    rewritten += 1;
    shrink = (before - after.length) / before;
    console.log(`  WROTE ${rel} ${kb(before)} → ${kb(after.length)} (-${(shrink * 100).toFixed(0)}%)`);
  }
}

console.log(
  `optimize-public-images: ${files.length} public raster(s) scanned` +
    (CHECK ? `, ${failures} unoptimized` : `, ${rewritten} rewritten`),
);
if (CHECK && failures > 0) process.exit(1);
if (CHECK) console.log('optimize-public-images: public rasters are optimized ✓');
