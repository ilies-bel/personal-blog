// scripts/verify-rework.mjs — capture the homepage rework states for review.
// Assumes a preview server at BASE. Saves PNGs into ./screenshots/rework/.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:4399/personal-blog';
const OUT = resolve(root, 'screenshots', 'rework');

const browser = await chromium.launch();
try {
  await mkdir(OUT, { recursive: true });

  // --- Desktop, full motion ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    // Let the gem accrete a while + personalize.
    await page.waitForTimeout(4000);
    await page.screenshot({ path: resolve(OUT, '1-hero-centered.png') });
    console.log('✓ 1-hero-centered (viewport)');

    // Mid-scroll: gem should be receding/dissolving, sections revealing.
    await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 0.6, behavior: 'instant' }));
    await page.waitForTimeout(900);
    await page.screenshot({ path: resolve(OUT, '2-scroll-recede.png') });
    console.log('✓ 2-scroll-recede (viewport)');

    // Full page (all sections revealed).
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: resolve(OUT, '3-full-page.png'), fullPage: true });
    console.log('✓ 3-full-page (full)');
    await ctx.close();
  }

  // --- Click-to-shatter (central) ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000); // let it fully assemble
    // Click the viewport center (where the centered gem sits, ~40vh).
    await page.mouse.click(640, 360);
    await page.waitForTimeout(700);
    await page.screenshot({ path: resolve(OUT, '4-shatter.png') });
    console.log('✓ 4-shatter (viewport)');
    await ctx.close();
  }

  // --- Reduced motion ---
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: resolve(OUT, '5-reduced-motion.png'), fullPage: true });
    console.log('✓ 5-reduced-motion (full)');
    await ctx.close();
  }

  // --- Mobile ---
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: resolve(OUT, '6-mobile-hero.png') });
    console.log('✓ 6-mobile-hero (viewport)');
    await ctx.close();
  }
} finally {
  await browser.close();
}
