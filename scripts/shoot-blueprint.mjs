import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto('http://localhost:4325/personal-blog/dev-blueprint', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.locator('#overlay').screenshot({ path: 'blueprint-overlay.png' });
await browser.close();
console.log('shot');
