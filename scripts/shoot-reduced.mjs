// Reduced-motion fallback capture: the static SVG cockpit must keep rendering
// the exact shared COCKPIT_BEAMS geometry without loading the live engine.
// Usage: node scripts/shoot-reduced.mjs [port=4325] [out=reduced-motion.png]
import { chromium } from '@playwright/test';
const port = process.argv[2] ?? '4325';
const out = process.argv[3] ?? 'reduced-motion.png';
const base = (process.env.BASE ?? `http://localhost:${port}`).replace(/\/$/, '');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`${base}/?r=${Date.now() % 100000}`, { waitUntil: 'load' });
if ((await page.locator('button[aria-label="Power the navigation HUD"]').count()) === 0) {
  throw new Error(`reduced-motion capture did not load the hero at ${page.url()}`);
}
await page.waitForTimeout(3500);
// Dismiss the still-version notice if it's up (fresh contexts always get it).
const keep = page.getByRole('button', { name: /keep it simple/i });
if ((await keep.count()) > 0) {
  await keep.click();
  await page.waitForTimeout(800);
}
await page.evaluate(() => {
  document.body.classList.add('hud-active');
  document.body.classList.remove('at-opening', 'bare');
});
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
console.log(`saved ${out}`);
await browser.close();
