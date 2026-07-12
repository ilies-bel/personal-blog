import { test, expect } from './test-base';
import { ALL_ROUTES } from './routes';

// Image delivery contract (P5): every <img> the site renders — server HTML and
// hydrated islands alike — declares intrinsic width+height (CLS guard: the
// static sweep in scripts/check-asset-sizes.mjs owns dist HTML, this owns the
// live DOM after hydration), actually decodes to real pixels (naturalWidth > 0
// catches a srcset/URL typo that still parses), and no image request 404s.

const IMAGE_PATH = /\.(png|jpe?g|webp|avif|gif|svg|ico)$/i;

for (const route of ALL_ROUTES) {
  test(`images ${route}`, async ({ page, browserName }) => {
    const missing404: string[] = [];
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (response.status() === 404 && IMAGE_PATH.test(path)) missing404.push(path);
    });

    await page.goto(route, { waitUntil: 'load' });
    // Let client:only islands hydrate and mount their own <img> trees before
    // sweeping (same settle budget the smoke spec uses).
    await page.waitForTimeout(1500);

    // On webkit/Linux CI, external HTTPS images (CNRS, NASA) fail to load due
    // to TLS certificate chain differences — the naturalWidth is 0 even though
    // the src URL and attributes are correct. Skip the naturalWidth check for
    // cross-origin images in that environment to avoid false positives.
    const skipExternalNaturalWidth = browserName === 'webkit';

    const offenders = await page.evaluate(async (skipExternal) => {
      const imgs = Array.from(document.querySelectorAll('img'));
      // Force lazy images to fetch without scroll choreography, then wait for
      // every decode to settle (a failed decode just falls through to the
      // naturalWidth check below).
      await Promise.all(
        imgs.map(async (img) => {
          img.loading = 'eager';
          try {
            await img.decode();
          } catch {
            /* judged by naturalWidth below */
          }
        }),
      );
      const problems: string[] = [];
      for (const img of imgs) {
        const tag = img.outerHTML.slice(0, 160);
        if (!img.getAttribute('width') || !img.getAttribute('height')) {
          problems.push(`missing width/height attributes: ${tag}`);
        }
        const isExternal =
          img.src.length > 0 && !img.src.startsWith(window.location.origin + '/') &&
          !img.src.startsWith('data:') && !img.src.startsWith('blob:');
        if (!(img.naturalWidth > 0) && !(skipExternal && isExternal)) {
          problems.push(`no intrinsic pixels (broken source?): ${tag}`);
        }
      }
      return problems;
    }, skipExternalNaturalWidth);

    expect(offenders, `image contract violations on ${route}`).toEqual([]);
    expect(missing404, `image 404s on ${route}`).toEqual([]);
  });
}
