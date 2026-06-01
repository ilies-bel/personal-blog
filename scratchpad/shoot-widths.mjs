// Shoot the corner variant across the previously-fragile middle width range to
// confirm the cobalt never grazes the headline anymore.
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';

const BASE = process.env.BASE || 'http://localhost:4321/personal-blog';
const dir = resolve(process.cwd(), 'screenshots');
const widths = [1024, 1100, 1200, 1280, 1440, 1680];
const browser = await chromium.launch();
try {
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 720 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?crystal=corner`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2400);
    // Crop to the hero region for a focused read.
    await page.locator('.hero').screenshot({ path: resolve(dir, `w-${w}.png`) });
    console.log(`✓ ${w}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
