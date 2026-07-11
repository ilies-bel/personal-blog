// scripts/gen-og-cards.mjs — route-specific Open Graph cards (P12).
//
// Every route (and every post) gets its own 1200×630 share card in public/og/,
// composed from the REAL page — no dedicated card-template page, no mock
// artwork. The recipe, per card:
//
//   1. Serve the PRODUCTION build (astro preview against dist/ — run
//      `pnpm build` first; the script refuses to run without a dist) and
//      screenshot the route at exactly 1200×630, at a per-route state chosen
//      for visual impact. What is shot is the route's ATMOSPHERE, not its
//      DOM copy — the card's own type bar carries the words, so baking the
//      page's h1 into the pixels would double every title:
//        · scene    (home) — the live engine at its black-hole opening frame
//          (after scene:ready + loader-gone), DOM overlays hidden.
//        · backdrop (projects/writing/graveyard/behind-the-build/about/
//          contact) — the route's own celestial layer (live ArticleScene or
//          AmbientBackdrop poster + grade) with the prose column hidden and
//          the reading dim-wash neutralised (the capture-figures.mjs seam),
//          so each card shows the route's P9 lifecycle frame full-strength:
//          star, nebula, cooling red giant, transmission rings…
//        · room     (posts) — the article reading surface with the prose
//          hidden: the calm near-black room. Minimal typographic cards.
//   2. Render the title/domain bar as a TRANSPARENT overlay in the same
//      browser session (a setContent scratch document using the repo's own
//      Space Grotesk / IBM Plex Mono woff2, inlined as data URIs) so the card
//      typography is the site's, not whatever fontconfig has installed.
//   3. Compose OFFLINE with sharp: capture → bottom gradient scrim → text
//      overlay → public/og/<name>.png.
//
// After a run: `node scripts/optimize-public-images.mjs` (palette-quantizes
// the new PNGs in place — the public/ optimizer gate expects that), then
// commit. Target ≤300KB per card (scripts/check-og-cards.mjs enforces it,
// plus the 1200×630 dimensions, against the built dist).
//
// STALENESS PHILOSOPHY — same as the figure captures (capture-figures.mjs):
// these cards are RELEASE ASSETS generated from the live engine. They are
// committed, not rebuilt per-build, and they drift as the scene evolves; the
// release step (docs/RUNBOOK.md) regenerates them. Unlike the figures there
// is no hash gate — the cards are editorial (any recent frame is honest),
// not documentary plates embedded in prose.
//
// Usage: pnpm build && node scripts/gen-og-cards.mjs
//   PW_CHROMIUM_EXECUTABLE=/path/to/chromium  — sandbox browser override
//   PORT=4347                                  — preview port
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 4347);
const BASE = `http://localhost:${PORT}`;
const OUT = resolve(root, 'public/og');
const W = 1200;
const H = 630;
const DOMAIN = 'ilies-bel.dev';

// --- the card inventory ---------------------------------------------------
// name  → public/og/<name>.png (the path pages pass to BaseLayout's ogImage).
// title → the bar headline (the page's own h1 copy, so card and page agree).
// tag   → the mono section label after the domain.
// live  → wait for the engine's scene:ready before shooting.
const CARDS = [
  {
    name: 'home',
    path: '/?tier=high',
    live: true,
    mode: 'scene',
    title: 'Iliès Beldjilali — Software Engineer',
    tag: 'Portfolio',
  },
  {
    name: 'projects',
    path: '/projects',
    mode: 'backdrop',
    title: 'The work that held.',
    tag: 'Work',
  },
  {
    name: 'writing',
    path: '/writing',
    mode: 'backdrop',
    title: 'Everything, in plain words.',
    tag: 'Writing',
  },
  {
    name: 'graveyard',
    path: '/graveyard?tier=high',
    live: true,
    mode: 'backdrop',
    title: 'Not everything survives.',
    tag: 'Graveyard',
  },
  {
    name: 'behind-the-build',
    path: '/behind-the-build?tier=high',
    live: true,
    mode: 'backdrop',
    title: 'One engine, and the budgets that keep it fast.',
    tag: 'Behind the Build',
  },
  {
    name: 'about',
    path: '/about',
    mode: 'backdrop',
    title: 'Software for the web, and how it works underneath.',
    tag: 'About',
  },
  { name: 'contact', path: '/contact', mode: 'backdrop', title: 'Open channel.', tag: 'Contact' },
];

// Per-post cards: one per non-draft entry in src/content/posts. Title read
// from the frontmatter (the same string the page renders as its h1).
async function postCards() {
  const dir = resolve(root, 'src/content/posts');
  const cards = [];
  for (const file of (await readdir(dir)).filter((f) => /\.(md|mdx)$/.test(f))) {
    const src = await readFile(resolve(dir, file), 'utf8');
    if (/^draft:\s*true/m.test(src)) continue;
    const title = src.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1];
    const slug = file.replace(/\.(md|mdx)$/, '');
    if (!title) throw new Error(`no frontmatter title in ${file}`);
    cards.push({ name: `post-${slug}`, path: `/posts/${slug}/`, mode: 'room', title, tag: 'Writing' });
  }
  return cards;
}

if (!existsSync(resolve(root, 'dist'))) {
  console.error('dist/ not found — run `pnpm build` first (cards are shot from the prod build).');
  process.exit(1);
}

// --- preview server (shoot-routes-grayscale pattern) ------------------------
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

// --- the text overlay (browser-rendered, composed offline) -----------------
// The bar uses the site's own faces. woff2 → data URI so the scratch document
// needs no server and the overlay render can never race a font fetch.
async function fontDataUri(rel) {
  const buf = await readFile(resolve(root, 'src/styles/fonts', rel));
  return `data:font/woff2;base64,${buf.toString('base64')}`;
}

function overlayHtml({ title, tag }, fonts) {
  // Long titles (posts) step down and wrap to two lines; short route titles
  // sit on one big line. The bar hugs the bottom-left safe area.
  const size = title.length > 34 ? 54 : 64;
  return `<!doctype html><html><head><style>
    @font-face { font-family: 'Space Grotesk'; src: url('${fonts.grotesk}') format('woff2'); font-weight: 300 700; }
    @font-face { font-family: 'IBM Plex Mono'; src: url('${fonts.mono}') format('woff2'); font-weight: 400; }
    * { margin: 0; padding: 0; }
    html, body { background: transparent; width: ${W}px; height: ${H}px; overflow: hidden; }
    .bar {
      position: fixed; inset: 0;
      display: flex; flex-direction: column; justify-content: flex-end;
      padding: 0 76px 58px; gap: 18px;
    }
    .eyebrow {
      font-family: 'IBM Plex Mono', monospace; font-size: 21px;
      letter-spacing: 0.22em; text-transform: uppercase;
      color: rgba(216, 208, 195, 0.78);
      display: flex; align-items: center; gap: 16px;
    }
    .eyebrow .tick { width: 26px; height: 2px; background: #c9a45c; }
    .eyebrow .sep { color: rgba(201, 164, 92, 0.9); letter-spacing: 0; }
    .title {
      font-family: 'Space Grotesk', sans-serif; font-weight: 700;
      font-size: ${size}px; line-height: 1.08; letter-spacing: -0.015em;
      color: #f0e9dc; max-width: 980px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
  </style></head><body>
    <div class="bar">
      <p class="eyebrow"><span class="tick"></span>${DOMAIN}<span class="sep">·</span>${tag}</p>
      <p class="title">${title}</p>
    </div>
  </body></html>`;
}

// Bottom scrim so the bar text stays legible over any capture — pure gradient
// SVG (no text → no fontconfig dependency), rendered by sharp.
const SCRIM = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0a1017" stop-opacity="0"/>
        <stop offset="0.45" stop-color="#0a1017" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#0a1017" stop-opacity="0.92"/>
      </linearGradient>
    </defs>
    <rect x="0" y="${H - 300}" width="${W}" height="300" fill="url(#g)"/>
  </svg>`,
);

// --- shoot -------------------------------------------------------------------
const server = await startPreview();
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_EXECUTABLE || undefined,
});

try {
  await mkdir(OUT, { recursive: true });
  const fonts = {
    grotesk: await fontDataUri('space-grotesk-latin.woff2'),
    mono: await fontDataUri('ibm-plex-mono-latin.woff2'),
  };

  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });
  // scene:ready counter that survives navigations (capture-figures pattern).
  await context.addInitScript(() => {
    window.__sceneReadyCount = 0;
    window.addEventListener('scene:ready', () => {
      window.__sceneReadyCount += 1;
    });
  });
  const page = await context.newPage();

  // The card bar owns the words + identity — the page's DOM (headline, nav,
  // HUD, cursor layers) would double them, so each mode strips down to the
  // route's visual layer. `backdrop`/`room` also neutralise the reading
  // dim-wash on .bh-backdrop (opacity/filter + the vignette pseudo-elements
  // hero.css hangs on it) while KEEPING .ambient-backdrop-grade — that grade
  // carries the P9 variant tint and the contact transmission rings.
  const HIDE_COMMON = `
    .cursor, .cursor-trail, .skip-link, .overlay-brand, .overlay-blog,
    .hud-compass, .hud-arc, .bh-cockpit { visibility: hidden !important; }
    astro-dev-toolbar { display: none !important; }
  `;
  const HIDE_BY_MODE = {
    scene: `
      .bh-overlay, .bh-identity, .scene-loader, .star-marker, .bh-focus-dot
      { visibility: hidden !important; }
    `,
    // The backdrop layer (AmbientBackdrop / ArticleScene's .bh-root) renders
    // INSIDE <main>, so main is hidden and the backdrop subtree re-enabled —
    // visibility (unlike display) can be restored on a descendant.
    backdrop: `
      main, header.subnav, footer.site-footer, .article-hud { visibility: hidden !important; }
      main .bh-root { visibility: visible !important; }
      .bh-backdrop { opacity: 1 !important; filter: none !important; }
      .bh-backdrop::before, .bh-backdrop::after { display: none !important; }
    `,
    room: `
      main, header.subnav, footer.site-footer, .article-hud { visibility: hidden !important; }
    `,
  };

  const cards = [...CARDS, ...(await postCards())];
  for (const card of cards) {
    // domcontentloaded, not load: the engine routes keep the load event busy
    // for minutes on software renderers; scene:ready below is the real wait.
    await page.goto(`${BASE}${card.path}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.addStyleTag({ content: HIDE_COMMON + HIDE_BY_MODE[card.mode] });
    if (card.live) {
      // Painted canvas or poster fallback — whichever the box can do. Software
      // renderers (SwiftShader) can take 45s+ to first frame; keep the lane long.
      await page
        .waitForFunction(() => (window.__sceneReadyCount ?? 0) >= 1, null, { timeout: 240_000 })
        .catch(() => console.warn(`  (scene:ready timeout on ${card.path} — poster state shot)`));
      // Home only: the loader dissolve runs ~2.1s after scene-ready; wait for
      // body.loader-gone so no loader veil ghosts into the card.
      await page
        .waitForFunction(() => document.body.classList.contains('loader-gone'), null, {
          timeout: 30_000,
        })
        .catch(() => {});
    }
    // Hydration + entrance choreography settle.
    await page.waitForTimeout(card.live ? 3000 : 1600);
    const capture = await page.screenshot({ type: 'png', timeout: 120_000 });

    // Text overlay: transparent scratch document in the same session.
    await page.setContent(overlayHtml(card, fonts), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const overlay = await page.screenshot({ type: 'png', omitBackground: true });

    const out = resolve(OUT, `${card.name}.png`);
    await sharp(capture)
      .composite([
        { input: SCRIM, left: 0, top: 0 },
        { input: overlay, left: 0, top: 0 },
      ])
      .png()
      .toFile(out);
    console.log(`✓ og/${card.name}.png (${card.title})`);
  }

  await context.close();
} finally {
  await browser.close();
  server.kill('SIGTERM');
}

console.log('\nNow run: node scripts/optimize-public-images.mjs   (then commit public/og/)');
