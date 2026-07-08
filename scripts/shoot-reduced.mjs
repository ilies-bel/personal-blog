// Reduced-motion fallback capture: the static SVG cockpit must keep rendering
// with the new geometry (apron split + pedestal recess ride COCKPIT_LINES).
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`http://localhost:4325/personal-blog?r=${Date.now() % 100000}`, { waitUntil: 'load' });
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
await page.screenshot({ path: 'reduced-motion.png' });
console.log('saved');
await browser.close();
