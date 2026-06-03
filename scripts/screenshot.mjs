// scripts/screenshot.mjs — capture screenshots of the blog with Playwright.
//
// Usage:
//   node scripts/screenshot.mjs                 # shoots the default pages
//   node scripts/screenshot.mjs /about /posts/why-astro-islands
//   BASE=http://localhost:4321/personal-blog node scripts/screenshot.mjs /
//
// Assumes a server is already running at BASE (e.g. `npm run dev` or
// `npm run preview`). Saves PNGs into ./screenshots/.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:4321/personal-blog';
const OUT = resolve(root, 'screenshots');

// Pages to capture (relative to BASE). Override by passing args.
const pages = process.argv.slice(2);
const targets = pages.length ? pages : ['/', '/about', '/posts/why-astro-islands'];

const slug = (p) => (p === '/' ? 'home' : p.replace(/^\/+|\/+$/g, '').replace(/\//g, '-'));

const browser = await chromium.launch();
try {
  await mkdir(OUT, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  for (const t of targets) {
    const url = `${BASE}${t}`.replace(/([^:]\/)\/+/g, '$1');
    await page.goto(url, { waitUntil: 'networkidle' });
    // Give client islands (the hero) a beat to hydrate.
    await page.waitForTimeout(1500);
    const file = resolve(OUT, `${slug(t)}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`✓ ${url} -> screenshots/${slug(t)}.png`);
  }
  await context.close();
} finally {
  await browser.close();
}
