import { test, expect } from './test-base';

// Degraded-mode sweep (P14): the two matrix cells no other suite covered.
//
// 1. No-WebGL: JS runs but getContext('webgl'/'webgl2') returns null (blocked
//    GL, virtualized GPU, enterprise policy). The contract is the IMMEDIATE
//    revealWithoutWebgl path in HeroIsland: the moment createScene's probe
//    throws its typed WebGL-unavailable error, the page must lift the loader
//    RIGHT AWAY (never sit out the 8s safety backstop in index.astro), show
//    the on-brand .webgl-fallback note, and leave the conventional path —
//    scroll-driven manifesto DOM + labelled nav — fully usable.
//    (e2e/webgl.spec.ts covers the OTHER GL failure: context LOSS mid-session
//    via WEBGL_lose_context. This file covers never-had-GL.)
//
// 2. Slow network: engine + script chunks crawling in at the network edge.
//    The loader must paint immediately (server-rendered) and the skip control
//    must release the page while chunks are still in flight.

// Wall-clock ordering assertions on contended software-rendered CI; one retry
// absorbs scheduler outliers (a broken reveal path fails deterministically).
test.describe.configure({ retries: 2 });

test('no-WebGL homepage reveals the on-brand fallback promptly and stays usable', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  // Kill WebGL before any document script runs: both context ids return null,
  // exactly what a GL-blocked browser reports. 2d et al stay real so nothing
  // unrelated breaks.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return (original as (this: HTMLCanvasElement, t: string, ...r: unknown[]) => unknown).call(
        this,
        type,
        ...rest,
      );
    };
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // The loader paints first (server-rendered)…
  await expect(page.locator('.scene-loader')).toBeVisible();

  // …and the DEDICATED no-WebGL reveal fires well before the 8s backstop
  // could. body.webgl-unavailable is added ONLY by revealWithoutWebgl (the
  // backstop adds scene-ready/loader-gone but never this class), so seeing it
  // inside the backstop window proves the immediate path ran, not the timer.
  await expect(page.locator('body')).toHaveClass(/webgl-unavailable/, { timeout: 7_000 });
  await expect(page.locator('body')).toHaveClass(/scene-ready/);
  await expect(page.locator('body')).toHaveClass(/loader-gone/);

  // The on-brand note is visible, names the situation, and hands over the
  // conventional path (it must never intercept clicks meant for the page).
  const fallback = page.locator('.webgl-fallback');
  await expect(fallback).toBeVisible();
  await expect(fallback).toContainText(/needs WebGL/i);
  expect(await fallback.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  // Its own links re-enable pointer events (contact CTA stays clickable).
  await expect(fallback.locator('a', { hasText: /get in touch/i })).toBeVisible();

  // The loader cover has fully handed off.
  expect(
    await page.locator('.scene-loader').evaluate((el) => getComputedStyle(el).pointerEvents),
  ).toBe('none');

  // No live canvas ever mounted — the page is the scroll-driven DOM edition.
  expect(
    await page.evaluate(
      () => document.querySelectorAll('.bh-root canvas').length,
    ),
  ).toBe(0);

  // Labelled primary nav is visible and WORKS: navigate off the page.
  for (const label of ['Work', 'Writing', 'About', 'Contact']) {
    await expect(
      page.locator('.overlay-blog-links a', { hasText: label }),
      `${label} visible with no WebGL`,
    ).toBeVisible();
  }
  await page.locator('.overlay-blog-links a', { hasText: 'Writing' }).click();
  await page.waitForURL(/\/writing\/?$/);
  await expect(page.locator('h1')).toBeVisible();

  // The whole degraded journey produced zero errors: the unavailable probe is
  // a HANDLED condition, not an exception path.
  const benign = /GPU stall|SwiftShader|WebGL.*deprecated|Automatic fallback/i;
  expect(pageErrors, 'page errors on the no-WebGL path').toEqual([]);
  expect(consoleErrors.filter((e) => !benign.test(e)), 'console errors').toEqual([]);
});

test('slow network: loader paints immediately and skip releases the page while chunks crawl', async ({
  page,
}) => {
  // Emulate a crawling connection at the network edge: the heavy engine
  // chunks are held 15s (they never land inside this test's window), and
  // every OTHER script/font response crawls in after 2s. (Route-level delays
  // rather than CDP Network.emulateNetworkConditions so the throttle also
  // applies on the mobile-chrome project with no CDP session plumbing; the
  // property under test — the UI is usable while the engine is still in
  // flight — is the same.)
  const ENGINE_HOLD_MS = 15_000;
  const CRAWL_MS = 2_000;
  await page.route(/\.(m?js|css|woff2?)(\?|$)/i, async (route) => {
    const heavy = /three-core|three-post|createScene/i.test(route.request().url());
    await new Promise((r) => setTimeout(r, heavy ? ENGINE_HOLD_MS : CRAWL_MS));
    await route.continue().catch(() => {});
  });

  const t0 = Date.now();
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // The loader is server-rendered: it is up as soon as the document parses,
  // long before any held chunk lands (its CSS is inlined in the document).
  await expect(page.locator('.scene-loader')).toBeVisible();
  await expect(page.locator('.scene-loader-name')).toBeVisible();

  // Labelled nav is painted from document HTML too — visible during the crawl.
  for (const label of ['Work', 'Writing', 'About', 'Contact']) {
    await expect(page.locator('.overlay-blog-links a', { hasText: label })).toBeVisible();
  }

  // The skip control releases the page while the engine chunks are STILL held
  // at the edge. Its wiring rides the small bundled loader script (crawling in
  // after ~2s here), so retry the click until the wiring has landed — a
  // visitor on a bad connection presses it again exactly the same way.
  const skip = page.locator('.scene-loader-skip');
  await expect(skip).toBeVisible();
  await expect(async () => {
    await skip.click();
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await expect(page.locator('body')).toHaveClass(/loader-gone/);
  expect(
    await page.locator('.scene-loader').evaluate((el) => getComputedStyle(el).pointerEvents),
  ).toBe('none');

  // Prove "DURING the crawl": the release happened while the 15s engine hold
  // was still pending — the page never needed three.js to become usable.
  expect(Date.now() - t0).toBeLessThan(ENGINE_HOLD_MS - 2_000);
});
