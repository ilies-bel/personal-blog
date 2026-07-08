// Full-quality cockpit screenshot loop for design iteration.
// The scene canvas renders full-res even headless (the "300×150 headless cap"
// in the old handoff was a mis-probe of the unsized .warp-overlay canvas, the
// first <canvas> in the DOM). Screenshots at deviceScaleFactor 2 are 3840×2160;
// crop 1:1 regions with `sips -c` / `-x` for detail reads.
//
// Usage: node scripts/shoot-cockpit.mjs [morph] [outfile] [port]
//   morph   __bhMorph chapter pin (default 0.0 = black hole; 4.5 = finale)
//   outfile screenshot path (default shot-<morph>.png)
//   port    dev server port (default 4325)
// Env: DSF=1 for 1920×1080 output (faster overall reads), default 2.
import { chromium } from '@playwright/test';

const morph = Number(process.argv[2] ?? '0');
const out = process.argv[3] ?? `shot-${morph}.png`;
const port = process.argv[4] ?? '4325';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: Number(process.env.DSF ?? '2'),
});

await page.goto(`http://localhost:${port}/personal-blog?tier=high&r=${Date.now() % 100000}`, {
  waitUntil: 'load',
});
await page.waitForTimeout(4000);
await page.evaluate((m) => {
  window.__bhMorph = m;
  document.body.classList.add('hud-active');
  document.body.classList.remove('at-opening', 'bare');
}, morph);
// A tiny real scroll flips the boot FSM cue → live so the compass readout
// parks in its pedestal seat (the canvas itself stays pinned by __bhMorph).
await page.mouse.wheel(0, 120);
await page.waitForTimeout(3000);

await page.screenshot({ path: out });
console.log(`saved ${out}`);
await browser.close();
