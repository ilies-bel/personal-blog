/**
 * capture-mobile-hero.mjs
 *
 * Deterministic scroll-driven capture of the high-tier hero scene at 720×1280
 * portrait, then encodes the resulting frame sequence into:
 *   public/assets/hero-mobile.mp4        — all-intra H.264 (universal)
 *   public/assets/hero-mobile.hevc.mp4   — all-intra HEVC / hvc1 (Apple)
 *
 * How it works:
 *   1. Launch a Chromium browser at exactly 720×1280 with ?tier=high.
 *   2. Wait for body.scene-ready (the hero's "I have painted my first frame" signal).
 *   3. Step through scroll progress 0..1 in STEPS uniform increments.
 *      Each step: scroll to the exact position, wait for the rAF loop to settle,
 *      screenshot to a PNG frame.
 *   4. Assemble the PNGs into an all-intra H.264 video via ffmpeg (every frame is
 *      a keyframe so seeking is instantaneous — required for scroll-scrubbing).
 *   5. Re-encode as HEVC/hvc1 for better quality/compression on Apple devices.
 *
 * Usage:
 *   node scripts/capture-mobile-hero.mjs [--steps=N] [--crf=N] [--skip-hevc]
 *
 * Options:
 *   --steps=N      Number of scroll positions to capture (default: 120)
 *   --crf=N        H.264 constant rate factor, lower = better quality / larger file
 *                  (default: 30; raise to 34 if the file exceeds 10 MB)
 *   --skip-hevc    Skip HEVC encoding (useful if libx265 is not available)
 *   --port=N       Port the Astro preview is already running on (skips auto-start)
 *
 * Prerequisites:
 *   pnpm build && pnpm preview   (or pass --port if already running)
 *   ffmpeg in PATH with libx264 (and optionally libx265)
 *   @playwright/test installed (pnpm install already covers this)
 */

import { chromium } from '@playwright/test';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/** Parse a --flag=value from argv, returning undefined if absent. */
function flag(name, defaultValue) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : defaultValue;
}
const HAS_FLAG = (name) => process.argv.includes(`--${name}`);

const STEPS = parseInt(flag('steps', '120'), 10);
const CRF_H264 = flag('crf', '30');
const CRF_HEVC = flag('crf-hevc', '28');
const SKIP_HEVC = HAS_FLAG('skip-hevc');
const PORT = flag('port', '4321');

/** Viewport for the portrait capture. */
const VIEWPORT = { width: 720, height: 1280 };

const FRAME_DIR = join(ROOT, 'scratchpad', 'mobile-hero-frames');
const OUT_H264 = join(ROOT, 'public', 'assets', 'hero-mobile.mp4');
const OUT_HEVC = join(ROOT, 'public', 'assets', 'hero-mobile.hevc.mp4');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pad a number to 4 digits for ffmpeg's %04d pattern. */
const pad = (n) => String(n).padStart(4, '0');

/** Check whether a binary exists (via `which` / `where`). */
function hasBin(bin) {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], {
    stdio: 'ignore',
  });
  return result.status === 0;
}

/** Run ffmpeg to assemble frames into a video. Throws on failure. */
function runFfmpeg(args) {
  console.log(`\n▶ ffmpeg ${args.join(' ')}`);
  const result = spawnSync('ffmpeg', args, {
    stdio: 'inherit',
    cwd: ROOT,
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg exited with code ${result.status}`);
  }
}


// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  // Sanity checks
  if (!hasBin('ffmpeg')) {
    console.error('❌  ffmpeg not found in PATH. Install it and retry.');
    process.exit(1);
  }

  // Prepare frame output directory
  if (existsSync(FRAME_DIR)) {
    rmSync(FRAME_DIR, { recursive: true, force: true });
  }
  mkdirSync(FRAME_DIR, { recursive: true });

  // Ensure the public/assets directory exists
  mkdirSync(join(ROOT, 'public', 'assets'), { recursive: true });

  const BASE_URL = `http://localhost:${PORT}`;
  console.log(`\n📸  Capturing ${STEPS} frames at ${VIEWPORT.width}×${VIEWPORT.height} from ${BASE_URL}\n`);

  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 12; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  });
  const page = await context.newPage();

  try {
    // Navigate to home with high tier forced
    await page.goto(`${BASE_URL}/?tier=high`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Wait for the hero to be ready (loader gone = first GPU frame painted)
    await page.waitForFunction(
      () => document.body.classList.contains('scene-ready'),
      { timeout: 20_000, polling: 200 },
    );
    // Extra settle time for the first frame's rAF loop to flush
    await page.waitForTimeout(500);

    // Measure the total scrollable distance
    const { scrollHeight, innerHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    const maxScroll = Math.max(0, scrollHeight - innerHeight);

    console.log(`   scroll range: 0 – ${maxScroll}px  (${scrollHeight}px total height)\n`);

    // -----------------------------------------------------------------------
    // Step through scroll positions, capturing one frame per step
    // -----------------------------------------------------------------------
    for (let i = 0; i < STEPS; i++) {
      const progress = i / (STEPS - 1); // 0..1 inclusive
      const scrollY = Math.round(progress * maxScroll);

      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), scrollY);

      // Wait two rAF cycles for the hero's render loop to settle at this position
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
          }),
      );

      const framePath = join(FRAME_DIR, `frame-${pad(i)}.png`);
      await page.screenshot({ path: framePath, type: 'png' });

      if (i % 20 === 0 || i === STEPS - 1) {
        process.stdout.write(`   frame ${String(i + 1).padStart(3)}/${STEPS}  progress=${(progress * 100).toFixed(0)}%\n`);
      }
    }

    console.log(`\n✅  All ${STEPS} frames captured to ${FRAME_DIR}\n`);
  } finally {
    await browser.close();
  }

  // -----------------------------------------------------------------------
  // Encode H.264 all-intra (every frame is a keyframe — required for seeking)
  // -----------------------------------------------------------------------
  console.log('🎬  Encoding H.264 (all-intra) …');
  runFfmpeg([
    '-y',
    '-framerate', '30',
    '-i', join(FRAME_DIR, 'frame-%04d.png'),
    '-c:v', 'libx264',
    '-g', '1',             // keyint=1: every frame is a keyframe (all-intra)
    '-keyint_min', '1',
    '-crf', CRF_H264,
    '-preset', 'slow',     // better compression at the same CRF
    '-pix_fmt', 'yuv420p', // broad compatibility (requires even dimensions)
    '-movflags', '+faststart',
    '-an',                 // no audio track
    OUT_H264,
  ]);

  // -----------------------------------------------------------------------
  // Encode HEVC / hvc1 (better quality/compression on Apple devices)
  // -----------------------------------------------------------------------
  if (!SKIP_HEVC) {
    if (!hasBin('ffmpeg')) {
      console.warn('⚠️  Skipping HEVC — ffmpeg not available.');
    } else {
      console.log('🎬  Encoding HEVC / hvc1 (all-intra) …');
      // libx265 might not be compiled in — fall back gracefully
      const probe = spawnSync('ffmpeg', ['-encoders'], { encoding: 'utf8' });
      if (probe.stdout && probe.stdout.includes('libx265')) {
        runFfmpeg([
          '-y',
          '-framerate', '30',
          '-i', join(FRAME_DIR, 'frame-%04d.png'),
          '-c:v', 'libx265',
          '-x265-params', 'keyint=1:min-keyint=1',
          '-crf', CRF_HEVC,
          '-preset', 'slow',
          '-pix_fmt', 'yuv420p',
          '-tag:v', 'hvc1', // required for Apple/QuickTime compatibility
          '-movflags', '+faststart',
          '-an',
          OUT_HEVC,
        ]);
      } else {
        console.warn('⚠️  libx265 not available in this ffmpeg build — skipping HEVC.');
        console.warn('    Install ffmpeg with libx265 or run with --skip-hevc.');
      }
    }
  }

  // -----------------------------------------------------------------------
  // Report
  // -----------------------------------------------------------------------
  const report = (path, label) => {
    if (existsSync(path)) {
      const mb = (statSync(path).size / 1_048_576).toFixed(2);
      const warn = parseFloat(mb) > 10 ? '  ⚠️  > 10 MB — raise --crf' : '';
      console.log(`   ${label}: ${mb} MB${warn}`);
    }
  };
  console.log('\n📦  Output:');
  report(OUT_H264, 'H.264 ');
  report(OUT_HEVC, 'HEVC  ');
  console.log('\n✅  Done. Files written to public/assets/');
  console.log('   Commit them with: git add public/assets/hero-mobile*.mp4\n');
})().catch((err) => {
  console.error('\n❌  Capture failed:', err.message ?? err);
  process.exit(1);
});
