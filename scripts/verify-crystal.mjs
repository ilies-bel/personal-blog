// scripts/verify-crystal.mjs — capture the crystal physics lifecycle + errors.
// Assumes dev server running at http://localhost:4321/personal-blog/.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://localhost:4321/personal-blog';
const OUT = resolve(root, 'screenshots');

const browser = await chromium.launch();
const errors = [];
try {
  await mkdir(OUT, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

  // --- Full motion: slow cinematic accretion from off-screen-right (~14s) ---
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000); // streaming in from the right
  await page.screenshot({ path: resolve(OUT, 'crystal-1a-cloud.png') });
  await page.waitForTimeout(4000); // ~9s: mostly arrived, coalescing
  await page.screenshot({ path: resolve(OUT, 'crystal-1b-coalescing.png') });
  await page.waitForTimeout(7000); // ~16s: fully assembled clean planet
  await page.screenshot({ path: resolve(OUT, 'crystal-2-assembled.png') });

  // Find a fragment to click: probe the canvas near the hero's top-left corner.
  // The gem sits at the hero corner; click a spot just left/up of the headline.
  const box = await page.evaluate(() => {
    const hero = document.querySelector('.hero');
    if (!hero) return null;
    const r = hero.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  if (box) {
    // Click a grid of points around the corner until something explodes.
    const pts = [];
    for (let dx = -60; dx <= 40; dx += 20) {
      for (let dy = -40; dy <= 40; dy += 20) {
        pts.push([box.x + dx, box.y + dy]);
      }
    }
    for (const [x, y] of pts) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(40);
    }
  }
  await page.waitForTimeout(1400); // let the burst fly under gravity
  await page.screenshot({ path: resolve(OUT, 'crystal-3-exploded.png') });

  // --- Reduced motion: static gem ---
  const ctxRM = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  });
  const pRM = await ctxRM.newPage();
  pRM.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[RM console.error] ${m.text()}`);
  });
  pRM.on('pageerror', (e) => errors.push(`[RM pageerror] ${e.message}`));
  await pRM.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await pRM.waitForTimeout(1500);
  await pRM.screenshot({ path: resolve(OUT, 'crystal-4-reduced-motion.png') });
  await ctxRM.close();

  // --- Mobile: static gem (narrow viewport < 48rem = 768px) ---
  const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pM = await ctxM.newPage();
  pM.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[mobile console.error] ${m.text()}`);
  });
  pM.on('pageerror', (e) => errors.push(`[mobile pageerror] ${e.message}`));
  await pM.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await pM.waitForTimeout(2200);
  await pM.screenshot({ path: resolve(OUT, 'crystal-5-mobile.png') });
  await ctxM.close();

  await context.close();
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('--- ERRORS CAPTURED ---');
  for (const e of errors) console.log(e);
  process.exitCode = 1;
} else {
  console.log('No console/page errors captured.');
}
console.log('Screenshots: crystal-1-falling, -2-assembled, -3-exploded, -4-reduced-motion, -5-mobile');
