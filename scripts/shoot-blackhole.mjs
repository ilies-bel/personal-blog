// Screenshot the black hole hero. The shader animates continuously and is heavy
// enough that headless GL won't yield a frame to the compositor mid-render, so
// we set window.__bhPaused=true to freeze on the last settled frame (held in the
// preserved drawing buffer), then capture.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:4323/personal-blog';
const OUT = resolve(root, 'screenshots');
const name = process.argv[2] || 'blackhole';
const hideControls = process.argv.includes('--hide');

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto(BASE + '/', { waitUntil: 'load' });
// Poll for the canvas via evaluate (waitForSelector mis-handles a constantly
// repainting WebGL surface), then let the disk + beaming settle. Retry the goto
// once if hydration is slow.
try {
  await page.waitForFunction(() => !!document.querySelector('.bh-stage canvas'), { timeout: 25000 });
} catch {
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.bh-stage canvas'), { timeout: 25000 });
}
await page.waitForTimeout(3500);

if (hideControls) {
  await page.evaluate(() => {
    const t = document.querySelector('.bh-toggle');
    if (t && t.textContent.includes('Hide')) t.click();
  });
  await page.waitForTimeout(300);
}

// freeze on the last settled frame so the heavy shader yields for capture
await page.evaluate(() => { window.__bhPaused = true; });
await page.waitForTimeout(400);

const box = await page.evaluate(() => {
  const s = document.querySelector('.bh-stage');
  const r = s.getBoundingClientRect();
  return { x: r.x, y: Math.max(0, r.y), width: r.width, height: Math.min(r.height, window.innerHeight - r.y) };
});

await page.screenshot({ path: resolve(OUT, `${name}.png`), clip: box, timeout: 15000 });
console.log('saved', resolve(OUT, `${name}.png`));
console.log(errors.length ? '--- errors ---\n' + errors.slice(0, 15).join('\n') : 'no console errors');
await browser.close();
