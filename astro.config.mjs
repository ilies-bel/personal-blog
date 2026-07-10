// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// ---------------------------------------------------------------------------
// GLSL comment stripping — PERF-007
//
// GLSL shader sources are embedded as template-literal strings tagged with
// `/* glsl */`. The content is sent verbatim to the GPU driver, which ignores
// comments, but Vite's esbuild minifier cannot see inside string literals and
// therefore cannot remove them.  This Vite transform plugin strips single-line
// (`// …`) and multi-line (`/* … */`) comments from those strings at build
// time, keeping the source files readable while eliminating dead bytes from the
// production bundle.  Only files inside `src/hero/shaders/` are affected.
// ---------------------------------------------------------------------------
/** @returns {import('vite').Plugin} */
function stripGlslComments() {
  return {
    name: 'strip-glsl-comments',
    enforce: /** @type {'pre'} */ ('pre'),
    transform(code, id) {
      if (!id.includes('/shaders/')) return null;
      if (!id.endsWith('.ts') && !id.endsWith('.js')) return null;

      let changed = false;
      const result = code.replace(
        /\/\* glsl \*\/ `([\s\S]*?)`/g,
        (_match, content) => {
          const stripped = content
            // strip GLSL single-line comments (keep the newline so line numbers
            // roughly track — the GPU compiler never sees them anyway)
            .replace(/[ \t]*\/\/[^\n]*/g, '')
            // strip GLSL multi-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '')
            // collapse runs of blank lines down to one
            .replace(/\n{3,}/g, '\n\n');
          if (stripped !== content) changed = true;
          return '/* glsl */ `' + stripped + '`';
        },
      );

      return changed ? { code: result, map: null } : null;
    },
  };
}

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

// ---------------------------------------------------------------------------
// Dev-only route injection
//
// src/_dev-pages/dev-blueprint.astro is a measuring bench for cockpit geometry
// that must never ship in production.  It lives OUTSIDE src/pages/ so the
// production build never processes it (no HTML emitted, no sitemap entry, no
// asset shipped).  During `astro dev` the integration below injects it back as
// a live route so the page is reachable at /dev-blueprint.
// ---------------------------------------------------------------------------
/** @type {() => import('astro').AstroIntegration} */
const devOnlyRoutes = () => ({
  name: 'dev-only-routes',
  hooks: {
    'astro:config:setup': ({ injectRoute, command }) => {
      if (command === 'dev') {
        injectRoute({
          pattern: '/dev-blueprint',
          entrypoint: 'src/_dev-pages/dev-blueprint.astro',
        });
      }
    },
  },
});

// https://astro.build/config
export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',
  integrations: [
    devOnlyRoutes(),
    mdx(),
    react(),
    // Belt-and-suspenders: even if /dev-blueprint were somehow built, exclude
    // it from the sitemap so search engines never see it.
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
    plugins: [stripGlslComments()],
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
