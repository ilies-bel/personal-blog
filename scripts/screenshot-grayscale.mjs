// scripts/screenshot-grayscale.mjs — EXP-035 grayscale route-identity evidence.
//
// Captures each major route in grayscale (CSS filter: grayscale(1)) so the
// material system can be verified by a reviewer without color information.
// A route is considered identifiable if its grayscale signature matches the
// spec table in docs/specs/route-physical-laws.md § "The Grayscale Blind Test".
//
// Usage:
//   node scripts/screenshot-grayscale.mjs
//
// Requires a server at BASE (default: http://localhost:4321/personal-blog).
// Start one with `npm run preview` or `npm run dev` before running this script.
// Output directory: evidence/art-direction/
//
// Produced files (PNG, 1280×900):
//   evidence/art-direction/grayscale-projects.png      — Orbital cluster arrangement
//   evidence/art-direction/grayscale-writing.png       — Variable-density clusters
//   evidence/art-direction/grayscale-graveyard.png     — Contracted hairline column
//   evidence/art-direction/grayscale-behind-the-build.png — Left-edge strata labels
//   evidence/art-direction/grayscale-about.png         — Single column, maximum whitespace
//   evidence/art-direction/grayscale-home.png          — Hero reference (non-route)

import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:4321';
const OUT = resolve(root, 'evidence', 'art-direction');

// Routes to capture with their route-material law for reviewer orientation.
const ROUTES = [
  { path: '/projects/',          slug: 'grayscale-projects',          law: 'Yellow Star / Sustained Orbit — orbital cluster, dense panels, defined edges' },
  { path: '/writing/',           slug: 'grayscale-writing',           law: 'Nebula / Dispersed Matter — variable-density clusters, teal accent, soft edges' },
  { path: '/graveyard/',        slug: 'grayscale-graveyard',         law: 'White Dwarf / Thermal Decay — contracted column, hairlines, matte surface' },
  { path: '/behind-the-build/', slug: 'grayscale-behind-the-build',  law: 'Red Giant / Interior Layers — strata left-edge labels, progressive density' },
  { path: '/about/',            slug: 'grayscale-about',             law: 'Pale Blue Dot / Human Scale — centered single column, no panels, maximum whitespace' },
  { path: '/',                  slug: 'grayscale-home',              law: 'Home / Hero reference (not a route material, baseline comparison)' },
];

// CSS injected into each page to apply grayscale filter and strip navigation
// chrome so the reviewer sees ONLY the route's material identity.
const GRAYSCALE_CSS = `
  /* Strip color: the only information channel is density, edge, shape, scale. */
  html { filter: grayscale(1) !important; }
`;

const browser = await chromium.launch();

try {
  await mkdir(OUT, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Inject the grayscale CSS into every page before navigation.
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = 'html { filter: grayscale(1) !important; }';
      document.head.appendChild(style);
    });
  });

  // Write a manifest alongside the screenshots so the reviewer knows which
  // physical law each file represents.
  const manifest = { capturedAt: new Date().toISOString(), routes: [] };

  for (const { path, slug, law } of ROUTES) {
    const url = `${BASE}${path}`.replace(/([^:]\/)\/+/g, '$1');

    await page.goto(url, { waitUntil: 'networkidle' });
    // Allow client islands (hero canvas, intersection observers) to settle.
    await page.waitForTimeout(1800);

    // Inject grayscale via addStyleTag as a belt-and-suspenders approach:
    // the init-script runs before DOMContentLoaded but addInitScript is
    // sometimes overridden by inline styles; this ensures the filter applies.
    await page.addStyleTag({ content: GRAYSCALE_CSS });

    const file = resolve(OUT, `${slug}.png`);
    await page.screenshot({ path: file, fullPage: true });

    manifest.routes.push({ slug, path, law, file: `${slug}.png` });
    console.log(`✓ ${url}\n  → evidence/art-direction/${slug}.png`);
    console.log(`  law: ${law}\n`);
  }

  await writeFile(
    resolve(OUT, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );
  console.log('✓ manifest → evidence/art-direction/manifest.json');

  await context.close();
} finally {
  await browser.close();
}
