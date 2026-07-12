import { test, expect, type Page } from './test-base';

// FIRST-VIEWPORT ACCESS + MOBILE LIFECYCLE BUDGET (P7).
//
// The contract on a 390×844 phone:
//   • labelled primary navigation (Work/Writing/About/Contact) is visible and
//     CLICKABLE inside the first viewport from the moment the document paints —
//     including while the intro loader still covers the scene (the corner nav
//     rides ABOVE the loader, z-70 > z-60);
//   • the visible "Skip intro" control is keyboard-reachable from load and
//     releases the page (scene-ready + loader-gone) on Enter;
//   • the whole lifecycle costs ≤ 9 viewports of scrolling (140svh/stage),
//     while desktop keeps its long-format pacing (>15 viewports);
//   • the compressed track still plays the full manifesto arc (≥5 distinct
//     beats across a scripted scroll).
//
// Viewports are set explicitly so the assertions mean the same thing on the
// desktop and mobile-device projects.

const PHONE = { width: 390, height: 844 };

const NAV_LABELS = ['Work', 'Writing', 'About', 'Contact'] as const;

async function navLink(page: Page, label: string) {
  return page.locator('.overlay-blog-links a', { hasText: label });
}

test.describe('phone viewport (390×844)', () => {
  test.use({ viewport: PHONE });

  test('labelled nav is visible in the first viewport during the loader and navigates', async ({
    page,
  }) => {
    // Hold the engine chunks back a few seconds so "while the loader shows" is
    // a deterministic window on any machine — scene:ready can't fire until the
    // engine lands, and the skip/backstop paths are far longer than this test.
    await page.route(/three-core|three-post|createScene/i, async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      // The page may have navigated away / closed while the chunk was held.
      await route.continue().catch(() => {});
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // The loader cover is up (server-rendered; scene-ready can't have landed —
    // the engine is still held at the network edge).
    await expect(page.locator('.scene-loader')).toBeVisible();

    // Every primary destination is labelled, visible, and inside the viewport.
    for (const label of NAV_LABELS) {
      const link = await navLink(page, label);
      await expect(link, `${label} visible during loader`).toBeVisible();
      const box = await link.boundingBox();
      expect(box, `${label} renders`).toBeTruthy();
      expect(box!.y + box!.height, `${label} inside first viewport`).toBeLessThan(PHONE.height);
    }

    // And it WORKS while the loader still covers the scene: click Work → /projects.
    const loaderUp = await page.locator('.scene-loader').isVisible();
    expect(loaderUp, 'loader still up when clicking').toBe(true);
    await (await navLink(page, 'Work')).click();
    await page.waitForURL(/\/projects\/?$/);
    await expect(page.locator('h1')).toContainText(/work that held/i);
  });

  test('skip intro is keyboard-reachable from load and releases the page', async ({ page }) => {
    // Same deterministic hold as above: the skip button must do its work
    // BEFORE the scene is ready, which is exactly what it exists for.
    await page.route(/three-core|three-post|createScene/i, async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      // The page may have navigated away / closed while the chunk was held.
      await route.continue().catch(() => {});
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const skip = page.locator('.scene-loader-skip');
    await expect(skip).toBeVisible();

    // Tab from the top of the document: the skip control must be one of the
    // first stops (skip-link → nav links/socials/power → skip intro ≈ 10).
    let reached = false;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      if (await skip.evaluate((el) => el === document.activeElement)) {
        reached = true;
        break;
      }
    }
    expect(reached, 'Skip intro reachable within the first ~12 tab stops').toBe(true);

    // ≥44px target.
    const box = await skip.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveClass(/scene-ready/);
    await expect(page.locator('body')).toHaveClass(/loader-gone/);
    // The scene is revealed: the skip control retires and the cover no longer
    // catches pointer events.
    await expect(skip).toBeHidden();
    const pointerEvents = await page
      .locator('.scene-loader')
      .evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(pointerEvents).toBe('none');
  });

  test('mobile lifecycle fits the ≤9-viewport budget', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 15_000 });
    const { scrollHeight, innerHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(scrollHeight / innerHeight, 'total scroll ≤ 9 viewports').toBeLessThanOrEqual(9);
    // Still a real cinematic pull, not a collapsed page.
    expect(scrollHeight / innerHeight).toBeGreaterThan(6);
  });

  test('the compressed track still plays the full manifesto arc', async ({ page }) => {
    // Long test under parallel CI contention (the presentation clock eases
    // toward each scroll target on wall-clock time, which stretches when
    // workers share a software-rendered CPU).
    test.slow();
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 15_000 });

    // Scripted scroll top→bottom; at each step record which beat is showing.
    // The manifesto is scroll-driven DOM (independent of the GL canvas), so
    // this holds on CI software rendering too. ≥5 distinct beats proves the
    // six stage transitions survived the 140svh compression.
    //
    // A fixed settle-time races the eased clock and goes flaky under load, so
    // each step samples until the visible beat is STABLE (two consecutive
    // identical reads) or a per-step deadline passes. EVERY non-empty sample
    // counts as a seen beat (not just the settled one): the assertion is that
    // each beat BECOMES visible across the pass, and under worker contention
    // the eased clock can still be mid-glide when the per-step deadline hits —
    // dropping those sightings made the run under-count and flake (observed
    // failing on a fully-loaded software-rendered box, passing in isolation).
    const seen = new Set<string>();
    const steps = 36;
    const max = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    const sample = () =>
      page.evaluate(() => {
        const beats = Array.from(document.querySelectorAll<HTMLElement>('.bh-beat'));
        const on = beats.find((b) => Number(getComputedStyle(b).opacity) > 0.5);
        return on?.querySelector('.bh-beat-big')?.textContent?.trim() ?? '';
      });
    for (let i = 0; i <= steps; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round((max * i) / steps));
      let prev = '';
      for (let tries = 0; tries < 10; tries++) {
        await page.waitForTimeout(150);
        const cur = await sample();
        if (cur) seen.add(cur);
        if (cur && cur === prev) break;
        prev = cur;
      }
    }
    expect(seen.size, `distinct manifesto beats seen: ${[...seen].join(' | ')}`).toBeGreaterThanOrEqual(5);
  });
});

test.describe('desktop pacing is untouched', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('desktop keeps the long-format track (>15 viewports)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 15_000 });
    const { scrollHeight, innerHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(scrollHeight / innerHeight).toBeGreaterThan(15);
  });
});
