// check-og-cards.mjs — the OG-card gate (P12).
//
//   node scripts/check-og-cards.mjs [dist]
//
// Every page in the built site must ship a WORKING share card: this walks
// every dist/**/*.html, reads its og:image (and twitter:image) URL, and
// asserts that the referenced file
//   1. resolves to a real file in dist (same-origin URLs only — external
//      og images would be a bug here, the site owns all its cards),
//   2. is ≤ OG_MAX_BYTES (300KB — share crawlers time out on fat images and
//      some proxies refuse them; the sitewide raster gate's 500KB is too lax
//      for a card fetched by every unfurl),
//   3. is exactly 1200×630 (the OG/Twitter summary_large_image canvas —
//      anything else gets platform-cropped unpredictably).
//
// Complements check-links.mjs (which already proves the URL resolves) with
// the size/dimension contract, and the e2e og spec (which proves the served
// bytes over HTTP). Runs in CI right after check-asset-sizes.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const distDir = resolve(process.argv[2] ?? 'dist');
const SITE_ORIGIN = 'https://ilies-bel.dev';
const OG_MAX_BYTES = 300 * 1024;
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

if (!existsSync(distDir)) {
  console.error(`check-og-cards: build directory not found: ${distDir} (run the build first)`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const htmlFiles = walk(distDir).filter((f) => f.endsWith('.html'));
const failures = [];
/** page → og-image dist-relative path (deduped so shared cards check once). */
const cardsByPage = new Map();

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const page = file.slice(distDir.length);
  const m =
    html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ??
    html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
  if (!m) {
    failures.push(`${page}: no og:image meta tag`);
    continue;
  }
  const url = m[1];
  if (!url.startsWith(SITE_ORIGIN + '/')) {
    failures.push(`${page}: og:image is off-origin (${url})`);
    continue;
  }
  cardsByPage.set(page, decodeURIComponent(new URL(url).pathname).replace(/^\//, ''));
  // twitter:image must agree with og:image (BaseHead emits both from one prop).
  const t = html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
  if (t && t[1] !== url) failures.push(`${page}: twitter:image (${t[1]}) ≠ og:image (${url})`);
}

const checked = new Map(); // rel path → result string, so shared cards verify once
for (const [page, rel] of cardsByPage) {
  if (!checked.has(rel)) {
    const abs = join(distDir, rel);
    if (!existsSync(abs)) {
      checked.set(rel, `missing from dist`);
    } else {
      const size = statSync(abs).size;
      const meta = await sharp(abs).metadata();
      const problems = [];
      if (size > OG_MAX_BYTES)
        problems.push(`${(size / 1024).toFixed(0)}KB > ${OG_MAX_BYTES / 1024}KB cap`);
      if (meta.width !== OG_WIDTH || meta.height !== OG_HEIGHT)
        problems.push(`${meta.width}×${meta.height} ≠ ${OG_WIDTH}×${OG_HEIGHT}`);
      checked.set(rel, problems.length ? problems.join('; ') : null);
    }
  }
  const problem = checked.get(rel);
  if (problem) failures.push(`${page}: og:image /${rel} — ${problem}`);
}

const distinct = [...checked.keys()];
console.log(
  `check-og-cards: ${cardsByPage.size} page(s) → ${distinct.length} distinct card(s) checked`,
);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  console.error(
    '\ncheck-og-cards: FAIL — regenerate with `pnpm build && node scripts/gen-og-cards.mjs && node scripts/optimize-public-images.mjs && pnpm build`.',
  );
  process.exit(1);
}
console.log('check-og-cards: OK — every page ships a resolvable 1200×630 card ≤300KB.');
