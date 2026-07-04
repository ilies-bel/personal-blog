// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// ---------------------------------------------------------------------------
// GitHub Pages config
// ---------------------------------------------------------------------------
// `site` + `base` assume a PROJECT page deployed at:
//     https://<user>.github.io/personal-blog/
// If you later move to a user page (https://<user>.github.io) or a custom
// domain, set `base` to '/' and update `site` accordingly.
//
// Change SITE / BASE here and everything (links, sitemap, canonical URLs)
// follows automatically.
// ---------------------------------------------------------------------------
const SITE = 'https://ilies-bel.github.io';
const BASE = '/personal-blog';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',
  integrations: [
    mdx(),
    react(),
    sitemap(),
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
