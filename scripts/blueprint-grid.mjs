// MEASURING BENCH — stretch the reference to the 1920×1080 design space and
// burn a labeled coordinate grid over it, so geometry is READ off the image
// instead of guessed from crops. Usage:
//   node scripts/blueprint-grid.mjs [ref=reference-v2.png] [out=blueprint-grid.png]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const ref = process.argv[2] ?? 'reference-v2.png';
const out = process.argv[3] ?? 'blueprint-grid.png';
const b64 = readFileSync(ref).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
await page.setContent(`
<style>body{margin:0;background:#000}</style>
<canvas id="c" width="1920" height="1080" style="width:1920px;height:1080px"></canvas>
<script>
  const img = new Image();
  img.onload = () => {
    const ctx = document.getElementById('c').getContext('2d');
    ctx.drawImage(img, 0, 0, 1920, 1080);
    // 50px grid, labeled every 100. Green minor, cyan major — neither occurs
    // in the amber/bone reference, so the grid never masquerades as geometry.
    for (let x = 0; x <= 1920; x += 50) {
      const major = x % 100 === 0;
      ctx.strokeStyle = major ? 'rgba(0,255,255,0.5)' : 'rgba(0,255,0,0.28)';
      ctx.lineWidth = major ? 0.8 : 0.5;
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, 1080); ctx.stroke();
    }
    for (let y = 0; y <= 1080; y += 50) {
      const major = y % 100 === 0;
      ctx.strokeStyle = major ? 'rgba(0,255,255,0.5)' : 'rgba(0,255,0,0.28)';
      ctx.lineWidth = major ? 0.8 : 0.5;
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(1920, y + 0.5); ctx.stroke();
    }
    ctx.font = '13px monospace';
    ctx.fillStyle = 'rgba(0,255,255,0.9)';
    for (let x = 100; x < 1920; x += 100) for (let y = 100; y < 1080; y += 100) ctx.fillText(x + ',' + y, x + 3, y - 3);
    document.title = 'done';
  };
  img.src = 'data:image/png;base64,${b64}';
</script>`);
await page.waitForFunction(() => document.title === 'done');
await page.screenshot({ path: out });
console.log('saved ' + out);
await browser.close();
