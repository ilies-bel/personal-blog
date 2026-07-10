// scripts/shoot-routes-grayscale.mjs — the P9 BLIND-SCREENSHOT check.
//
// The route art direction must survive grayscale: each route has to be
// identifiable from a colourless screenshot through density / scale / edges /
// rhythm alone, never hue. This script produces the evidence for that human
// review:
//
//   1. Serves the PRODUCTION build (astro preview against dist/ — run
//      `pnpm build` first; the script refuses to run without a dist).
//   2. Screenshots every public route at desktop (1280×800) and phone
//      (390×844) — the opening frame, exactly what a blind judge sees first.
//      Live-scene routes (home / graveyard / behind-the-build) wait for the
//      engine's scene:ready so the canvas is painted, with a poster-tolerant
//      timeout for software-rendered boxes.
//   3. Saves each shot in COLOUR and in GRAYSCALE (desaturated with sharp —
//      the page itself is never mutated), then composes one labelled contact
//      sheet per viewport × treatment under scratchpad/p9/.
//
// Usage: node scripts/shoot-routes-grayscale.mjs
//   PW_CHROMIUM_EXECUTABLE=/path/to/chromium  — sandbox browser override
//   PORT=4346                                  — preview port
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 4346);
const BASE = `http://localhost:${PORT}`;
const OUT = resolve(root, 'scratchpad/p9');

const ROUTES = [
  { name: 'home', path: '/', live: true },
  { name: 'work', path: '/projects', live: false },
  { name: 'writing', path: '/writing', live: false },
  { name: 'graveyard', path: '/graveyard', live: true },
  { name: 'behind-the-build', path: '/behind-the-build', live: true },
  { name: 'about', path: '/about', live: false },
  { name: 'contact', path: '/contact', live: false },
  { name: 'post', path: '/posts/memory-leak-search-and-destroy', live: false },
  { name: '404', path: '/definitely-not-a-page', live: false },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800, tileScale: 0.33 },
  { name: 'mobile', width: 390, height: 844, tileScale: 0.4 },
];

if (!existsSync(resolve(root, 'dist'))) {
  console.error('dist/ not found — run `pnpm build` first (this script shoots the prod build).');
  process.exit(1);
}

// --- preview server -----------------------------------------------------------
function startPreview() {
  const child = spawn(
    process.execPath,
    [resolve(root, 'node_modules/astro/bin/astro.mjs'), 'preview', '--port', String(PORT)],
    { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  child.stderr.on('data', () => {});
  return (async () => {
    const deadline = Date.now() + 60_000;
    for (;;) {
      try {
        const res = await fetch(`${BASE}/`);
        if (res.ok) return child;
      } catch {
        /* not up yet */
      }
      if (Date.now() > deadline) {
        child.kill('SIGTERM');
        throw new Error('preview server did not come up in 60s');
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  })();
}

// --- contact sheet --------------------------------------------------------------
const LABEL_H = 26;
async function composeSheet(tiles, columns, outPath) {
  const tileW = tiles[0].width;
  const tileH = tiles[0].height + LABEL_H;
  const rows = Math.ceil(tiles.length / columns);
  const sheetW = columns * tileW + (columns + 1) * 8;
  const sheetH = rows * tileH + (rows + 1) * 8;
  const composites = [];
  tiles.forEach((tile, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const left = 8 + col * (tileW + 8);
    const top = 8 + row * (tileH + 8);
    composites.push({ input: tile.buffer, left, top });
    const label = Buffer.from(
      `<svg width="${tileW}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="100%" height="100%" fill="#111"/>` +
        `<text x="8" y="${LABEL_H - 8}" font-family="monospace" font-size="13" fill="#ddd">${tile.name}</text>` +
        `</svg>`,
    );
    composites.push({ input: label, left, top: top + tile.height });
  });
  await sharp({
    create: { width: sheetW, height: sheetH, channels: 3, background: '#222' },
  })
    .composite(composites)
    .png()
    .toFile(outPath);
}

// --- shoot ----------------------------------------------------------------------
const server = await startPreview();
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_EXECUTABLE || undefined,
});

try {
  await mkdir(OUT, { recursive: true });

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    // scene:ready counter that survives navigations (capture-figures pattern).
    await context.addInitScript(() => {
      window.__sceneReadyCount = 0;
      window.addEventListener('scene:ready', () => {
        window.__sceneReadyCount += 1;
      });
    });
    const page = await context.newPage();

    const colorTiles = [];
    const grayTiles = [];

    for (const route of ROUTES) {
      await page.goto(`${BASE}${route.path}`, { waitUntil: 'load' });
      if (route.live) {
        // Painted canvas or poster fallback — whichever the box can do.
        await page
          .waitForFunction(() => (window.__sceneReadyCount ?? 0) >= 1, null, { timeout: 45_000 })
          .catch(() => console.warn(`  (scene:ready timeout on ${route.path} — poster state shot)`));
      }
      // Hydration + entrance choreography settle.
      await page.waitForTimeout(route.live ? 2500 : 1600);
      const shot = await page.screenshot({ type: 'png' });

      const colorPath = resolve(OUT, `${vp.name}-${route.name}-color.png`);
      const grayPath = resolve(OUT, `${vp.name}-${route.name}-gray.png`);
      await writeFile(colorPath, shot);
      const gray = await sharp(shot).grayscale().png().toBuffer();
      await writeFile(grayPath, gray);

      const tileW = Math.round(vp.width * vp.tileScale);
      const tileH = Math.round(vp.height * vp.tileScale);
      colorTiles.push({
        name: route.name,
        width: tileW,
        height: tileH,
        buffer: await sharp(shot).resize(tileW, tileH).png().toBuffer(),
      });
      grayTiles.push({
        name: route.name,
        width: tileW,
        height: tileH,
        buffer: await sharp(gray).resize(tileW, tileH).png().toBuffer(),
      });
      console.log(`✓ ${vp.name} ${route.name}`);
    }

    const columns = vp.name === 'desktop' ? 3 : 5;
    await composeSheet(grayTiles, columns, resolve(OUT, `contact-sheet-${vp.name}-gray.png`));
    await composeSheet(colorTiles, columns, resolve(OUT, `contact-sheet-${vp.name}-color.png`));
    console.log(`✓ contact sheets for ${vp.name} → scratchpad/p9/`);

    await context.close();
  }
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
