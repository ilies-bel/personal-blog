import { test, expect, type Locator } from '@playwright/test';

// FORCED COLORS (P8) — Windows High Contrast / forced-colors: active.
//
// The site's control boundaries lean on glows, box-shadows and backdrop tints,
// all of which forced-colors strips; src/styles/a11y.css answers with real
// borders on the key controls and an opaque Canvas backing under the text that
// floats over the WebGL canvas (which forced-colors does NOT repaint). These
// tests emulate the mode and assert both halves hold.

test.use({ contextOptions: { forcedColors: 'active' } });

async function expectRealBorder(control: Locator, label: string): Promise<void> {
  const border = await control.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.borderTopStyle, width: s.borderTopWidth };
  });
  expect(border.style, `${label} border-style`).not.toBe('none');
  expect(parseFloat(border.width), `${label} border-width`).toBeGreaterThan(0);
}

/** Computed color must be a real, opaque color (not transparent). */
async function expectVisibleText(control: Locator, label: string): Promise<void> {
  const color = await control.evaluate((el) => getComputedStyle(el).color);
  expect(color, `${label} text color`).not.toBe('rgba(0, 0, 0, 0)');
}

test('home: key controls keep visible boundaries and floating text gets Canvas backing', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 20_000 });

  // Corner controls: the HUD power ring must read as a bordered button.
  await expectRealBorder(page.locator('.overlay-blog-power').first(), 'HUD power button');
  // The HUD scene rail buttons.
  await expectRealBorder(page.locator('.hud-nav-button').first(), 'HUD rail button');

  // Manifesto text floats over the live canvas: it must carry an opaque Canvas
  // backing so CanvasText can never land on an arbitrary rendered frame.
  const beatLine = page.locator('.bh-beat-line').first();
  const backing = await beatLine.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(backing, 'manifesto line must have an opaque backing').not.toBe('rgba(0, 0, 0, 0)');
  await expectVisibleText(beatLine, 'manifesto line');
  await expectVisibleText(page.locator('.bh-identity-name').first(), 'identity name');
});

test('home: the intro loader Skip control is bordered in forced colors', async ({ page }) => {
  await page.route(/three-core|three-post|createScene/i, async (route) => {
    await new Promise((r) => setTimeout(r, 8_000));
    await route.continue().catch(() => {});
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const skip = page.locator('.scene-loader-skip');
  await expect(skip).toBeVisible();
  await expectRealBorder(skip, 'Skip intro');
  await expectVisibleText(skip, 'Skip intro');
});

test('contact: reading-page controls hold their boundaries and text', async ({ page }) => {
  await page.goto('/contact', { waitUntil: 'load' });

  // The transmission CTA (a bordered card even outside forced colors — the
  // border must survive, not be swallowed with the tinted background).
  await expectRealBorder(page.locator('.contact-cta'), 'contact CTA');
  // The scene toggle circle in the reading rail.
  await expectRealBorder(page.locator('.scene-toggle'), 'scene toggle');
  // Nav + footer link text renders in real theme colors.
  await expectVisibleText(page.locator('.subnav-link').first(), 'subnav link');
  await expectVisibleText(page.locator('.site-footer-links a').first(), 'footer link');
  // Page heading is visible text.
  await expectVisibleText(page.locator('h1'), 'contact h1');
});

test('writing: list rows read as bounded rows', async ({ page }) => {
  await page.goto('/writing', { waitUntil: 'load' });
  await expectRealBorder(page.locator('.writing-row').first(), 'writing row');
});
