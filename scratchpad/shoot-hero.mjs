// Tight, high-DPR screenshot of just the hero, to judge the crystal's lighting.
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';

const BASE = process.env.BASE || 'http://localhost:4321/personal-blog';
const OUT = resolve(process.cwd(), 'screenshots', 'hero-detail.png');

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: 1100, height: 760 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200); // let the gem mount + a few frames render
  const hero = page.locator('.hero');
  await hero.screenshot({ path: OUT });
  console.log(`✓ hero -> ${OUT}`);
} finally {
  await browser.close();
}
