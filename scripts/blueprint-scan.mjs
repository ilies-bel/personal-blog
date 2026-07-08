// RIDGE SCANNER — stretch the reference to 1920×1080 and print where the
// amber trim lines cross a set of scan rows/columns. "Amberness" = (r−b)
// weighted by luminance, which ignores the white disk/reticle and the black
// hull; peaks are local maxima merged within 5px. Output feeds the authored
// geometry in cockpitGeometry.ts — measured, not eyeballed.
//   node scripts/blueprint-scan.mjs [ref=reference-v2.png]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const ref = process.argv[2] ?? 'reference-v2.png';
const b64 = readFileSync(ref).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.setContent(`<canvas id="c" width="1920" height="1080"></canvas>
<script>
  const img = new Image();
  img.onload = () => { document.getElementById('c').getContext('2d').drawImage(img, 0, 0, 1920, 1080); document.title = 'done'; };
  img.src = 'data:image/png;base64,${b64}';
</script>`);
await page.waitForFunction(() => document.title === 'done');

const result = await page.evaluate(() => {
  const ctx = document.getElementById('c').getContext('2d');
  const { data } = ctx.getImageData(0, 0, 1920, 1080);
  const amber = (x, y) => {
    const i = (y * 1920 + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const luma = 0.5 * r + 0.4 * g + 0.1 * b;
    return Math.max(0, r - b) * luma / 255;
  };
  const peaks = (values) => {
    // smooth3 → local maxima above threshold → merge within 5px
    const s = values.map((v, i) => (values[Math.max(0, i - 1)] + v + values[Math.min(values.length - 1, i + 1)]) / 3);
    const out = [];
    for (let i = 2; i < s.length - 2; i++) {
      if (s[i] > 14 && s[i] >= s[i - 1] && s[i] >= s[i + 1] && s[i] > s[i - 2] && s[i] > s[i + 2]) {
        if (out.length && i - out[out.length - 1].p < 5) {
          if (s[i] > out[out.length - 1].v) out[out.length - 1] = { p: i, v: s[i] };
        } else out.push({ p: i, v: s[i] });
      }
    }
    return out.map((o) => o.p + ':' + Math.round(o.v));
  };
  const rows = {};
  for (const y of [40, 60, 80, 100, 130, 160, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 730, 760, 790, 820, 850, 880, 910, 940, 970, 1000, 1040, 1070]) {
    rows['y' + y] = peaks(Array.from({ length: 1920 }, (_, x) => amber(x, y)));
  }
  const cols = {};
  for (const x of [30, 60, 100, 140, 180, 220, 260, 300, 360, 420, 480, 540, 640, 760, 960, 1160, 1280, 1380, 1440, 1500, 1560, 1620, 1700, 1740, 1780, 1820, 1860, 1890]) {
    cols['x' + x] = peaks(Array.from({ length: 1080 }, (_, y) => amber(x, y)));
  }
  return { rows, cols };
});

for (const [k, v] of Object.entries(result.rows)) console.log(k.padEnd(6), v.join(' '));
console.log('---');
for (const [k, v] of Object.entries(result.cols)) console.log(k.padEnd(6), v.join(' '));
await browser.close();
