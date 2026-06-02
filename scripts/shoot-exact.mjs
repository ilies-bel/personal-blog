// scripts/shoot-exact.mjs — GROUND TRUTH frames at exact morph values via the
// window.__bhMorph debug override (no scroll-smoothing lag). This is the reliable
// way to inspect the explosion: each screenshot is the scene at precisely that
// stage value. Stage 0..1 = reverse nova; 1..2 = red giant gather.
//
// Usage: BASE=http://localhost:4321/personal-blog node scripts/shoot-exact.mjs
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:4321/personal-blog';
const OUT = resolve(root, 'screenshots/exact');

// fine sweep across the whole lifecycle, dense through the explosion window
const stages = [
  0.0, 0.2, 0.34, 0.40, 0.42, 0.44, 0.46, 0.5, 0.54, 0.58, 0.62, 0.66,
  0.72, 0.8, 0.9, 1.0, 1.15, 1.3, 1.6,
];

const browser = await chromium.launch();
try {
  await mkdir(OUT, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  // Abort web-font requests: Playwright's screenshot waits for fonts to load,
  // and the dev/preview font fetch can stall for tens of seconds. We only care
  // about the WebGL canvas, so fallback fonts are fine — this keeps captures fast.
  await page.route('**/*.{woff,woff2,ttf,otf,eot}', (r) => r.abort());
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000); // island mount + intro settle

  for (const s of stages) {
    await page.evaluate((v) => { (window).__bhMorph = v; }, s);
    await page.waitForTimeout(450); // a few frames at this exact morph
    const name = `e-${String(Math.round(s * 100)).padStart(3, '0')}.png`;
    // animations:'disabled' + a generous timeout: the WebGL canvas animates
    // forever, which can stall the default screenshot stability wait.
    await page.screenshot({ path: resolve(OUT, name), animations: 'disabled', timeout: 60000 });
    console.log(`✓ morph=${s.toFixed(2)} -> exact/${name}`);
  }
  await ctx.close();
} finally {
  await browser.close();
}
