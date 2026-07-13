import { chromium } from 'playwright';
const port = process.argv[2] ?? '4325';
const out = process.argv[3] ?? 'blueprint-overlay.png';
const base = (process.env.BASE ?? `http://localhost:${port}`).replace(/\/$/, '');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`${base}/dev-blueprint`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
if ((await page.locator('#overlay').count()) === 0) {
  throw new Error(`blueprint capture did not load the overlay at ${page.url()}`);
}
await page.locator('#overlay').screenshot({ path: out });
await browser.close();
console.log(`saved ${out}`);
