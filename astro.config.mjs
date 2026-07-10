// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// ---------------------------------------------------------------------------
// GitHub Pages config — custom domain
// ---------------------------------------------------------------------------
// The site is served from the apex custom domain `ilies-bel.dev` (GitHub Pages
// + Cloudflare DNS). Because it lives at the domain root, there is no path
// prefix: `base` is '/'. The `public/CNAME` file tells GitHub Pages which
// custom domain to bind on each deploy.
//
// (History: this used to be a PROJECT page at
// https://ilies-bel.github.io/personal-blog/ with base '/personal-blog'.)
//
// Change SITE / BASE here and everything (links, sitemap, canonical URLs)
// follows automatically.
// ---------------------------------------------------------------------------
const SITE = 'https://ilies-bel.dev';
const BASE = '/';

// Dev-only routes: pages that are measuring benches / design tooling, not
// content. They live OUTSIDE src/pages (in src/dev-pages) so the production
// build cannot emit them at all — previously /dev-blueprint shipped an empty
// crawlable shell and landed in the sitemap. The integration injects them only
// when the dev server is running.
const devOnlyPages = () => ({
  name: 'dev-only-pages',
  hooks: {
    /** @param {{ command: string, injectRoute: (r: { pattern: string, entrypoint: string }) => void }} options */
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command !== 'dev') return;
      injectRoute({
        pattern: '/dev-blueprint',
        entrypoint: './src/dev-pages/dev-blueprint.astro',
      });
    },
  },
});

// https://astro.build/config
export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',
  integrations: [
    mdx(),
    react(),
    devOnlyPages(),
    // Belt-and-braces: even if a dev-only route ever leaks into a build, keep
    // it out of the sitemap.
    sitemap({ filter: (page) => !page.includes('/dev-blueprint') }),
  ],
  build: {
    // Emit clean directory-style URLs (/posts/foo/ -> /posts/foo/index.html)
    format: 'directory',
    // Inline every page's stylesheets into the HTML instead of shipping them as
    // render-blocking <link> requests. The whole CSS payload is ~20-30 KB per
    // page — cheaper carried in the document than paid as an extra round-trip
    // before first paint (Lighthouse flagged ~310ms of render-blocking CSS on
    // throttled mobile). Trade-off accepted: pages can't share a cached
    // stylesheet, but the site is 8 pages and first-visit paint wins.
    inlineStylesheets: 'always',
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          // Split the hero engine's dynamic-import graph so it is not ONE
          // monolithic ~760 KB parse/eval unit (the old createScene.*.js):
          //   - three-core:  three.js proper (~600 KB raw) — the single biggest
          //     module-eval cost. HeroIsland pre-evaluates it in its own task
          //     (`await import('three')`) before pulling the scene code, so the
          //     main thread never eats core + addons + scene in one long task.
          //   - three-post:  the three/examples addons we use (EffectComposer /
          //     UnrealBloom chain / GPUComputationRenderer).
          //   - the site's own scene code stays in the createScene chunk.
          // All three still load before frame 1 (nothing here delays the first
          // painted frame) — they just download in parallel and eval as separate
          // tasks. Cache-friendliness is a free bonus: three-core's hash only
          // changes on a three upgrade, not on every scene-code edit.
          manualChunks: (id) => {
            if (id.includes('node_modules/three/examples/')) return 'three-post';
            if (id.includes('node_modules/three/')) return 'three-core';
            return undefined;
          },
        },
      },
    },
  },
});
