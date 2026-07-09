// Real-scroll finale capture: no morph pin — the scroll driver takes the page
// to the finale beat so the manifesto copy + ledger show as a visitor sees them.
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
// DSF=1 for quick reads; default 2. The 4K render saturates the main thread,
// so the power click gets a generous timeout (the default 30s can expire while
// Playwright waits for a quiet frame to re-verify actionability).
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: Number(process.env.DSF ?? '2') });
await page.goto(`http://localhost:4325/personal-blog?tier=high&r=${Date.now() % 100000}`, { waitUntil: 'load' });
await page.waitForTimeout(4000);
const power = page.locator('button[aria-label="Power the navigation HUD"]');
if ((await power.count()) > 0 && (await power.getAttribute('aria-pressed')) !== 'true') {
  await power.click({ timeout: 90000 });
}
await page.waitForTimeout(6000);
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2500);
}
await page.waitForTimeout(5000);
await page.screenshot({ path: process.argv[2] ?? 'scrolled-finale.png' });
console.log('saved');
await browser.close();
