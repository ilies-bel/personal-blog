import { test, expect } from '@playwright/test';
import { CONTENT_ROUTES, MOBILE_WIDTHS } from './routes';

// Reflow regression: at every mobile width in the matrix, no route may
// produce horizontal document overflow. body{overflow-x:hidden} CLIPS
// overflow rather than scrolling it, so overflow here means invisible,
// unreachable content — the memory-leak article's 51-char identifier bug.

for (const width of MOBILE_WIDTHS) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const route of CONTENT_ROUTES) {
      await page.goto(route, { waitUntil: 'load' });
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect
        .soft(scrollWidth, `${route} document width at ${width}px`)
        .toBeLessThanOrEqual(clientWidth + 1);
    }
  });
}
