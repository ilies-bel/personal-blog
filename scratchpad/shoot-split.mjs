// Capture both crystal split variants at a WIDE desktop width, where the narrow
// content column leaves side margins for the copper half to show.
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';

const BASE = process.env.BASE || 'http://localhost:4321/personal-blog';
const dir = resolve(process.cwd(), 'screenshots');
const browser = await chromium.launch();
try {
  for (const variant of ['corner', 'divider']) {
    const ctx = await browser.newContext({
      viewport: { width: 1680, height: 1000 },
      deviceScaleFactor: 1.5,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?crystal=${variant}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2600); // mount + a few frames + fade-in
    await page.screenshot({ path: resolve(dir, `split-${variant}.png`) });
    console.log(`✓ ${variant}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
