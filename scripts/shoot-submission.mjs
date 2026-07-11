// scripts/shoot-submission.mjs — the Awwwards submission capture suite (P12).
//
// Produces the still set the submission form needs, from the PRODUCTION build:
//
//   · main/    — 1600×1200 MAIN-IMAGE candidates: the four hero frames worth
//                leading with (black-hole opening, supernova crest, red giant,
//                finale ledger). Lifecycle frames are pinned EXACTLY via the
//                engine's window.__bhMorph/__bhFlash debug hooks (the
//                shoot-exact.mjs technique) — no scroll-smoothing lag, no
//                loader frame can ever be the main image.
//   · stills/  — twelve 1600×1200 coverage stills: the remaining lifecycle
//                states (collapse / yellow star / nebula / pale blue dot),
//                two framed 390×844 mobile shots (hero + finale), the
//                projects / graveyard / behind-the-build / contact routes,
//                and the honest degraded editions (reduced-motion poster,
//                no-JS static edition).
//   · feed/    — every shot again at 800×600, so the owner judges legibility
//                at Awwwards feed size before uploading anything.
//
// OUTPUT LOCATION — scratchpad/submission/ (gitignored) ON PURPOSE: these are
// multi-hundred-KB release artifacts regenerated per release (same staleness
// philosophy as the figure captures / OG cards — the scene look drifts, the
// release step reruns this). What IS committed is the manifest
// (docs/awwwards/captures/manifest.json): shot inventory, dimensions, bytes,
// commit SHA — so the campaign docs can reference a stable list while the
// pixels live in the release archive (docs/RUNBOOK.md "Judged-build archive").
//
// Usage: pnpm build && node scripts/shoot-submission.mjs
//   PW_CHROMIUM_EXECUTABLE=/path/to/chromium  — sandbox browser override
//   PORT=4348                                  — preview port
//   PHASES=1,2,3,4                             — rerun a subset (1 hero+
//                                                lifecycle, 2 routes,
//                                                3 mobile, 4 degraded)
// Software renderers (SwiftShader) take minutes per live boot — the timeouts
// are sized for that (the P9 carried note). On real GPU hardware a full run
// is a few minutes. Every shot is written to disk THE MOMENT it is taken
// (astro preview has no HMR to churn), and the feed previews + manifest are
// rebuilt from whatever is on disk at the end — so an interrupted run keeps
// its captures and PHASES reruns only what's missing.
import { chromium } from '@playwright/test';
import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 4348);
const BASE = `http://localhost:${PORT}`;
const OUT = resolve(root, 'scratchpad/submission');
const MANIFEST = resolve(root, 'docs/awwwards/captures/manifest.json');
const STILL_W = 1600;
const STILL_H = 1200;
const FEED_W = 800;
const FEED_H = 600;

if (!existsSync(resolve(root, 'dist'))) {
  console.error('dist/ not found — run `pnpm build` first (this shoots the prod build).');
  process.exit(1);
}

// --- preview server -----------------------------------------------------------
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

// --- shared helpers -------------------------------------------------------------
const HIDE_CHROME = `
  .cursor, .cursor-trail, .skip-link { visibility: hidden !important; }
  astro-dev-toolbar { display: none !important; }
`;
// Pure-scene treatment for the pinned lifecycle frames: the manifesto beats /
// identity / markers are scroll-keyed DOM — under a pinned __bhMorph they
// would narrate the WRONG state, so the lifecycle plates show only the engine.
const HIDE_HOME_DOM = `
  .bh-overlay, .bh-identity, .scene-loader, .star-marker, .bh-focus-dot,
  .overlay-brand, .overlay-blog, .hud-compass, .hud-arc, .bh-cockpit
  { visibility: hidden !important; }
`;

function installReadyCounter(context) {
  return context.addInitScript(() => {
    window.__sceneReadyCount = 0;
    window.addEventListener('scene:ready', () => {
      window.__sceneReadyCount += 1;
    });
  });
}
const waitReady = (page, timeout = 300_000) =>
  page
    .waitForFunction(() => (window.__sceneReadyCount ?? 0) >= 1, null, { timeout, polling: 500 })
    .catch(() => console.warn('  (scene:ready timeout — degraded frame shot)'));

const PHASES = new Set((process.env.PHASES ?? '1,2,3,4').split(',').map(Number));

/** name → note, the manifest's copy for every shot the suite can produce.
 *  Kept as a static table (not run state) so a PHASES-partial rerun can still
 *  annotate shots captured by an earlier run when it rebuilds the manifest. */
const SHOT_NOTES = {
  'main-01-black-hole': 'Black hole opening frame (scroll 0)',
  'main-02-supernova-crest': 'Supernova shock-breakout, ejecta shell + radial fingers (stage 0.72)',
  'main-03-red-giant': 'Red giant held beat, parked vast-limb framing (stage 2.05)',
  'main-04-finale-ledger': 'Finale: pale blue dot + the honest ledger (shipped/dead counts, replay)',
  'still-01-collapse': 'Core collapse between blast and horizon (stage 0.9)',
  'still-02-yellow-star': 'Yellow star / sun rig (stage 2.9)',
  'still-03-nebula': 'Nebula gas, pre-contraction (stage 3.4)',
  'still-04-pale-blue-dot': 'The lone pale blue dot the arc resolves to (stage 4.7)',
  'still-05-projects': 'Work ledger over the sustained-orbit star backdrop',
  'still-06-graveyard': 'Graveyard cabinet over the live cooling-residue journey',
  'still-07-behind-the-build': 'Behind the Build anatomy: shader plates + measurement rules',
  'still-08-contact': 'Contact transmission frame: signal rings + open channel',
  'still-09-mobile-hero': 'Mobile 390×844 opening frame (framed)',
  'still-10-mobile-finale': 'Mobile 390×844 finale ledger (framed)',
  'still-11-reduced-motion': 'Reduced-motion poster edition of the hero',
  'still-12-static-edition': 'No-JS static edition (the trust-repair fallback, shipped)',
};

// Write each shot the moment it's taken — an interrupted run keeps everything
// captured so far.
async function record(name, group, buffer) {
  await mkdir(resolve(OUT, group), { recursive: true });
  await writeFile(resolve(OUT, group, `${name}.png`), buffer);
  console.log(`✓ ${group}/${name}`);
}

// Frame a portrait mobile capture onto the 1600×1200 landscape canvas (room
// tone background + hairline) so the still set stays one aspect ratio.
async function frameMobile(buffer) {
  const inner = await sharp(buffer).resize({ height: STILL_H - 120 }).png().toBuffer();
  const meta = await sharp(inner).metadata();
  const border = Buffer.from(
    `<svg width="${meta.width + 2}" height="${meta.height + 2}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="${meta.width + 1}" height="${meta.height + 1}"
        fill="none" stroke="#3a4350" stroke-width="1"/>
    </svg>`,
  );
  return sharp({
    create: { width: STILL_W, height: STILL_H, channels: 3, background: '#0a1017' },
  })
    .composite([
      { input: inner, left: Math.round((STILL_W - meta.width) / 2), top: 60 },
      { input: border, left: Math.round((STILL_W - meta.width) / 2) - 1, top: 59 },
    ])
    .png()
    .toBuffer();
}

// --- shoot ----------------------------------------------------------------------
const server = await startPreview();
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_EXECUTABLE || undefined,
});

try {
  // ==========================================================================
  // PHASE 1 — the home hero at 1600×1200: main candidates + lifecycle stills.
  // ==========================================================================
  if (PHASES.has(1)) {
  const ctx = await browser.newContext({ viewport: { width: STILL_W, height: STILL_H } });
  await installReadyCounter(ctx);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?tier=high`, { waitUntil: 'load' });
  await page.addStyleTag({ content: HIDE_CHROME + HIDE_HOME_DOM });
  await waitReady(page);
  await page
    .waitForFunction(() => document.body.classList.contains('loader-gone'), null, {
      timeout: 60_000,
    })
    .catch(() => {});
  await page.waitForTimeout(4000); // intro dezoom + bloom settle

  // The engine reads __bhMorph/__bhFlash at frame cadence (see createScene) —
  // each pin waits a few real frames so the eased uniforms land.
  const LIFECYCLE = [
    { name: 'main-01-black-hole', group: 'main', stage: 0.0 },
    // 0.72, NOT the 0.62 nova peak: at the peak the 0.72-strength screen
    // flash washes the frame into a blown white square — past it the ejecta
    // shell + radial fingers read while the core still burns. Reviewed via a
    // 0.50–0.78 sweep; never pin __bhFlash=1 here for the same reason.
    { name: 'main-02-supernova-crest', group: 'main', stage: 0.72 },
    { name: 'main-03-red-giant', group: 'main', stage: 2.05 },
    { name: 'still-01-collapse', group: 'stills', stage: 0.9 },
    { name: 'still-02-yellow-star', group: 'stills', stage: 2.9 },
    { name: 'still-03-nebula', group: 'stills', stage: 3.4 },
    { name: 'still-04-pale-blue-dot', group: 'stills', stage: 4.7 },
  ];
  for (const shot of LIFECYCLE) {
    await page.evaluate(
      ({ stage, flash }) => {
        window.__bhMorph = stage;
        if (flash !== undefined) window.__bhFlash = flash;
        else delete window.__bhFlash;
      },
      { stage: shot.stage, flash: shot.flash },
    );
    // Several composited frames at the pinned value (SwiftShader frames are slow).
    await page.waitForTimeout(6000);
    const png = await page.screenshot({ type: 'png', animations: 'disabled', timeout: 120_000 });
    await record(shot.name, shot.group, png);
  }

  // Finale ledger — a SCROLL state (the ledger DOM keys off real progress),
  // so release the pins and ride to the bottom of the track.
  await page.evaluate(() => {
    delete window.__bhMorph;
    delete window.__bhFlash;
  });
  await page.addStyleTag({
    // The ledger IS the shot — let the overlay DOM back in for it.
    content: `.bh-overlay, .bh-identity { visibility: visible !important; }`,
  });
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page
    .waitForSelector('.bh-finale-ledger', { state: 'visible', timeout: 120_000 })
    .catch(() => console.warn('  (finale ledger not visible — closing frame shot as-is)'));
  await page.waitForTimeout(8000); // presentation clock glide + ledger entrance
  await record(
    'main-04-finale-ledger',
    'main',
    await page.screenshot({ type: 'png', animations: 'disabled', timeout: 120_000 }),
  );
  await ctx.close();
  }

  // ==========================================================================
  // PHASE 2 — route stills at 1600×1200 (pages as shipped, chrome intact).
  // ==========================================================================
  if (PHASES.has(2)) {
  const routes = [
    { name: 'still-05-projects', path: '/projects' },
    { name: 'still-06-graveyard', path: '/graveyard?tier=high', live: true },
    { name: 'still-07-behind-the-build', path: '/behind-the-build?tier=high', live: true, scrollTo: '.scene-figure' },
    { name: 'still-08-contact', path: '/contact' },
  ];
  const rctx = await browser.newContext({ viewport: { width: STILL_W, height: STILL_H } });
  await installReadyCounter(rctx);
  const rpage = await rctx.newPage();
  for (const r of routes) {
    // domcontentloaded: the live-scene routes can hold the load event for
    // minutes under software GL; scene:ready below is the real wait.
    await rpage.goto(`${BASE}${r.path}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await rpage.addStyleTag({ content: HIDE_CHROME });
    if (r.live) await waitReady(rpage);
    if (r.scrollTo) {
      await rpage
        .locator(r.scrollTo)
        .first()
        .evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
        .catch(() => {});
    }
    await rpage.waitForTimeout(r.live ? 4000 : 2000);
    await record(
      r.name,
      'stills',
      await rpage.screenshot({ type: 'png', animations: 'disabled', timeout: 120_000 }),
    );
  }
  await rctx.close();
  }

  // ==========================================================================
  // PHASE 3 — mobile 390×844 (hero + finale), framed onto the 1600×1200 canvas.
  // ==========================================================================
  if (PHASES.has(3)) {
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await installReadyCounter(mctx);
  const mpage = await mctx.newPage();
  await mpage.goto(`${BASE}/?tier=high`, { waitUntil: 'load' });
  await mpage.addStyleTag({ content: HIDE_CHROME });
  await waitReady(mpage);
  await mpage
    .waitForFunction(() => document.body.classList.contains('loader-gone'), null, {
      timeout: 60_000,
    })
    .catch(() => {});
  await mpage.waitForTimeout(4000);
  await record(
    'still-09-mobile-hero',
    'stills',
    await frameMobile(await mpage.screenshot({ type: 'png', animations: 'disabled', timeout: 120_000 })),
  );
  await mpage.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await mpage.waitForTimeout(8000);
  await record(
    'still-10-mobile-finale',
    'stills',
    await frameMobile(await mpage.screenshot({ type: 'png', animations: 'disabled', timeout: 120_000 })),
  );
  await mctx.close();
  }

  // ==========================================================================
  // PHASE 4 — the honest degraded editions.
  // ==========================================================================
  if (PHASES.has(4)) {
  // Reduced motion: the poster edition (no engine chunks requested at all).
  const redctx = await browser.newContext({
    viewport: { width: STILL_W, height: STILL_H },
    reducedMotion: 'reduce',
  });
  const redpage = await redctx.newPage();
  await redpage.goto(`${BASE}/`, { waitUntil: 'load' });
  await redpage.addStyleTag({ content: HIDE_CHROME });
  await redpage.waitForTimeout(6000);
  await record(
    'still-11-reduced-motion',
    'stills',
    await redpage.screenshot({ type: 'png', animations: 'disabled', timeout: 120_000 }),
  );
  await redctx.close();

  // No-JS: the static edition (loader hidden, manifesto + nav in plain HTML).
  const nojsctx = await browser.newContext({
    viewport: { width: STILL_W, height: STILL_H },
    javaScriptEnabled: false,
  });
  const nojspage = await nojsctx.newPage();
  await nojspage.goto(`${BASE}/`, { waitUntil: 'load' });
  await nojspage.waitForTimeout(2000);
  await record(
    'still-12-static-edition',
    'stills',
    await nojspage.screenshot({ type: 'png', timeout: 120_000 }),
  );
  await nojsctx.close();
  }
} finally {
  await browser.close();
  server.kill('SIGTERM');
}

// --- feed previews + manifest, rebuilt from what's ON DISK ---------------------
// (not from this run's ledger — a PHASES-partial rerun must still produce a
// complete manifest covering shots an earlier run captured.)
let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
} catch {
  /* not a git checkout */
}

await mkdir(resolve(OUT, 'feed'), { recursive: true });
const onDisk = [];
for (const group of ['main', 'stills']) {
  const dir = resolve(OUT, group);
  if (!existsSync(dir)) continue;
  for (const f of (await readdir(dir)).filter((f) => f.endsWith('.png')).sort()) {
    onDisk.push({ group, name: f.replace(/\.png$/, '') });
  }
}

const manifest = {
  generatedAt: new Date().toISOString(),
  commit,
  note:
    'Shot inventory for scripts/shoot-submission.mjs. The pixels live in scratchpad/submission/ ' +
    '(gitignored — regenerated per release, archived with the judged build per docs/RUNBOOK.md); ' +
    'this manifest is the committed record of what the suite produces.',
  stillSize: `${STILL_W}x${STILL_H}`,
  feedPreviewSize: `${FEED_W}x${FEED_H}`,
  shots: [],
};

const rows = [];
for (const { group, name } of onDisk) {
  const file = resolve(OUT, group, `${name}.png`);
  const image = sharp(file);
  const meta = await image.metadata();
  // Feed preview: 800×600 (all stills are already 4:3, so cover = plain resize).
  await sharp(file).resize(FEED_W, FEED_H, { fit: 'cover' }).png().toFile(
    resolve(OUT, 'feed', `${name}-feed.png`),
  );
  const kb = Math.round((await readFile(file)).length / 1024);
  manifest.shots.push({
    file: `${group}/${name}.png`,
    feedPreview: `feed/${name}-feed.png`,
    width: meta.width,
    height: meta.height,
    kb,
    note: SHOT_NOTES[name] ?? '',
  });
  rows.push({ shot: `${group}/${name}`, size: `${meta.width}×${meta.height}`, kb });
}
await mkdir(dirname(MANIFEST), { recursive: true });
await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

console.log('\nSubmission capture summary');
console.table(rows);
console.log(`stills  → ${OUT}/{main,stills,feed}`);
console.log(`manifest → ${MANIFEST.slice(root.length + 1)} (commit ${commit})`);
