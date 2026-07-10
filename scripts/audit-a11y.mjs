// scripts/audit-a11y.mjs — A11Y-005 measured contrast + target-size audit
//
// Measures WCAG 2.2 AA contrast ratios for every text/control/state combination
// across actual lifecycle frames (screenshotted from the live e2e harness) and
// produces a census of interactive target sizes on coarse-pointer (mobile)
// layouts.
//
// Usage:
//   npm run build                     # build static site first
//   node scripts/audit-a11y.mjs       # starts astro preview internally
//
//   BASE=http://localhost:4321 node scripts/audit-a11y.mjs   # use running server
//
// Output: evidence/accessibility/measured-contrast-targets.csv
//
// What is measured
//   contrast_ratio   — WCAG relative-luminance ratio: foreground from CSS
//                      computed color (normalised to rgb() via Canvas 2D fill);
//                      background sampled from a Playwright screenshot of the
//                      live composited frame (captures WebGL canvas backgrounds).
//   wcag_aa_pass     — ≥ 4.5:1 (normal text), ≥ 3:1 (large text / UI component)
//   target_size_pass — ≥ 44×44 px (project policy, stricter than WCAG 2.2 AA)
//
// Viewport passes:
//   desktop 1440×900 — contrast measurements for every text/control/state
//   mobile  375×812  — target-size census on a coarse-pointer layout

import { chromium } from '@playwright/test';
import { spawn }     from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root    = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(root, 'evidence', 'accessibility');
const OUT_FILE = resolve(OUT_DIR, 'measured-contrast-targets.csv');
const DIST    = resolve(root, 'dist');

const STAGE_COUNT = 5;
/** Project policy: touch targets must be at least 44×44 px. */
const TARGET_SIZE_MIN = 44;
/** ms to wait after scrolling for WebGL morph smoothing to converge. */
const SETTLE_MS = 3_000;
/** ms to wait after page load for React islands to hydrate. */
const HYDRATE_MS = 4_000;

// Pick a high port to avoid clashing with the many other worktrees' servers.
const PREVIEW_PORT = 4350;
const PREVIEW_BASE = `http://localhost:${PREVIEW_PORT}`;
const EXTERNAL_BASE = process.env.BASE;

// ─── Lifecycle states ────────────────────────────────────────────────────────
// progress 0 → stage 0 → Black Hole (top of page)
// progress 1 → stage 5 → Pale Blue Dot (bottom of page)
const HERO_STATES = [
  { id: 'black-hole-opening', progress: 0.0,                  label: 'Black Hole (opening)' },
  { id: 'black-hole',         progress: 0.05,                 label: 'Black Hole'            },
  { id: 'red-giant',          progress: 2.05  / STAGE_COUNT,  label: 'Red Giant'             },
  { id: 'yellow-star',        progress: 2.915 / STAGE_COUNT,  label: 'Yellow Star'           },
  { id: 'nebula',             progress: 3.5   / STAGE_COUNT,  label: 'Nebula'                },
  { id: 'pale-blue-dot',      progress: 4.7   / STAGE_COUNT,  label: 'Pale Blue Dot'         },
];

// ─── Hero elements ────────────────────────────────────────────────────────────
// textSize drives the WCAG AA threshold:
//   'large' → ≥ 3:1  (≥ 18 pt / ≥ 14 pt bold)
//   'body'  → 4.5:1  (16 px body copy)
//   'small' → 4.5:1  (11–13 px HUD / nav labels)
//   'micro' → 4.5:1  (10 px micro labels)
//   'n/a'   → iconographic UI component: 3:1
const HERO_ELEMENTS = [
  { sel: '.bh-identity-name',        name: 'identity-name',     role: 'text',        textSize: 'body',  isInteractive: false },
  { sel: '.bh-identity-role',        name: 'identity-role',     role: 'text',        textSize: 'small', isInteractive: false },
  { sel: '.bh-beat-line',            name: 'manifesto-headline',role: 'heading',     textSize: 'large', isInteractive: false },
  { sel: '.bh-beat-whisper',         name: 'manifesto-whisper', role: 'text',        textSize: 'body',  isInteractive: false },
  { sel: '.overlay-blog-label',      name: 'scene-nav-label',   role: 'text',        textSize: 'small', isInteractive: false },
  { sel: '.overlay-blog-link',       name: 'scene-nav-link',    role: 'interactive', textSize: 'small', isInteractive: true  },
  { sel: '.overlay-blog-power',      name: 'hud-power-btn',     role: 'button',      textSize: 'n/a',   isInteractive: true  },
  { sel: '.scene-toggle',            name: 'scene-toggle-btn',  role: 'button',      textSize: 'n/a',   isInteractive: true  },
  { sel: '.hud-nav-button',          name: 'hud-nav-btn',       role: 'interactive', textSize: 'small', isInteractive: true  },
  { sel: '.hud-nav-number',          name: 'hud-nav-number',    role: 'text',        textSize: 'micro', isInteractive: false },
  { sel: '.hud-nav-title',           name: 'hud-nav-title',     role: 'text',        textSize: 'small', isInteractive: false },
  { sel: '.hud-compass-label',       name: 'compass-label',     role: 'text',        textSize: 'small', isInteractive: false },
  { sel: '.hud-frame-readout-stage', name: 'frame-readout',     role: 'text',        textSize: 'micro', isInteractive: false },
  { sel: '.hud-arc-label-title',     name: 'arc-label-title',   role: 'text',        textSize: 'small', isInteractive: false },
  { sel: '.star-marker-card-headline', name: 'marker-headline', role: 'text',        textSize: 'body',  isInteractive: false },
];

// ─── Reading pages ────────────────────────────────────────────────────────────
// Use trailing-slash URLs — astro preview serves directory-format builds at
// the trailing-slash path (/writing/ → /writing/index.html).
const READING_PAGES = [
  { route: '/writing/',          label: 'Writing'          },
  { route: '/about/',            label: 'About'            },
  { route: '/projects/',         label: 'Projects'         },
  { route: '/graveyard/',        label: 'Graveyard'        },
  { route: '/behind-the-build/', label: 'Behind the Build' },
];

const PAGE_ELEMENTS = [
  { sel: 'h1',              name: 'page-h1',       role: 'heading',     textSize: 'large', isInteractive: false },
  { sel: 'h2',              name: 'page-h2',       role: 'heading',     textSize: 'large', isInteractive: false },
  { sel: 'h3',              name: 'page-h3',       role: 'heading',     textSize: 'body',  isInteractive: false },
  { sel: 'p',               name: 'body-text',     role: 'text',        textSize: 'body',  isInteractive: false },
  { sel: '.subnav-link',    name: 'subnav-link',   role: 'interactive', textSize: 'small', isInteractive: true  },
  { sel: '.subnav-label',   name: 'subnav-label',  role: 'text',        textSize: 'small', isInteractive: false },
  { sel: 'article a',       name: 'article-link',  role: 'link',        textSize: 'body',  isInteractive: true  },
  { sel: 'button',          name: 'page-button',   role: 'button',      textSize: 'small', isInteractive: true  },
];

// ─── WCAG math ────────────────────────────────────────────────────────────────
function parseRgb(cssColor) {
  if (!cssColor) return null;
  const m = cssColor.match(/^rgb\((\d+),(\d+),(\d+)\)$/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

function linearise(c8) {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]) {
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

function contrastRatio(rgb1, rgb2) {
  const l1 = relativeLuminance(rgb1), l2 = relativeLuminance(rgb2);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function wcagMinContrast(textSize, role) {
  if (textSize === 'n/a' || textSize === 'large')               return 3.0;
  if (role === 'interactive' || role === 'button' || role === 'link') return 3.0;
  return 4.5;
}

// ─── DOM collection ───────────────────────────────────────────────────────────
/**
 * Find the first in-viewport visible instance of each selector.
 * Uses Canvas 2D to normalise any CSS colour (OKLCH, HSL, …) to rgb().
 * checkParentVisibility=true also checks the direct parent's computed opacity.
 */
async function collectDomData(page, selectors) {
  return page.evaluate((sels) => {
    function normColorToRgb(cssColor) {
      const c = document.createElement('canvas');
      c.width = 1; c.height = 1;
      const ctx = c.getContext('2d');
      ctx.fillStyle = cssColor;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')';
    }

    function isVisible(el) {
      let node = el;
      while (node && node !== document.documentElement) {
        const s = window.getComputedStyle(node);
        if (s.display === 'none')    return false;
        if (s.visibility === 'hidden') return false;
        if (parseFloat(s.opacity) < 0.05) return false;
        node = node.parentElement;
      }
      return true;
    }

    return sels.map((sel) => {
      const candidates = document.querySelectorAll(sel);
      for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        // Must have non-zero size
        if (rect.width === 0 || rect.height === 0) continue;
        // Must overlap the viewport
        if (rect.bottom < 0 || rect.top  > window.innerHeight) continue;
        if (rect.right  < 0 || rect.left > window.innerWidth)  continue;
        // Walk ancestors for hidden/invisible CSS
        if (!isVisible(el)) continue;
        const style = window.getComputedStyle(el);
        return {
          rect:       { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          color:      normColorToRgb(style.color),
          fontSize:   style.fontSize,
          fontWeight: style.fontWeight,
        };
      }
      return null;
    });
  }, selectors);
}

// ─── Pixel sampling ───────────────────────────────────────────────────────────
async function samplePixelsBatch(page, screenshotB64, coords) {
  return page.evaluate(
    ({ b64, points }) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width  = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(points.map((pt) => {
            if (!pt) return null;
            // Clamp coordinates to image bounds
            const x = Math.min(Math.max(0, pt[0]), canvas.width  - 1);
            const y = Math.min(Math.max(0, pt[1]), canvas.height - 1);
            const d = ctx.getImageData(x, y, 1, 1).data;
            return [d[0], d[1], d[2]];
          }));
        };
        img.onerror = () => resolve(points.map(() => null));
        img.src = 'data:image/png;base64,' + b64;
      }),
    { b64: screenshotB64, points: coords },
  );
}

// ─── Measure a batch ─────────────────────────────────────────────────────────
async function measureBatch(page, screenshotB64, elDefs, route, lifecycleState, viewport) {
  const domData = await collectDomData(page, elDefs.map((e) => e.sel));

  const coords = domData.map((d) =>
    d ? [Math.round(d.rect.left + d.rect.width / 2), Math.round(d.rect.top + d.rect.height / 2)]
      : null,
  );
  const bgPixels = await samplePixelsBatch(page, screenshotB64, coords);

  return elDefs.flatMap((elDef, i) => {
    const dom = domData[i];
    const bg  = bgPixels[i];
    if (!dom || !bg) return [];

    const fgRgb = parseRgb(dom.color);
    if (!fgRgb) return [];

    const fontPx  = parseFloat(dom.fontSize);
    const isBold  = parseInt(dom.fontWeight, 10) >= 700;
    const isLarge = fontPx >= 24 || (isBold && fontPx >= 18.67);
    const effSize = isLarge ? 'large' : elDef.textSize;
    const req     = wcagMinContrast(effSize, elDef.role);
    const ratio   = contrastRatio(fgRgb, bg);

    let targetWPx = 'N/A', targetHPx = 'N/A', targetSizePass = 'N/A';
    if (elDef.isInteractive) {
      targetWPx      = Math.round(dom.rect.width);
      targetHPx      = Math.round(dom.rect.height);
      targetSizePass = (targetWPx >= TARGET_SIZE_MIN && targetHPx >= TARGET_SIZE_MIN) ? 'PASS' : 'FAIL';
    }

    return [{
      element:        elDef.name,
      selector:       elDef.sel,
      route,
      lifecycleState,
      viewport,
      role:           elDef.role,
      textSize:       effSize,
      fontSizePx:     Math.round(fontPx),
      fgRgb:          dom.color,
      bgRgb:          `rgb(${bg.join(',')})`,
      contrastRatio:  ratio.toFixed(2),
      wcagRequired:   req.toFixed(1),
      wcagAAPass:     ratio >= req ? 'PASS' : 'FAIL',
      targetWPx,
      targetHPx,
      targetSizePass,
    }];
  });
}

// ─── Hero scroll ──────────────────────────────────────────────────────────────
async function scrollHeroTo(page, progress) {
  await page.evaluate((p) => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, Math.round(max * p));
  }, progress);
  await page.waitForTimeout(SETTLE_MS);
}

// ─── Server management ────────────────────────────────────────────────────────
async function waitForServer(url, fingerprint, maxMs = 45_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4_000) });
      if (res.status < 400) {
        if (!fingerprint) return;
        const text = await res.text();
        if (text.includes(fingerprint)) return;
      }
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error(`Server at ${url} did not become ready (with fingerprint) in ${maxMs / 1000}s`);
}

async function startPreviewServer() {
  const astro = resolve(root, 'node_modules', '.bin', 'astro');
  const proc  = spawn(
    astro,
    ['preview', '--port', String(PREVIEW_PORT), '--host', 'localhost'],
    { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  proc.on('exit', (code) => {
    if (code !== null && code !== 0 && code !== 143) {
      process.stderr.write(`[audit-a11y] astro preview exited: code ${code}\n`);
    }
  });
  // Verify it's serving OUR site by checking for a known string in the homepage
  await waitForServer(`${PREVIEW_BASE}/`, 'ILIÈS', 45_000);
  return proc;
}

// ─── CSV ─────────────────────────────────────────────────────────────────────
const CSV_COLS = [
  ['element',          'element'],
  ['selector',         'selector'],
  ['route',            'route'],
  ['lifecycle_state',  'lifecycleState'],
  ['viewport',         'viewport'],
  ['role',             'role'],
  ['text_size',        'textSize'],
  ['font_size_px',     'fontSizePx'],
  ['fg_rgb',           'fgRgb'],
  ['bg_rgb',           'bgRgb'],
  ['contrast_ratio',   'contrastRatio'],
  ['wcag_aa_required', 'wcagRequired'],
  ['wcag_aa_pass',     'wcagAAPass'],
  ['target_w_px',      'targetWPx'],
  ['target_h_px',      'targetHPx'],
  ['target_size_pass', 'targetSizePass'],
];

function csvEscape(v) {
  const s = String(v ?? '');
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function rowToCsv(row) {
  return CSV_COLS.map(([, key]) => csvEscape(row[key])).join(',');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Verify dist/ exists (so we can give a clear error rather than a mystery 404)
  try {
    await access(resolve(DIST, 'index.html'));
  } catch {
    process.stderr.write('[audit-a11y] dist/index.html not found — run "npm run build" first.\n');
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  let serverProc = null;
  const base = EXTERNAL_BASE ?? PREVIEW_BASE;

  if (!EXTERNAL_BASE) {
    console.log(`[audit-a11y] Starting astro preview on port ${PREVIEW_PORT} …`);
    try {
      serverProc = await startPreviewServer();
      console.log(`[audit-a11y] Preview server ready → ${PREVIEW_BASE}`);
    } catch (err) {
      process.stderr.write(`[audit-a11y] Preview server error: ${err.message}\n`);
      process.exit(1);
    }
  }

  const allRows = [];
  const browser = await chromium.launch();

  try {
    // ════════════════════════════════════════════════════════════════════════
    // PASS A — Desktop 1440×900: contrast measurements
    // ════════════════════════════════════════════════════════════════════════
    const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    // Hero page
    {
      const heroPage = await desktopCtx.newPage();
      await heroPage.goto(`${base}/`, { waitUntil: 'networkidle' });
      await heroPage.waitForTimeout(HYDRATE_MS);

      for (const state of HERO_STATES) {
        await scrollHeroTo(heroPage, state.progress);
        const buf  = await heroPage.screenshot({ fullPage: false });
        const b64  = buf.toString('base64');
        const rows = await measureBatch(heroPage, b64, HERO_ELEMENTS, '/', state.label, '1440x900');
        allRows.push(...rows);
        console.log(`[audit-a11y] hero / ${state.label}: ${rows.length} rows`);
      }
      await heroPage.close();
    }

    // Reading pages
    {
      const readPage = await desktopCtx.newPage();
      for (const pg of READING_PAGES) {
        await readPage.goto(`${base}${pg.route}`, { waitUntil: 'networkidle' });
        await readPage.waitForTimeout(HYDRATE_MS);
        const buf  = await readPage.screenshot({ fullPage: false });
        const b64  = buf.toString('base64');
        const rows = await measureBatch(readPage, b64, PAGE_ELEMENTS, pg.route, 'n/a', '1440x900');
        allRows.push(...rows);
        console.log(`[audit-a11y] ${pg.label}: ${rows.length} rows`);
      }
      await readPage.close();
    }

    await desktopCtx.close();

    // ════════════════════════════════════════════════════════════════════════
    // PASS B — Mobile 375×812: target-size census
    // ════════════════════════════════════════════════════════════════════════
    const mobileCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const iHero = HERO_ELEMENTS.filter((e) => e.isInteractive);
    const iPage = PAGE_ELEMENTS.filter((e) => e.isInteractive);

    // Hero (post-opening black-hole frame)
    {
      const mPage = await mobileCtx.newPage();
      await mPage.goto(`${base}/`, { waitUntil: 'networkidle' });
      await mPage.waitForTimeout(HYDRATE_MS);
      await scrollHeroTo(mPage, 0.05);
      const buf  = await mPage.screenshot({ fullPage: false });
      const b64  = buf.toString('base64');
      const rows = await measureBatch(mPage, b64, iHero, '/', 'Black Hole', '375x812');
      allRows.push(...rows);
      console.log(`[audit-a11y] hero / mobile: ${rows.length} rows`);
      await mPage.close();
    }

    // Reading pages (mobile)
    {
      const mPage = await mobileCtx.newPage();
      for (const pg of READING_PAGES) {
        await mPage.goto(`${base}${pg.route}`, { waitUntil: 'networkidle' });
        await mPage.waitForTimeout(HYDRATE_MS);
        const buf  = await mPage.screenshot({ fullPage: false });
        const b64  = buf.toString('base64');
        const rows = await measureBatch(mPage, b64, iPage, pg.route, 'n/a', '375x812');
        allRows.push(...rows);
        console.log(`[audit-a11y] ${pg.label} / mobile: ${rows.length} rows`);
      }
      await mPage.close();
    }

    await mobileCtx.close();

  } finally {
    await browser.close();
    if (serverProc) serverProc.kill('SIGTERM');
  }

  // ── Write CSV ─────────────────────────────────────────────────────────────
  const header = CSV_COLS.map(([h]) => h).join(',');
  const csv    = [header, ...allRows.map(rowToCsv)].join('\n') + '\n';
  await writeFile(OUT_FILE, csv, 'utf8');

  // ── Summary ───────────────────────────────────────────────────────────────
  const contrastFails = allRows.filter((r) => r.wcagAAPass === 'FAIL');
  const targetFails   = allRows.filter((r) => r.targetSizePass === 'FAIL');

  console.log('\n' + '═'.repeat(66));
  console.log(`[audit-a11y] ${allRows.length} measurements → ${OUT_FILE}`);
  console.log(`  WCAG 2.2 AA contrast failures : ${contrastFails.length}`);
  console.log(`  Target-size failures (< 44px) : ${targetFails.length}`);

  if (contrastFails.length > 0) {
    console.log('\nContrast failures:');
    contrastFails.forEach((f) =>
      console.log(`  [${f.viewport}][${f.lifecycleState}] ${f.element} @ ${f.route} — ${f.contrastRatio}:1 (need ≥ ${f.wcagRequired}:1) fg=${f.fgRgb} bg=${f.bgRgb}`),
    );
  }
  if (targetFails.length > 0) {
    console.log('\nTarget-size failures (< 44×44 px):');
    targetFails.forEach((f) =>
      console.log(`  [${f.viewport}][${f.lifecycleState}] ${f.element} @ ${f.route} — ${f.targetWPx}×${f.targetHPx}px`),
    );
  }
  console.log('═'.repeat(66) + '\n');

  if (allRows.length === 0) {
    process.stderr.write('[audit-a11y] ERROR: 0 measurements — check server and page rendering.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`[audit-a11y] Fatal: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
