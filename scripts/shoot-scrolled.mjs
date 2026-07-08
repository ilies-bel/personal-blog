// Real-scroll finale capture: no morph pin — the scroll driver takes the page
// to the finale beat so the manifesto copy + ledger show as a visitor sees them.
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
await page.goto(`http://localhost:4325/personal-blog?tier=high&r=${Date.now() % 100000}`, { waitUntil: 'load' });
await page.waitForTimeout(4000);
await page.evaluate(() => {
  document.body.classList.add('hud-active');
  document.body.classList.remove('at-opening', 'bare');
});
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2500);
}
await page.waitForTimeout(5000);
await page.screenshot({ path: process.argv[2] ?? 'scrolled-finale.png' });
console.log('saved');
await browser.close();
