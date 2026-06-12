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
  },
});
