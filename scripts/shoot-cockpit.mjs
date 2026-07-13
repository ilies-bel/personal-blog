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
// Env: DSF=1 for 1920×1080 output (faster overall reads), default 2;
//      BASE=http://host[:port][/prefix] when the dev route is not at root.
import { chromium } from '@playwright/test';

const morph = Number(process.argv[2] ?? '0');
const out = process.argv[3] ?? `shot-${morph}.png`;
const port = process.argv[4] ?? '4325';
const base = (process.env.BASE ?? `http://localhost:${port}`).replace(/\/$/, '');

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: Number(process.env.DSF ?? '2'),
});

await page.goto(`${base}/?tier=high&r=${Date.now() % 100000}`, {
  waitUntil: 'load',
});
if ((await page.locator('button[aria-label="Power the navigation HUD"]').count()) === 0) {
  throw new Error(`cockpit capture did not load the hero at ${page.url()}`);
}
await page.waitForTimeout(4000);
// Power the HUD through the REAL power button so the boot FSM runs (boot
// theater → hud-active → the cue glides into its pedestal seat) — forcing
// body classes by hand shows pre-glide states that never rest in production.
const power = page.locator('button[aria-label="Power the navigation HUD"]');
if ((await power.count()) > 0 && (await power.getAttribute('aria-pressed')) !== 'true') {
  // Dispatch the click on the element directly: at DSF 2 + tier=high the GPU
  // load starves Playwright's scroll-into-view actionability wait.
  // Schedule the click after the evaluate round-trip has returned. At DSF 2
  // the high-tier shader compile can hold the renderer long enough that a
  // synchronous `el.click()` keeps Playwright's evaluate call open until its
  // 30s timeout, even though the control itself is already present.
  await power.evaluate((el) => {
    window.setTimeout(() => {
      if (el instanceof HTMLElement) el.click();
    }, 0);
  });
}
await page.waitForTimeout(6000);
await page.evaluate((m) => {
  window.__bhMorph = m;
}, morph);
await page.waitForTimeout(3000);

await page.screenshot({ path: out });
console.log(`saved ${out}`);
await browser.close();
