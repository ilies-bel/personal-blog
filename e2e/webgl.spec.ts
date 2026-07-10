import { test, expect, type Page } from '@playwright/test';

// WebGL GOVERNANCE (P4): the site caps itself at TWO simultaneous WebGL
// contexts, reading routes ship zero three.js, and mount/unmount cycles do not
// leak. The census below wraps HTMLCanvasElement.prototype.getContext BEFORE
// any page script runs, so every context creation — engine, probe, figure — is
// observed at the source.
//
// Census vocabulary:
//   created        — unique GL contexts ever created (includes the throwaway
//                    capability-probe canvases the engine deliberately makes).
//   everConnected  — contexts whose canvas ever entered the DOM: the REAL
//                    renderers (probe canvases are never appended).
//   live           — contexts whose canvas is in the DOM right now.
// Assertions run on everConnected/live so capability probes never inflate them.

interface CensusSnapshot {
  created: number;
  everConnected: number;
  live: number;
}

async function installCensus(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const census: { type: string; everConnected: boolean; canvas: HTMLCanvasElement }[] = [];
    const contexts: { canvas: HTMLCanvasElement; ctx: unknown }[] = [];
    (window as unknown as { __glCensus: unknown }).__glCensus = census;
    (window as unknown as { __glContexts: unknown }).__glContexts = contexts;
    const original = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      const ctx = (original as (this: HTMLCanvasElement, t: string, ...rest: unknown[]) => unknown).call(
        this,
        type,
        ...args,
      );
      if (ctx && (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl')) {
        // getContext twice on one canvas returns the SAME context — count unique.
        if (!contexts.some((entry) => entry.ctx === ctx)) {
          contexts.push({ canvas: this, ctx });
          census.push({ type, everConnected: this.isConnected, canvas: this });
        }
      }
      return ctx;
    };
    // Mark contexts whose canvas reaches the DOM later (three.js constructs the
    // renderer BEFORE the canvas is appended, so creation-time isConnected is
    // false for real renderers too).
    window.setInterval(() => {
      for (const entry of census) {
        if (!entry.everConnected && entry.canvas.isConnected) entry.everConnected = true;
      }
    }, 200);
  });
}

function readCensus(page: Page): Promise<CensusSnapshot> {
  return page.evaluate(() => {
    const census =
      (window as unknown as {
        __glCensus?: { everConnected: boolean; canvas: HTMLCanvasElement }[];
      }).__glCensus ?? [];
    for (const entry of census) {
      if (!entry.everConnected && entry.canvas.isConnected) entry.everConnected = true;
    }
    return {
      created: census.length,
      everConnected: census.filter((e) => e.everConnected).length,
      live: census.filter((e) => e.canvas.isConnected).length,
    };
  });
}

// ---------------------------------------------------------------------------
// /behind-the-build — the page that used to peak at ~11 live contexts.
// ---------------------------------------------------------------------------

test('behind-the-build at rest: figures are captures, ≤2 real contexts ever', async ({ page }) => {
  test.slow();
  await installCensus(page);
  await page.goto('/behind-the-build', { waitUntil: 'load' });

  // Scroll the whole article through the viewport, the way a reader would.
  const steps = 12;
  for (let i = 1; i <= steps; i += 1) {
    await page.evaluate(
      (fraction) => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, Math.round(max * fraction));
      },
      i / steps,
    );
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(1500);

  // Every figure rests on its capture: an <img> plate, zero figure canvases.
  const figures = page.locator('.scene-figure');
  const figureCount = await figures.count();
  expect(figureCount).toBeGreaterThanOrEqual(10);
  await expect(page.locator('.scene-figure img.scene-figure-capture')).toHaveCount(figureCount);
  await expect(page.locator('.scene-figure canvas')).toHaveCount(0);

  // At rest the page holds at most the ONE ambient backdrop context (or none on
  // low-tier devices, where ArticleScene renders its poster branch instead).
  const census = await readCensus(page);
  expect(census.everConnected, 'real GL contexts after a full read-through').toBeLessThanOrEqual(2);
  expect(census.live, 'live GL contexts at rest').toBeLessThanOrEqual(2);
});

test('activating three figures sequentially never exceeds 2 live contexts', async ({ page }) => {
  // Three engine boots on a software renderer — give the whole journey a real
  // budget (test.slow() alone caps at 3× the 30s default, less than one boot
  // can take under SwiftShader).
  test.setTimeout(360_000);
  await installCensus(page);
  await page.goto('/behind-the-build', { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  // Three figures spread across the page (distinct stages so each is a distinct
  // plate). data-stage values come from the page's own SHADERS table.
  const stages = await page
    .locator('.scene-figure[data-stage]')
    .evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute('data-stage')))]);
  // Spread the picks across the page so scrolling to the next one carries the
  // previous plate well outside its release margin (adjacent gallery plates can
  // sit within the 200px IntersectionObserver rootMargin of each other).
  const picks = [stages[0], stages[3], stages[6]].filter((s): s is string => !!s);
  expect(picks.length).toBe(3);

  for (const stage of picks) {
    const figure = page.locator(`.scene-figure[data-stage="${stage}"]`).first();
    await figure.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    // Wait for any PREVIOUS figure's scroll-away release (its canvas detaches).
    await page.waitForFunction(
      (current) =>
        [...document.querySelectorAll('.scene-figure canvas')].every((canvas) =>
          canvas.closest(`.scene-figure[data-stage="${current}"]`),
        ),
      stage,
      { timeout: 20_000 },
    );

    // Click until the island responds: the figure hydrates on visibility
    // (client:visible), so a synthetic click can land before React attached
    // the handler on a slow CI box. data-mode leaving 'capture' is the ack.
    const runButton = figure.locator('.scene-figure-run');
    await expect(runButton).toBeVisible({ timeout: 30_000 });
    await expect(async () => {
      // Idempotent: only re-click while still at rest, so a slow React flush
      // can never be toggled straight back off by the retry.
      if ((await figure.getAttribute('data-mode')) === 'capture') {
        await runButton.evaluate((el) => (el as HTMLElement).click());
      }
      const mode = await figure.getAttribute('data-mode');
      expect(mode, 'figure island acknowledged the click').not.toBe('capture');
    }).toPass({ timeout: 60_000, intervals: [1_000, 2_000] });
    expect(await figure.getAttribute('data-mode'), 'live mode granted').toBe('live');
    await figure.locator('.scene-figure-live canvas').waitFor({ state: 'attached', timeout: 120_000 });
    await page.waitForTimeout(1000);

    const census = await readCensus(page);
    expect(census.live, `live contexts with figure ${stage} running`).toBeLessThanOrEqual(2);
  }

  // Total REAL contexts across the whole session: ambient (≤1) + one per
  // activation. Anything above means a figure failed to dispose on scroll-away.
  const census = await readCensus(page);
  expect(census.everConnected).toBeLessThanOrEqual(2 + picks.length);
  expect(census.live).toBeLessThanOrEqual(2);
});

// ---------------------------------------------------------------------------
// Reading routes — zero three.js, zero contexts.
// ---------------------------------------------------------------------------

for (const route of ['/about', '/projects']) {
  test(`${route} ships zero three.js and creates zero WebGL contexts`, async ({ page }) => {
    const engineRequests: string[] = [];
    page.on('request', (req) => {
      if (/three-core|three-post|createScene/i.test(req.url())) engineRequests.push(req.url());
    });
    await installCensus(page);
    await page.goto(route, { waitUntil: 'load' });
    await page.waitForTimeout(2500); // give any (wrong) lazy import time to fire

    expect(engineRequests, `three.js chunks requested on ${route}`).toEqual([]);
    const census = await readCensus(page);
    expect(census.created, `WebGL contexts created on ${route}`).toBe(0);
    // The ambient backdrop is a still <img>, not a canvas.
    await expect(page.locator('.ambient-backdrop img.ambient-backdrop-poster')).toHaveCount(1);
    await expect(page.locator('.bh-backdrop canvas')).toHaveCount(0);
  });
}

// ---------------------------------------------------------------------------
// Heap regression — SPA navigation cycles must not accrete engine heap.
// ---------------------------------------------------------------------------

test('10 SPA navigation cycles do not grow the JS heap materially', async ({ page, browserName }) => {
  test.setTimeout(360_000); // 10 engine-page cycles on a software renderer
  test.skip(browserName !== 'chromium', 'performance.memory is Chromium-only');

  await page.goto('/', { waitUntil: 'load' });

  const hasMemory = await page.evaluate(
    () => typeof (performance as unknown as { memory?: unknown }).memory !== 'undefined',
  );
  test.skip(!hasMemory, 'performance.memory unavailable in this browser build');

  const client = await page.context().newCDPSession(page);

  // SPA-navigate by clicking a real same-origin link (ClientRouter intercepts
  // document clicks; a synthetic click bypasses any pointer-events gating).
  const spaNavigate = async (pathname: string): Promise<void> => {
    const clicked = await page.evaluate((target) => {
      const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')];
      const link = links.find((a) => {
        try {
          const url = new URL(a.href, window.location.href);
          return (
            url.origin === window.location.origin &&
            url.pathname.replace(/\/$/, '') === target.replace(/\/$/, '')
          );
        } catch {
          return false;
        }
      });
      if (!link) return false;
      link.click();
      return true;
    }, pathname);
    expect(clicked, `no in-page link to ${pathname}`).toBe(true);
    await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === pathname.replace(/\/$/, ''), {
      timeout: 20_000,
    });
    await page.waitForTimeout(600);
  };

  const measureHeap = async (): Promise<number> => {
    await client.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(400);
    await client.send('HeapProfiler.collectGarbage');
    return page.evaluate(
      () => (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize,
    );
  };

  const cycle = async (): Promise<void> => {
    await spaNavigate('/about');
    await spaNavigate('/projects');
    await spaNavigate('/');
    // Give the home engine a beat to kick off (its mount/unmount is the leak
    // surface under test); the next cycle's nav then exercises full teardown.
    await page.waitForTimeout(2000);
  };

  // Baseline AFTER the first cycle so one-time module evaluation (three.js,
  // engine chunks, route modules) is excluded from the growth measurement.
  await cycle();
  const baseline = await measureHeap();

  for (let i = 0; i < 9; i += 1) await cycle();
  const finalHeap = await measureHeap();

  const growth = finalHeap - baseline;
  const limit = Math.max(15 * 1024 * 1024, baseline * 0.1);
  expect(
    growth,
    `heap grew ${(growth / 1048576).toFixed(1)}MB over 9 cycles (baseline ${(baseline / 1048576).toFixed(1)}MB)`,
  ).toBeLessThan(limit);
});

// ---------------------------------------------------------------------------
// Context loss — the hero survives a lost GL context without crashing.
// ---------------------------------------------------------------------------

test('home hero handles webglcontextlost gracefully', async ({ page }) => {
  test.slow();
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await installCensus(page);
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 20_000 });

  // Find the HERO renderer's own context (canvas inside .bh-stage) and lose it.
  const lost = await page.evaluate(() => {
    const entries =
      (window as unknown as {
        __glContexts?: { canvas: HTMLCanvasElement; ctx: unknown }[];
      }).__glContexts ?? [];
    const hero = entries.find((e) => e.canvas.isConnected && e.canvas.closest('.bh-stage'));
    if (!hero) return false;
    const gl = hero.ctx as WebGLRenderingContext;
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext();
    return true;
  });
  // Reduced-motion/no-GL environments mount no hero context — nothing to lose.
  test.skip(!lost, 'no live hero WebGL context in this environment');

  // The scene's contextlost handler pauses the loop and HeroIsland reveals the
  // on-brand fallback (body.webgl-unavailable) — the page stays usable.
  await expect(page.locator('body')).toHaveClass(/webgl-unavailable/, { timeout: 10_000 });
  await expect(page.locator('body')).toHaveClass(/loader-gone/, { timeout: 10_000 });

  // Still a functional page: the manifesto/nav DOM is present and no crash fired.
  await expect(page.locator('h1')).toHaveCount(1);
  const benign = /GPU stall|SwiftShader|WebGL.*deprecated|Automatic fallback|Context Lost/i;
  expect(pageErrors.filter((e) => !benign.test(e)), 'page errors after context loss').toEqual([]);
});
