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
      // DIAGNOSTIC (diag/runner-reflow): the overflow reproduces ONLY on the
      // GitHub runner (not locally on macOS, not in the playwright jammy
      // image against the same build), so the failure message must name the
      // offending elements — collect every non-fixed element whose border box
      // crosses the viewport edge, widest overhang first.
      const { scrollWidth, clientWidth, offenders } = await page.evaluate(() => {
        const found: Array<{ desc: string; right: number }> = [];
        for (const el of Array.from(document.querySelectorAll('*'))) {
          const r = el.getBoundingClientRect();
          if (r.right <= document.documentElement.clientWidth + 0.5 || r.width === 0) continue;
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed') continue;
          const cls = typeof el.className === 'string' && el.className ? `.${el.className.split(' ')[0]}` : '';
          found.push({
            desc: `${el.tagName.toLowerCase()}${cls} right=${r.right.toFixed(1)} w=${r.width.toFixed(1)} ws=${cs.whiteSpace} font=${cs.fontFamily.split(',')[0]}`,
            right: r.right,
          });
        }
        found.sort((a, b) => b.right - a.right);
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          offenders: found.slice(0, 10).map((f) => f.desc),
        };
      });
      expect
        .soft(scrollWidth, `${route} document width at ${width}px\n${offenders.join('\n')}`)
        .toBeLessThanOrEqual(clientWidth + 1);
    }
  });
}
