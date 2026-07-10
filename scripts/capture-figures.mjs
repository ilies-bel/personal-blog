// scripts/capture-figures.mjs — build-time captures for the SceneFigure plates
// (and the projects ambient backdrop). P4 made /behind-the-build's inline
// figures render a STILL CAPTURE by default (live WebGL is opt-in under the
// 2-context governor), so those stills have to exist — and stay honest. This
// script produces them from the REAL engine:
//
//   1. Starts the dev server and opens /behind-the-build?tier=high (the tier
//      override defeats the SwiftShader/low-core auto-demote on CI-ish boxes so
//      the captures show the full-quality scene).
//   2. For each UNIQUE figure stage on the page (several shaders pin stage 0 —
//      one capture per stage value), clicks that figure's own "Run live" button,
//      waits for the engine's scene:ready, and screenshots the live <canvas> —
//      the exact pixels a visitor's opt-in run would show.
//   3. Scrolls the page's AMBIENT ArticleScene to the yellow-star beat
//      (stage 2.9 — the frame projects.astro used to pin live) with the prose
//      chrome hidden and the dim wash neutralised, and captures the full-viewport
//      canvas as the projects AmbientBackdrop still.
//   4. Writes everything as WebP into src/assets/figures/ + src/assets/backdrops/
//      AFTER the browser closes (writing mid-run would trigger Vite HMR reloads),
//      plus a manifest.json carrying a hash of src/hero/shaders/* + createScene.ts
//      so scripts/check-figure-staleness.mjs can fail CI when the engine drifts
//      from the committed captures.
//
// WebP (not PNG) on purpose: the additive star fields are noise-like and PNG
// them at 300-900KB each — over the dist raster budget (check-asset-sizes.mjs
// hard-fails > 500KB). WebP q82 keeps each capture well under the warn line
// with no visible loss at reading scale.
//
// Usage: node scripts/capture-figures.mjs
//   PW_CHROMIUM_EXECUTABLE=/path/to/chromium  — sandbox browser override
//   PORT=4331                                  — dev-server port
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 4331);
const BASE = `http://localhost:${PORT}`;
const FIGURES_DIR = resolve(root, 'src/assets/figures');
const BACKDROPS_DIR = resolve(root, 'src/assets/backdrops');
const WEBP_QUALITY = 82;
/** The projects backdrop beat — the stage projects.astro used to pin live. */
const STAR_STAGE = 2.9;
/** The behind-the-build ArticleScene journey ends at this stage (JOURNEY[1]). */
const JOURNEY_END = 3.5;

// --- engine-source hash (the staleness contract) -----------------------------
// One hash over the shader sources + the scene controller: if any of them
// change, the committed captures are stale and CI says "rerun capture-figures".
// (check-figure-staleness.mjs recomputes this with the same recipe — importing
// this module would execute the whole capture run, so the ~15 lines are twinned
// there on purpose. Keep the two in sync.)
const HASHED_SOURCES = ['src/hero/shaders', 'src/hero/scene/createScene.ts'];
async function engineHash() {
  const files = [];
  for (const entry of HASHED_SOURCES) {
    const abs = resolve(root, entry);
    const names = entry.endsWith('.ts')
      ? [abs]
      : (await readdir(abs)).sort().map((n) => join(abs, n));
    files.push(...names);
  }
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.slice(root.length + 1));
    hash.update(await readFile(file));
  }
  return hash.digest('hex');
}

// --- dev server ---------------------------------------------------------------
async function startDevServer() {
  const child = spawn(
    process.execPath,
    [resolve(root, 'node_modules/astro/bin/astro.mjs'), 'dev', '--port', String(PORT)],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write(d));
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/behind-the-build`, { redirect: 'follow' });
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      child.kill('SIGTERM');
      throw new Error('dev server did not come up in 120s');
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return child;
}

// scene:ready bookkeeping that SURVIVES navigation: an init-script counter
// (installed before any page script) instead of a per-context promise, so the
// arm can never be lost to a context swap and never races the engine boot.
function installReadyCounter(context) {
  return context.addInitScript(() => {
    window.__sceneReadyCount = 0;
    window.addEventListener('scene:ready', () => {
      window.__sceneReadyCount += 1;
    });
  });
}
function waitForReadyCount(page, count, timeoutMs = 240_000) {
  return page.waitForFunction(
    (target) => (window.__sceneReadyCount ?? 0) >= target,
    count,
    { timeout: timeoutMs, polling: 500 },
  );
}
function readyCount(page) {
  return page.evaluate(() => window.__sceneReadyCount ?? 0);
}

// Park the page's AMBIENT ArticleScene loop by dispatching a well-shaped
// astro:before-swap (its own pauseRendering hook; it never resumes — the
// IntersectionObserver only fires on visibility CHANGES). The event carries a
// throwaway newDocument + a no-op skipTransition so BaseLayout's navigation
// arbiter (which reads both) runs without side effects. A full-window
// high-tier frame under software rendering would otherwise starve everything.
function pauseAmbient(page) {
  return page.evaluate(() => {
    const event = new Event('astro:before-swap');
    Object.defineProperty(event, 'newDocument', {
      value: document.implementation.createHTMLDocument('swap-stub'),
    });
    Object.defineProperty(event, 'skipTransition', { value: () => {} });
    document.dispatchEvent(event);
  });
}

const devServer = await startDevServer();
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_EXECUTABLE || undefined,
});
/** name -> { buffer, outDir } — written to disk only after the browser closes. */
const pending = new Map();

try {
  // =========================================================================
  // PHASE 1 — figure plates: one capture per unique pinned stage.
  // =========================================================================
  // Fragment-cost tuning for software rendering: the engine renders at
  // window-size × tuneRenderPixelRatio (min(dpr, cap)), and the cap drops to
  // 1.6 below 1280px viewports — so a 1000×640 window at DSF 2 renders
  // 1600×1024 (~1.6M px/frame, tractable on SwiftShader) while the prose-width
  // plate itself still screenshots at ~2× CSS (crisp at reading scale).
  const ctx = await browser.newContext({
    viewport: { width: 1000, height: 640 },
    deviceScaleFactor: 2,
  });
  await installReadyCounter(ctx);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/behind-the-build?tier=high`, { waitUntil: 'load' });
  // The Run-live chip floats over the plate's corner and would bake into the
  // clip screenshots; hide it (el.click() still works on hidden elements).
  // Ditto every fixed layer that can bleed over a plate at this viewport: the
  // custom-cursor layers, the reading HUD's side chrome, the dev toolbar.
  await page.addStyleTag({
    content: `
      .scene-figure-run, .cursor, .cursor-trail, .article-hud { visibility: hidden !important; }
      astro-dev-toolbar { display: none !important; }
    `,
  });
  // Let the ambient ArticleScene finish booting (its first composited frame
  // bumps the counter), then PARK its loop for the whole figure phase so its
  // GPU churn doesn't starve the figure boots (SwiftShader is single-lane).
  await waitForReadyCount(page, 1);
  await page.waitForTimeout(1000); // let the boot handle publish before pausing
  await pauseAmbient(page);
  await page.waitForTimeout(500);

  const stages = await page.$$eval('.scene-figure[data-stage]', (els) =>
    [...new Set(els.map((el) => el.getAttribute('data-stage')))],
  );
  console.log(`figures on page: unique stages = ${stages.join(', ')}`);

  // Software rendering makes every in-page evaluate contend with multi-second
  // GPU frames — give them all a generous lane.
  const SLOW = { timeout: 120_000 };
  for (const stage of stages) {
    const figure = page.locator(`.scene-figure[data-stage="${stage}"]`).first();
    await figure.evaluate((el) => el.scrollIntoView({ block: 'center' }), undefined, SLOW);
    await page.waitForTimeout(600); // IO settle for the previous figure's release

    const before = await readyCount(page);
    // Direct element click — GPU load starves actionability waits on SwiftShader.
    await figure.locator('.scene-figure-run').evaluate((el) => el.click(), undefined, SLOW);
    await waitForReadyCount(page, before + 1);
    await figure
      .locator('.scene-figure-live canvas')
      .waitFor({ state: 'attached', timeout: 60_000 });
    // A couple of settle frames past first paint (bloom/grade warm-in).
    await page.waitForTimeout(2500);

    // Re-centre + measure the plate in ONE evaluate immediately before the
    // shot, then clip-screenshot (both viewport-relative). Measuring earlier
    // drifted: the scroll position can move between boot and shot (lazy loads,
    // hydration), and element.screenshot's rAF "stability" wait is unusable at
    // software-render frame times. The live canvas fills the plate's padding
    // box (inset: 0), so the clip is the stage box shrunk by its 1px border.
    const stageBox = await figure.locator('.scene-figure-stage').evaluate(
      (el) => {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      },
      undefined,
      SLOW,
    );
    const clip = {
      x: stageBox.x + 1,
      y: stageBox.y + 1,
      width: stageBox.width - 2,
      height: stageBox.height - 2,
    };
    const png = await page.screenshot({ clip, type: 'png', timeout: 120_000 });
    pending.set(`figure-stage-${stage}.webp`, { buffer: png, outDir: FIGURES_DIR });
    console.log(`✓ captured figure-stage-${stage}`);

    // End the live run explicitly (releases its governor token) before moving on.
    await figure.locator('.scene-figure-run').evaluate((el) => el.click(), undefined, SLOW);
    await page.waitForTimeout(300);
  }
  await ctx.close();

  // =========================================================================
  // PHASE 2 — the projects ambient-backdrop still: the page's own full-viewport
  // ArticleScene scrolled to the yellow-star beat, chrome hidden, dim wash off.
  // =========================================================================
  const bctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  await installReadyCounter(bctx);
  const bpage = await bctx.newPage();
  // Track the settled stage from the scene's own broadcast so we capture the
  // beat we asked for, not a frame mid-ease.
  await bpage.addInitScript(() => {
    window.addEventListener('scene:progress', (event) => {
      window.__capturedStage = event.detail?.stage;
    });
  });
  await bpage.goto(`${BASE}/behind-the-build?tier=high`, { waitUntil: 'domcontentloaded' });
  // Scroll to the target BEFORE the engine finishes booting: the presentation
  // clock starts ON the live scroll position, so the scene opens on the beat
  // instead of gliding to it at software-render frame rates.
  await bpage.evaluate((fraction) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.round(max * fraction));
  }, STAR_STAGE / JOURNEY_END);
  await bpage.addStyleTag({
    content: `
      article.prose, .article-hud, .scene-figure, header, footer, nav,
      .overlay-blog, .cursor, .cursor-trail { visibility: hidden !important; }
      astro-dev-toolbar { display: none !important; }
      body.article-page .bh-backdrop { opacity: 1 !important; filter: none !important; }
      body.article-page .bh-backdrop::before,
      body.article-page .bh-backdrop::after { display: none !important; }
    `,
  });
  await waitForReadyCount(bpage, 1);
  // Wait until the broadcast stage settles on the target (± a hair).
  await bpage.waitForFunction(
    (target) => {
      const s = window.__capturedStage;
      return typeof s === 'number' && Math.abs(s - target) < 0.03;
    },
    STAR_STAGE,
    { timeout: 120_000, polling: 500 },
  );
  await bpage.waitForTimeout(2500); // settle frames at the pinned beat
  const backdropCanvas = bpage.locator('.bh-backdrop canvas');
  await backdropCanvas.waitFor({ state: 'attached', timeout: 60_000 });
  // Full-viewport clip (the backdrop canvas is fixed inset:0) — same
  // stability-wait dodge as the figure captures above.
  const backdropPng = await bpage.screenshot({
    clip: { x: 0, y: 0, width: 1920, height: 1080 },
    type: 'png',
    timeout: 120_000,
  });
  pending.set('backdrop-star.webp', { buffer: backdropPng, outDir: BACKDROPS_DIR });
  console.log(`✓ captured backdrop-star (stage ${STAR_STAGE})`);
  await bctx.close();
} finally {
  await browser.close();
  devServer.kill('SIGTERM');
}

// --- write everything AFTER the browser is done (no HMR churn mid-run) -------
await mkdir(FIGURES_DIR, { recursive: true });
await mkdir(BACKDROPS_DIR, { recursive: true });
for (const [name, { buffer, outDir }] of pending) {
  const out = join(outDir, name);
  await sharp(buffer).webp({ quality: WEBP_QUALITY }).toFile(out);
  console.log(`  wrote ${out.slice(root.length + 1)}`);
}
const manifest = {
  engineHash: await engineHash(),
  generatedAt: new Date().toISOString(),
  captures: [...pending.keys()].sort(),
  note: 'Generated by scripts/capture-figures.mjs — rerun it when the engine hash drifts.',
};
await writeFile(join(FIGURES_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`✓ manifest.json (engineHash ${manifest.engineHash.slice(0, 12)}…)`);
