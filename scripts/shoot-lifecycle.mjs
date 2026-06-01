// scripts/shoot-lifecycle.mjs — capture the scroll-scrubbed lifecycle scene at
// chosen MORPH values for transition 1 (reverse supernova). Morph = scroll
// progress × STAGE_COUNT(5), so the first transition spans total progress 0..0.2.
//
// Usage: BASE=http://localhost:4322/personal-blog node scripts/shoot-lifecycle.mjs
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:4322/personal-blog';
const OUT = resolve(root, 'screenshots/lifecycle');
const STAGE_COUNT = 5;

// Stage value over the lifecycle: 0..1 = supernova, 1..2 = the Sun.
const morphs = [0.0, 0.5, 1.0, 1.3, 1.6, 1.9];

const browser = await chromium.launch();
try {
  await mkdir(OUT, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600); // intro dezoom settle + island mount

  for (const m of morphs) {
    const targetProgress = m / STAGE_COUNT;
    // Re-measure each time (island height is stable by now) and scroll to the
    // scrollY that yields the wanted progress; then read back the real morph.
    const real = await page.evaluate((p) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.round(max * p));
      return (window.scrollY / max) * 5;
    }, targetProgress);
    await page.waitForTimeout(2600); // morph smoothing converges (slow easing)
    const name = `morph-${String(Math.round(m * 100)).padStart(3, '0')}.png`;
    await page.screenshot({ path: resolve(OUT, name) });
    console.log(`✓ morph≈${real.toFixed(2)} -> lifecycle/${name}`);
  }
  await ctx.close();
} finally {
  await browser.close();
}
