// scripts/record-reel.mjs — RAW reel footage for the Awwwards submission video
// (P12). Records one scripted 1920×1080 pass over the PRODUCTION build with
// Playwright's context video recorder:
//
//   loader boot → the full hero descent (black hole → supernova → red giant →
//   yellow star → nebula → pale blue dot, driven by smooth scrollTo steps so
//   the presentation clock plays every beat) → finale ledger → nav to Work →
//   scroll the ledger → Graveyard → Behind the Build (shader gallery + a
//   "Run live" activation) → Contact transmission → hold.
//
// THIS IS RAW FOOTAGE, NOT THE REEL. The owner edits it (trim the boot, cut
// between chapters, add type plates, compress to the 60–75s target) — the
// script's job is only to produce clean, deterministic source material. On a
// software renderer (SwiftShader) the recording plays in slow motion — frame
// times are seconds, so treat a sandbox run as a smoke test and record the
// real take on GPU hardware.
//
// Output: scratchpad/submission/reel-raw.webm (gitignored — release artifact,
// archived with the judged build per docs/RUNBOOK.md). If ffmpeg is on PATH
// an H.264 mp4 is emitted next to it; otherwise the exact commands print.
//
// Usage: pnpm build && node scripts/record-reel.mjs
//   PW_CHROMIUM_EXECUTABLE=/path/to/chromium  — sandbox browser override
//   PORT=4349                                  — preview port
import { chromium } from '@playwright/test';
import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 4349);
const BASE = `http://localhost:${PORT}`;
const OUT = resolve(root, 'scratchpad/submission');
const RAW = resolve(OUT, 'reel-raw.webm');
const W = 1920;
const H = 1080;

if (!existsSync(resolve(root, 'dist'))) {
  console.error('dist/ not found — run `pnpm build` first (the reel records the prod build).');
  process.exit(1);
}

function startPreview() {
  const child = spawn(
    process.execPath,
    [resolve(root, 'node_modules/astro/bin/astro.mjs'), 'preview', '--port', String(PORT)],
    { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  child.stderr.on('data', () => {});
  return (async () => {
    const deadline = Date.now() + 60_000;
    for (;;) {
      try {
        const res = await fetch(`${BASE}/`);
        if (res.ok) return child;
      } catch {
        /* not up yet */
      }
      if (Date.now() > deadline) {
        child.kill('SIGTERM');
        throw new Error('preview server did not come up in 60s');
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  })();
}

// Smooth scripted scroll: eased steps at ~30 steps/beat so the presentation
// clock (which follows live scroll) glides through every state instead of
// snapping. Runs inside the page so the cadence isn't at CDP round-trip mercy.
function smoothScrollTo(page, fraction, ms) {
  return page.evaluate(
    async ({ fraction, ms }) => {
      const from = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const to = Math.round(max * fraction);
      const start = performance.now();
      const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
      await new Promise((done) => {
        const tick = (now) => {
          const t = Math.min(1, (now - start) / ms);
          window.scrollTo(0, from + (to - from) * ease(t));
          if (t < 1) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
    },
    { fraction, ms },
  );
}

const server = await startPreview();
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_EXECUTABLE || undefined,
});

let videoPath = null;
try {
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: OUT, size: { width: W, height: H } },
  });
  await context.addInitScript(() => {
    window.__sceneReadyCount = 0;
    window.addEventListener('scene:ready', () => {
      window.__sceneReadyCount += 1;
    });
  });
  const page = await context.newPage();
  const waitReady = (count) =>
    page
      .waitForFunction((c) => (window.__sceneReadyCount ?? 0) >= c, count, {
        timeout: 300_000,
        polling: 500,
      })
      .catch(() => console.warn('  (scene:ready timeout — continuing)'));

  // CHAPTER 1 — loader boot + the full hero descent. The boot beat is real
  // footage on purpose (loader honesty is part of the story); the owner trims.
  console.log('chapter 1: home descent');
  await page.goto(`${BASE}/?tier=high`, { waitUntil: 'load' });
  await waitReady(1);
  await page
    .waitForFunction(() => document.body.classList.contains('loader-gone'), null, {
      timeout: 60_000,
    })
    .catch(() => {});
  await page.waitForTimeout(3500); // hold the black-hole opening frame

  // Six stages, one eased beat each: linger on the blast + the giant.
  const BEATS = [
    { fraction: 0.1, ms: 3000, hold: 1200 }, // leaving the horizon
    { fraction: 0.26, ms: 3500, hold: 1800 }, // supernova crest
    { fraction: 0.42, ms: 3500, hold: 2000 }, // red giant limb
    { fraction: 0.63, ms: 3500, hold: 1500 }, // yellow star
    { fraction: 0.82, ms: 3500, hold: 1500 }, // nebula
    { fraction: 1.0, ms: 4000, hold: 4000 }, // pale blue dot + finale ledger
  ];
  for (const beat of BEATS) {
    await smoothScrollTo(page, beat.fraction, beat.ms);
    await page.waitForTimeout(beat.hold);
  }

  // CHAPTER 2 — Work: route transition + a slow ledger pass.
  console.log('chapter 2: work');
  await page.click('a[href="/projects"], a[href="/projects/"]');
  await page.waitForURL('**/projects*', { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await smoothScrollTo(page, 0.5, 4000);
  await page.waitForTimeout(1500);

  // CHAPTER 3 — Writing (beat) → Graveyard: the cooling-residue journey.
  // The graveyard is reached THROUGH the writing index (its shelf link) —
  // the projects page deliberately doesn't link it, and the detour puts the
  // writing route on film too.
  console.log('chapter 3: writing → graveyard');
  await page.click('a[href="/writing"], a[href="/writing/"]');
  await page.waitForURL('**/writing*', { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.click('a[href="/graveyard"], a[href="/graveyard/"]');
  await page.waitForURL('**/graveyard*', { timeout: 30_000 });
  await waitReady(2);
  await page.waitForTimeout(2500);
  await smoothScrollTo(page, 0.45, 4500);
  await page.waitForTimeout(2000);

  // CHAPTER 4 — Behind the Build: anatomy + one live shader activation.
  console.log('chapter 4: behind the build');
  await page.goto(`${BASE}/behind-the-build?tier=high`, { waitUntil: 'load' });
  await waitReady(3);
  await page.waitForTimeout(2500);
  const figure = page.locator('.scene-figure').first();
  await figure.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => {});
  await page.waitForTimeout(2500);
  const before = await page.evaluate(() => window.__sceneReadyCount ?? 0);
  await figure
    .locator('.scene-figure-run')
    .evaluate((el) => el.click())
    .catch(() => console.warn('  (no Run live control found)'));
  await waitReady(before + 1);
  await page.waitForTimeout(4000); // hold the live plate

  // CHAPTER 5 — Contact: the transmission frame, held.
  console.log('chapter 5: contact');
  await page.click('a[href="/contact"], a[href="/contact/"]');
  await page.waitForURL('**/contact*', { timeout: 30_000 });
  await page.waitForTimeout(5000);

  await page.close();
  const video = page.video();
  if (video) videoPath = await video.path();
  await context.close();
} finally {
  await browser.close();
  server.kill('SIGTERM');
}

if (!videoPath) {
  console.error('no video was recorded');
  process.exit(1);
}
await rename(videoPath, RAW);
console.log(`\n✓ raw reel footage → ${RAW.slice(root.length + 1)}`);

// --- optional mp4 + editing instructions ---------------------------------------
let ffmpeg = null;
try {
  ffmpeg = execSync('which ffmpeg').toString().trim();
} catch {
  /* not installed */
}
if (ffmpeg) {
  const mp4 = RAW.replace(/\.webm$/, '.mp4');
  execSync(`${ffmpeg} -y -i "${RAW}" -c:v libx264 -crf 18 -pix_fmt yuv420p -an "${mp4}"`, {
    stdio: 'inherit',
  });
  console.log(`✓ mp4 master → ${mp4.slice(root.length + 1)}`);
} else {
  console.log(`
ffmpeg not found — convert/trim on a machine that has it:

  # inspect
  ffprobe scratchpad/submission/reel-raw.webm

  # trim to the 60–75s cut (adjust -ss/-t after review) + H.264 mp4
  ffmpeg -i scratchpad/submission/reel-raw.webm -ss 00:00:02 -t 70 \\
    -c:v libx264 -crf 18 -pix_fmt yuv420p -an reel.mp4

  # Awwwards-friendly compressed upload (≤ target size)
  ffmpeg -i reel.mp4 -vf scale=1920:1080 -c:v libx264 -crf 23 -preset slow -an reel-upload.mp4
`);
}
