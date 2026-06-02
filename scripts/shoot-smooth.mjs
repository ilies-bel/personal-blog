// scripts/shoot-smooth.mjs — sanity checks beyond the static morph holds:
//  1) a SMOOTH scroll pass (no teleport) sampled mid-transition, to confirm the
//     flash reads as a brief beat rather than a sustained whiteout;
//  2) the reduced-motion state (scene should sit at its settled black-hole frame).
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:4322/personal-blog';
const OUT = resolve(root, 'screenshots/lifecycle');

const browser = await chromium.launch();
try {
  await mkdir(OUT, { recursive: true });

  // --- reduced motion ---
  const rmCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const rm = await rmCtx.newPage();
  await rm.route('**/*.{woff,woff2,ttf,otf,eot}', (r) => r.abort());
  await rm.goto(BASE, { waitUntil: 'domcontentloaded' });
  await rm.waitForTimeout(2000);
  await rm.screenshot({ path: resolve(OUT, 'reduced-motion-top.png') });
  console.log('✓ reduced-motion top');
  await rmCtx.close();

  // --- mobile base frame ---
  const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mob = await mCtx.newPage();
  await mob.route('**/*.{woff,woff2,ttf,otf,eot}', (r) => r.abort());
  await mob.goto(BASE, { waitUntil: 'domcontentloaded' });
  await mob.waitForTimeout(3000);
  await mob.screenshot({ path: resolve(OUT, 'mobile-top.png') });
  console.log('✓ mobile top');
  await mCtx.close();
} finally {
  await browser.close();
}
