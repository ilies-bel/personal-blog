// scripts/optimize-media.mjs — Reproducible media optimization pipeline.
//
// Reads source rasters from media-source/, generates AVIF + WebP + JPEG/PNG
// fallback at the declared responsive widths, strips EXIF metadata (colour
// profile is re-embedded as sRGB since all sources are sRGB), and records
// intrinsic dimensions + byte sizes to:
//
//   evidence/performance/asset-pipeline-manifest.json
//
// Outputs land under public/opt/ so Astro's static copy step includes them
// in dist/ without further configuration.
//
// ADDING A NEW SOURCE IMAGE
//   1. Place the original raster in media-source/<subdir>/<name>.<ext>.
//   2. Add an entry to MEDIA_SOURCES below.
//   3. Run: node scripts/optimize-media.mjs
//   4. Commit media-source/<file>, public/opt/**/* and the updated manifest.
//   5. Update HTML references to use the /opt/ paths.
//
// Usage:
//   node scripts/optimize-media.mjs

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const sharp = (await import('sharp')).default;

// ─── Source definitions ───────────────────────────────────────────────────────
//
// widths:        responsive breakpoints to generate (px).  Skipped if wider
//                than the source — the pipeline never upscales.
// fallbackFormat: format for the <img src> fallback inside <picture>.
//                 Use 'jpeg' for opaque images (better compression than PNG).

const MEDIA_SOURCES = [
  {
    // Prose column is max-width: 680px (prose.css).  No variant is ever rendered
    // wider than that, so 1280px was over-serving and pushed the JPEG fallback
    // over the 250 KB hard budget (PERF-004).  Two widths cover the full range:
    //   480px — mobile viewports (≤ ~480 CSS px wide, gutter ≈ 48px)
    //   680px — desktop/tablet prose column at 1x DPR; also serves 340px @2x
    // The JPEG fallback is only generated at the largest width (680px) because
    // <picture> browsers always use AVIF/WebP; the JPEG is the last-resort path.
    source: 'inspirations/voyager-golden-record.jpg',
    widths: [480, 680],
    fallbackFormat: 'jpeg',
  },
  {
    source: 'graveyard/heydaniel.png',
    widths: [480, 768],
    fallbackFormat: 'jpeg',  // no alpha channel → JPEG is smaller
  },
  {
    source: 'graveyard/keywordlens.png',
    widths: [480, 768],
    fallbackFormat: 'jpeg',  // no alpha channel → JPEG is smaller
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256hex(buffer) {
  return 'sha256:' + createHash('sha256').update(buffer).digest('hex');
}

/**
 * Encode a buffer with sharp for the given format + width + height.
 * EXIF is stripped by default (sharp.withMetadata() is NOT called).
 * The output is tagged as sRGB so colour is preserved without embedding
 * the original profile (all sources are sRGB, confirmed by source metadata).
 *
 * @param {Buffer} src  source image buffer
 * @param {number} w    target width
 * @param {number} h    target height
 * @param {'avif'|'webp'|'jpeg'|'png'} fmt
 * @returns {Promise<Buffer>}
 */
async function encode(src, w, h, fmt) {
  let pipe = sharp(src).resize(w, h, { fit: 'fill', kernel: 'lanczos3' });

  switch (fmt) {
    case 'avif':
      pipe = pipe.avif({ quality: 65, effort: 4, chromaSubsampling: '4:2:0' });
      break;
    case 'webp':
      pipe = pipe.webp({ quality: 82, effort: 4 });
      break;
    case 'jpeg':
      pipe = pipe.jpeg({ quality: 85, progressive: true, mozjpeg: true });
      break;
    case 'png':
      pipe = pipe.png({ compressionLevel: 9, palette: false });
      break;
    default:
      throw new Error(`Unknown format: ${fmt}`);
  }

  return pipe.toBuffer();
}

// ─── Core pipeline ────────────────────────────────────────────────────────────

async function processSource(entry) {
  const sourcePath = join(root, 'media-source', entry.source);
  if (!existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  const sourceBuffer = await readFile(sourcePath);
  const { size: sourceSizeBytes } = await stat(sourcePath);
  const sourceHash = sha256hex(sourceBuffer);

  const meta = await sharp(sourceBuffer).metadata();
  const srcWidth = meta.width;
  const srcHeight = meta.height;
  const aspectRatio = srcHeight / srcWidth;

  const nameNoExt = basename(entry.source, extname(entry.source));
  const subdir = entry.source.includes('/')
    ? entry.source.substring(0, entry.source.lastIndexOf('/'))
    : '';

  const outDir = join(root, 'public', 'opt', subdir);
  mkdirSync(outDir, { recursive: true });

  const outputs = [];

  const maxWidth = Math.max(...entry.widths);

  for (const targetWidth of entry.widths) {
    // Never upscale — clamp to source width.
    const w = Math.min(targetWidth, srcWidth);
    const h = Math.round(w * aspectRatio);

    // AVIF and WebP are generated at every width (used in <source srcset>).
    // The fallback format (JPEG/PNG) is only generated at the largest width —
    // it is the <img src> for browsers without <picture> support; a single
    // size at highest quality is the right tradeoff and avoids unused files.
    const isLargestWidth = targetWidth === maxWidth;
    const formatsForWidth = isLargestWidth
      ? ['avif', 'webp', entry.fallbackFormat]
      : ['avif', 'webp'];

    for (const fmt of formatsForWidth) {
      // (fallbackFormat is never avif or webp for current sources, so no dedup needed).
      const ext = fmt === 'jpeg' ? 'jpg' : fmt;
      const filename = `${nameNoExt}-${w}.${ext}`;
      const outPath = join(outDir, filename);
      const relPath = `opt/${subdir ? subdir + '/' : ''}${filename}`;

      const outBuffer = await encode(sourceBuffer, w, h, fmt);
      writeFileSync(outPath, outBuffer);

      const kb = Math.round(outBuffer.length / 1024);
      console.log(`  → ${relPath} (${kb} KB)`);

      outputs.push({
        path: relPath,
        format: fmt,
        width: w,
        height: h,
        sizeBytes: outBuffer.length,
        contentHash: sha256hex(outBuffer),
      });
    }
  }

  return {
    source: `media-source/${entry.source}`,
    sourceHash,
    sourceSizeBytes,
    outputs,
  };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Media optimization pipeline ===\n');

  const manifestDir = join(root, 'evidence', 'performance');
  mkdirSync(manifestDir, { recursive: true });

  const manifestSources = [];
  for (const entry of MEDIA_SOURCES) {
    console.log(`Processing: media-source/${entry.source}`);
    const result = await processSource(entry);
    manifestSources.push(result);
    const savedKb = Math.round(
      (result.sourceSizeBytes - result.outputs.filter(o => o.format === entry.fallbackFormat && o.width === Math.max(...entry.widths)).reduce((_, o) => o.sizeBytes, 0)) / 1024
    );
    console.log(`  ✓ ${result.outputs.length} outputs (source was ${Math.round(result.sourceSizeBytes / 1024)} KB)\n`);
  }

  const manifest = {
    generated: new Date().toISOString(),
    version: 1,
    sources: manifestSources,
  };

  const manifestPath = join(manifestDir, 'asset-pipeline-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  const totalOutputs = manifestSources.reduce((n, s) => n + s.outputs.length, 0);
  console.log(`✓ Manifest written: evidence/performance/asset-pipeline-manifest.json`);
  console.log(`  ${manifestSources.length} source(s) → ${totalOutputs} output file(s)`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
