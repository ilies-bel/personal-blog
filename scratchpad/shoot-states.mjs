// Verify the crystal across states: reduced-motion, full page, and mobile width.
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';

const BASE = process.env.BASE || 'http://localhost:4321/personal-blog';
const dir = resolve(process.cwd(), 'screenshots');
const browser = await chromium.launch();
try {
  // 1. Reduced motion — gem should still render (one static frame).
  {
    const ctx = await browser.newContext({
      viewport: { width: 1100, height: 760 },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.locator('.hero').screenshot({ path: resolve(dir, 'hero-reduced-motion.png') });
    console.log('✓ reduced-motion');
    await ctx.close();
  }
  // 2. Mobile width — gem must not crowd the headline.
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 800 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.locator('.hero').screenshot({ path: resolve(dir, 'hero-mobile.png') });
    console.log('✓ mobile');
    await ctx.close();
  }
} finally {
  await browser.close();
}
