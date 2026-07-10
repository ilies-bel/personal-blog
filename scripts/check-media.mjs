// scripts/check-media.mjs — CI guard for the media optimization pipeline.
//
// Validates:
//   1. Every manifest output entry has intrinsic dimensions.
//   2. No output entry exceeds 500 KB unless listed in media-approvals.json.
//   3. No two outputs share the same content hash (duplicate asset detection).
//   4. No raster ≥ 100 KB that was copied from public/ into dist/ is unreferenced
//      in any HTML/CSS/JS file in dist/ unless it has an approval entry.
//
// Exports the three pure validation functions for unit testing.
// The CLI entry-point runs only when the script is invoked directly.
//
// Usage: node scripts/check-media.mjs   (run AFTER npm run build)

import { readFileSync, existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, extname, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const RASTER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp', '.avif']);
const SIZE_LIMIT = 500 * 1024; // 500 KB — hard gate per task brief
const UNUSED_MIN_BYTES = 100 * 1024; // only flag "unused" for files ≥ 100 KB

// ─── Pure functions (exported for unit testing) ───────────────────────────────

/**
 * Validate a single manifest output entry.
 *
 * @param {{ path: string, width?: number, height?: number, sizeBytes: number, contentHash?: string }} entry
 * @param {Record<string, { reason: string }>} approvals
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateEntry(entry, approvals) {
  const errors = [];

  if (!entry.width || !entry.height) {
    errors.push(
      `${entry.path}: missing intrinsic dimensions — both width and height are required in the manifest`
    );
  }

  if (entry.sizeBytes > SIZE_LIMIT && !approvals[entry.path]) {
    errors.push(
      `${entry.path}: ${Math.round(entry.sizeBytes / 1024)} KB exceeds the 500 KB raster limit — ` +
        `add an entry to media-approvals.json to override (include a reason)`
    );
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Find entries that share an identical content hash (duplicate assets).
 *
 * @param {Array<{ path: string, contentHash?: string, sizeBytes: number }>} entries
 * @returns {Array<{ hash: string, paths: string[] }>}
 */
export function findDuplicates(entries) {
  /** @type {Map<string, string[]>} */
  const byHash = new Map();
  for (const entry of entries) {
    if (!entry.contentHash) continue;
    const bucket = byHash.get(entry.contentHash) ?? [];
    bucket.push(entry.path);
    byHash.set(entry.contentHash, bucket);
  }
  return Array.from(byHash.entries())
    .filter(([, paths]) => paths.length > 1)
    .map(([hash, paths]) => ({ hash, paths }));
}

/**
 * Return the subset of distRasterPaths that are not mentioned in referencedPaths.
 * Comparison is normalised: leading slashes are stripped before lookup so that
 * "/foo/bar.png" and "foo/bar.png" are treated as the same reference.
 *
 * @param {string[]} distRasterPaths  paths relative to the dist root (no leading slash)
 * @param {Set<string>} referencedPaths  raw href/src/url values found in dist/ text files
 * @returns {string[]}
 */
export function findUnused(distRasterPaths, referencedPaths) {
  // Normalise every reference to strip the leading slash once, then look up
  // both the slashed and un-slashed form.
  const normalised = new Set(
    [...referencedPaths].map(p => (p.startsWith('/') ? p.slice(1) : p))
  );
  return distRasterPaths.filter(p => {
    const key = p.startsWith('/') ? p.slice(1) : p;
    return !normalised.has(key);
  });
}

// ─── CLI helpers (not exported — only used when run directly) ─────────────────

/**
 * Recursively collect all raster image paths under a directory.
 * @param {string} dir
 * @returns {Promise<string[]>} absolute paths
 */
async function collectRasterFiles(dir) {
  const results = [];
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (RASTER_EXTS.has(extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
  }
  await walk(dir);
  return results;
}

/**
 * Scan all HTML/CSS/JS files in distDir and collect image path references.
 * Handles src="", href="", srcset="", url(), and content="" patterns.
 * @param {string} distDir
 * @returns {Promise<Set<string>>}
 */
async function collectReferences(distDir) {
  const refs = new Set();
  const textExts = new Set(['.html', '.css', '.js', '.mjs', '.json', '.xml', '.txt']);

  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (textExts.has(extname(entry.name).toLowerCase())) {
        let content;
        try {
          content = await readFile(full, 'utf8');
        } catch {
          continue;
        }

        /**
         * Normalise a raw attribute value to a pathname for comparison.
         * Absolute URLs (https://example.com/img.png) → strip origin.
         * Relative paths → kept as-is.
         */
        const toPathname = (raw) => {
          try {
            return new URL(raw).pathname;
          } catch {
            return raw; // not an absolute URL — already a relative path
          }
        };

        // Single-value attributes: src="...", href="...", content="..."
        // Uses case-insensitive flag (i) to catch camelCase srcSet produced by JSX renderers.
        const attrPat = /(?:src|href|content)\s*=\s*["']([^"'\s>]+)["']/gi;
        let m;
        while ((m = attrPat.exec(content)) !== null) {
          const raw = m[1];
          if (RASTER_EXTS.has(extname(raw.split('?')[0]).toLowerCase())) {
            refs.add(toPathname(raw));
          }
        }

        // srcset / srcSet — multi-value (case-insensitive for JSX camelCase output).
        const srcsetPat = /srcset\s*=\s*["']([^"']+)["']/gi;
        while ((m = srcsetPat.exec(content)) !== null) {
          for (const part of m[1].split(',')) {
            const path = part.trim().split(/\s+/)[0];
            if (path && RASTER_EXTS.has(extname(path.split('?')[0]).toLowerCase())) {
              refs.add(toPathname(path));
            }
          }
        }

        // CSS url(...) — background-image, mask-image, etc.
        const urlPat = /url\s*\(\s*["']?([^"')\s]+)["']?\s*\)/g;
        while ((m = urlPat.exec(content)) !== null) {
          const raw = m[1];
          if (RASTER_EXTS.has(extname(raw.split('?')[0]).toLowerCase())) {
            refs.add(raw);
          }
        }
      }
    }
  }
  await walk(distDir);
  return refs;
}

// ─── CLI entry-point ──────────────────────────────────────────────────────────

async function main() {
  const manifestPath = join(root, 'evidence', 'performance', 'asset-pipeline-manifest.json');
  const approvalsPath = join(root, 'media-approvals.json');
  const distDir = join(root, 'dist');

  let errorCount = 0;
  const report = [];

  const fail = (msg) => {
    errorCount++;
    report.push(`  ✗ ${msg}`);
  };

  // ── 1. Load manifest ────────────────────────────────────────────────────────
  if (!existsSync(manifestPath)) {
    console.error('✗ Manifest not found:', manifestPath);
    console.error('  Run: npm run optimize-media   then commit the generated files.');
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  // ── 2. Load approvals ───────────────────────────────────────────────────────
  /** @type {Record<string, { reason: string }>} */
  const approvals = existsSync(approvalsPath)
    ? JSON.parse(readFileSync(approvalsPath, 'utf8'))
    : {};

  // ── 3. Validate manifest entries (dimensions + size limit) ──────────────────
  const allOutputs = manifest.sources.flatMap(s => s.outputs ?? []);

  for (const entry of allOutputs) {
    const { errors } = validateEntry(entry, approvals);
    for (const e of errors) fail(e);
  }

  // ── 4. Duplicate content-hash detection ─────────────────────────────────────
  const dupes = findDuplicates(allOutputs);
  for (const { hash, paths } of dupes) {
    fail(`Duplicate content hash (${hash.slice(0, 20)}…): ${paths.join(', ')}`);
  }

  // ── 5. Scan dist/ for rasters not in the manifest ──────────────────────────
  if (!existsSync(distDir)) {
    console.warn('⚠  dist/ not found — build first with: npm run build');
    process.exit(1);
  }

  const distRasters = await collectRasterFiles(distDir);
  const manifestPaths = new Set(allOutputs.map(o => o.path));

  // Check rasters that are in dist/ but NOT tracked by the manifest.
  for (const rasterPath of distRasters) {
    const relPath = relative(distDir, rasterPath).replace(/\\/g, '/');
    if (manifestPaths.has(relPath)) continue; // already validated above
    const { size } = await stat(rasterPath);
    if (size > SIZE_LIMIT && !approvals[relPath]) {
      fail(
        `${relPath}: ${Math.round(size / 1024)} KB exceeds the 500 KB limit ` +
          `(not tracked in manifest and not approved)`
      );
    }
  }

  // ── 6. Unused asset detection ───────────────────────────────────────────────
  const refs = await collectReferences(distDir);
  const distRasterRels = distRasters.map(p => relative(distDir, p).replace(/\\/g, '/'));

  // Only check rasters ≥ UNUSED_MIN_BYTES — small icons/favicons are fine to leave.
  const largeRasterRels = [];
  for (const relPath of distRasterRels) {
    const full = join(distDir, relPath);
    const { size } = await stat(full);
    if (size >= UNUSED_MIN_BYTES) largeRasterRels.push(relPath);
  }

  const unused = findUnused(largeRasterRels, refs);
  for (const u of unused) {
    if (approvals[u]?.unusedOk) continue; // explicitly approved as JS-loaded
    fail(
      `Unused asset in dist: ${u} (≥ ${Math.round(UNUSED_MIN_BYTES / 1024)} KB and not referenced ` +
        `in any HTML/CSS/JS — remove it, or add an approval entry with unusedOk: true if loaded by script)`
    );
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  if (errorCount > 0) {
    console.error('\nMedia pipeline check FAILED:');
    for (const line of report) console.error(line);
    console.error(`\n${errorCount} error(s) found.`);
    process.exit(1);
  }

  const outputCount = allOutputs.length;
  console.log(
    `✓ Media pipeline OK — ${manifest.sources.length} source(s), ` +
      `${outputCount} manifest output(s), 0 errors.`
  );
}

// Run CLI only when this script is the entry point, not when imported for testing.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
