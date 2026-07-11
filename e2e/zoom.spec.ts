import { test, expect, type Page } from '@playwright/test';
import { CONTENT_ROUTES } from './routes';

// ZOOM + TEXT-SPACING RESILIENCE (P8).
//
// WCAG 1.4.10 (reflow): content must reflow without two-dimensional scrolling
// at 400% zoom of a 1280×1024 desktop — equivalently a 320 CSS-px viewport.
// CSS-pixel halving/quartering approximates browser zoom exactly for layout
// purposes (zoom rescales the CSS pixel), so:
//   • 640×360  ≈ 200% zoom of 1280×720,
//   • 320×256  ≈ 400% zoom of 1280×1024.
// At both sizes every content route must produce NO horizontal document
// overflow (inner scroll regions like the budget table own their own x-axis),
// and the nav must stay usable.
//
// WCAG 1.4.12 (text spacing): injecting the standard spacing overrides
// (line-height 1.5, letter-spacing 0.12em, word-spacing 0.16em, paragraph
// spacing 2em) must not clip text or break the layout on the reading pages.

const overflow = (page: Page) =>
  page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });

test.describe('200% zoom equivalent (640×360)', () => {
  test.use({ viewport: { width: 640, height: 360 } });

  for (const route of CONTENT_ROUTES) {
    test(`no horizontal overflow + usable nav on ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      const { scrollWidth, clientWidth } = await overflow(page);
      expect(scrollWidth, `document must not overflow horizontally on ${route}`).toBeLessThanOrEqual(clientWidth + 1);
      // The nav is present, visible and clickable at this zoom.
      const nav = page.locator('.subnav-link, .overlay-blog-link').first();
      await expect(nav).toBeVisible();
      const box = await nav.boundingBox();
      expect(box, 'nav link renders inside the zoomed viewport').toBeTruthy();
      expect(box!.x).toBeGreaterThanOrEqual(0);
    });
  }
});

test.describe('400% zoom equivalent (320×256)', () => {
  test.use({ viewport: { width: 320, height: 256 } });

  for (const route of CONTENT_ROUTES) {
    test(`still readable, no overflow on ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      const { scrollWidth, clientWidth } = await overflow(page);
      expect(scrollWidth, `document must not overflow horizontally on ${route}`).toBeLessThanOrEqual(clientWidth + 1);
      // The page's h1 is present and visible — the content survived reflow.
      await expect(page.locator('h1').first()).toBeVisible();
    });
  }
});

// The standard WCAG 1.4.12 test override.
const TEXT_SPACING_CSS = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p { margin-bottom: 2em !important; }
`;

test.describe('WCAG text-spacing override', () => {
  const SPACING_ROUTES = [
    '/posts/memory-leak-search-and-destroy',
    '/posts/thanks-for-scrolling-to-the-bottom',
    '/contact',
  ] as const;

  for (const route of SPACING_ROUTES) {
    test(`no clipped text on ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'load' });
      await page.addStyleTag({ content: TEXT_SPACING_CSS });
      await page.waitForTimeout(400);

      // No horizontal document overflow from the wider tracking.
      const { scrollWidth, clientWidth } = await overflow(page);
      expect(scrollWidth, 'document overflow under text-spacing').toBeLessThanOrEqual(clientWidth + 1);

      // Key elements stay visible.
      await expect(page.locator('h1').first()).toBeVisible();
      await expect(page.locator('main p').first()).toBeVisible();

      // No text CLIPPING: hunt for text-bearing elements whose overflow is
      // hidden and whose content now exceeds the box (the classic 1.4.12
      // failure). Inner scroll containers (overflow auto/scroll) are fine —
      // scrolling is not clipping.
      const clipped = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('main *'))) {
          if (!el.textContent?.trim()) continue;
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility !== 'visible') continue;
          // The .sr-only pattern (clip/clip-path + 1px box) clips by DESIGN —
          // it's how visually-hidden-but-readable text works, not a defect.
          if (s.clipPath !== 'none' || (s.clip && s.clip !== 'auto')) continue;
          const clipsX = s.overflowX === 'hidden' || s.overflowX === 'clip';
          const clipsY = s.overflowY === 'hidden' || s.overflowY === 'clip';
          // text-overflow: ellipsis is a deliberate truncation affordance the
          // design uses for single-line instrument readouts — those announce
          // their full text via title/aria — still flag none of them here only
          // if they actually clip more than a couple of pixels vertically.
          if (clipsX && el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== 'ellipsis') {
            out.push(`x-clip <${el.tagName.toLowerCase()} class=${String(el.className).split(/\s+/)[0]}>`);
          }
          if (clipsY && el.scrollHeight > el.clientHeight + 2) {
            out.push(`y-clip <${el.tagName.toLowerCase()} class=${String(el.className).split(/\s+/)[0]}>`);
          }
        }
        return out;
      });
      expect(clipped, `clipped text under text-spacing on ${route}`).toEqual([]);
    });
  }
});
