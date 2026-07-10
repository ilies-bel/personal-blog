// check-links.mjs — crawl the built site (dist/) and verify every internal
// reference resolves to a real build artifact. Zero dependencies: the build
// output is static, so a file-system walk is the whole truth.
//
//   node scripts/check-links.mjs [dist]
//
// Checks every href/src/srcset/poster in every dist/**/*.html, plus <link>
// preloads and og/twitter image URLs on the site's own origin. External URLs
// (other origins) are listed but not fetched — network checks belong to the
// scheduled prod-crawl workflow, not the build gate. Exit 1 on any broken
// internal reference.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const distDir = resolve(process.argv[2] ?? 'dist');
const SITE_ORIGIN = 'https://ilies-bel.dev';

if (!existsSync(distDir)) {
  console.error(`check-links: build directory not found: ${distDir} (run the build first)`);
  process.exit(1);
}

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

const files = walk(distDir);
const htmlFiles = files.filter((f) => f.endsWith('.html'));

/** Does an internal absolute path (e.g. /writing or /assets/x.css) resolve? */
function resolvesInternally(urlPath) {
  // Strip query + fragment.
  const clean = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  if (clean === '' || clean === '/') return existsSync(join(distDir, 'index.html'));
  const rel = clean.replace(/^\//, '');
  // A file (has an extension) must exist as-is.
  if (/\.[a-z0-9]+$/i.test(rel)) return existsSync(join(distDir, rel));
  // A directory-style route: /foo -> foo/index.html (build.format 'directory'),
  // with /foo.html accepted as a fallback shape.
  return (
    existsSync(join(distDir, rel, 'index.html')) ||
    existsSync(join(distDir, `${rel}.html`)) ||
    existsSync(join(distDir, rel))
  );
}

// Pull candidate URLs out of an HTML document. Attribute-based extraction is
// enough for a static Astro build (no client-side route generation to miss).
function extractRefs(html) {
  const refs = [];
  const attrRe = /\b(?:href|src|poster)\s*=\s*["']([^"']+)["']/g;
  for (const m of html.matchAll(attrRe)) refs.push(m[1]);
  // srcset: comma-separated "url size" pairs.
  const srcsetRe = /\bsrcset\s*=\s*["']([^"']+)["']/g;
  for (const m of html.matchAll(srcsetRe)) {
    for (const part of m[1].split(',')) {
      const url = part.trim().split(/\s+/)[0];
      if (url) refs.push(url);
    }
  }
  // Meta content URLs (og:image, twitter:image).
  const metaRe = /\bcontent\s*=\s*["'](https?:\/\/[^"']+|\/[^"']*)["']/g;
  for (const m of html.matchAll(metaRe)) refs.push(m[1]);
  return refs;
}

const broken = [];
const externals = new Set();

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const page = file.slice(distDir.length);
  for (const raw of extractRefs(html)) {
    const ref = raw.trim();
    if (
      ref === '' ||
      ref.startsWith('#') ||
      ref.startsWith('mailto:') ||
      ref.startsWith('tel:') ||
      ref.startsWith('data:') ||
      ref.startsWith('javascript:')
    ) {
      continue;
    }
    // Protocol-relative URLs are always a bug in this codebase (the favicon
    // regression this script exists to catch).
    if (ref.startsWith('//')) {
      broken.push({ page, ref, reason: 'protocol-relative URL' });
      continue;
    }
    if (/^https?:\/\//.test(ref)) {
      if (ref.startsWith(SITE_ORIGIN)) {
        const path = ref.slice(SITE_ORIGIN.length) || '/';
        if (!resolvesInternally(path)) broken.push({ page, ref, reason: 'own-origin URL missing from build' });
      } else {
        externals.add(ref);
      }
      continue;
    }
    if (ref.startsWith('/')) {
      if (!resolvesInternally(ref)) broken.push({ page, ref, reason: 'missing from build' });
      continue;
    }
    // Relative URL: resolve against the page's directory.
    const pageDir = page.replace(/[^/]*$/, '');
    const abs = new URL(ref, `https://x${pageDir}`).pathname;
    if (!resolvesInternally(abs)) broken.push({ page, ref, reason: 'missing from build (relative)' });
  }
}

console.log(`check-links: ${htmlFiles.length} pages scanned, ${externals.size} external URLs (not fetched)`);

if (broken.length > 0) {
  console.error(`\n${broken.length} broken internal reference(s):`);
  for (const b of broken) console.error(`  ${b.page}  →  ${b.ref}  (${b.reason})`);
  process.exit(1);
}
console.log('check-links: all internal references resolve ✓');
