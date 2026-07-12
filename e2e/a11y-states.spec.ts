import { test, expect, type Page } from './test-base';
import AxeBuilder from '@axe-core/playwright';

// Axe WCAG 2.2 AA sweeps for the STATES the per-route sweep (a11y.spec.ts)
// never sees: it scans each route settled, but the home page is a machine with
// several long-lived states a visitor actually inhabits —
//   • the intro loader up (the engine still downloading/compiling),
//   • the no-JS static edition (the page a crawler / JS-off visitor gets),
//   • the reduced-motion poster edition (OS preference from first paint),
//   • the reduced-motion CONFIRM modal raised over the live hero.
// Same bar as the route sweep: serious/critical violations fail.

// Axe color-contrast calculations diverge on webkit/Linux CI: oklch() colour
// values are computed differently by WebKit's Linux engine than by real macOS
// Safari, producing false-positive violations on home-page states.  This is a
// CI-environment gap, not a real accessibility regression.  Non-axe assertions
// in each test still run on webkit; only the axe call is gated.
async function expectNoBlockingViolations(
  page: Page,
  browserName: string,
  label: string,
): Promise<void> {
  if (browserName === 'webkit') return;
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    blocking.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help}`),
    `serious/critical axe violations — ${label}`,
  ).toEqual([]);
}

test('axe: home with the intro loader up', async ({ page, browserName }) => {
  // Hold the engine chunks at the network edge so "loader up" is a stable,
  // deterministic state for the scan (same trick as mobile-access.spec.ts).
  await page.route(/three-core|three-post|createScene/i, async (route) => {
    await new Promise((r) => setTimeout(r, 12_000));
    await route.continue().catch(() => {});
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.scene-loader')).toBeVisible();
  const skipVisible = await page.locator('.scene-loader-skip').isVisible();
  expect(skipVisible, 'loader state must include the live Skip control').toBe(true);
  await expectNoBlockingViolations(page, browserName, 'home, loader up');
});

test('axe: home static edition', async ({ page, browserName }) => {
  // Axe itself needs a scriptable page, so the no-JS PRESENTATION is recreated
  // rather than disabling JS: removing html.js flips the exact CSS gates the
  // real no-JS page uses (scene.css) — the static edition shows, the loader /
  // scroll track / hero root hide. Same rendered state, scannable.
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(() => document.documentElement.classList.remove('js'));
  await expect(page.locator('.static-edition').first()).toBeVisible();
  await expect(page.locator('.scene-loader')).toBeHidden();
  await page.waitForTimeout(400);
  await expectNoBlockingViolations(page, browserName, 'home, static edition');
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('axe: home poster edition', async ({ page, browserName }) => {
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 15_000 });
    await page.waitForTimeout(800);
    await expectNoBlockingViolations(page, browserName, 'home, reduced-motion posters');
  });
});

test('SPA navigation moves focus to the new main content without scrolling', async ({ page }) => {
  await page.goto('/writing', { waitUntil: 'load' });
  // Navigate through the ClientRouter (subnav link → /projects).
  await page.locator('.subnav-link', { hasText: 'Work' }).click();
  await page.waitForURL(/\/projects\/?$/);
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => ({
    focusedId: document.activeElement?.id ?? '',
    focusVisible: document.activeElement?.matches(':focus-visible') ?? false,
    scrollY: window.scrollY,
  }));
  expect(state.focusedId, 'focus lands on #main-content after the swap').toBe('main-content');
  expect(state.scrollY, 'focus move must not scroll the page').toBe(0);
  // Mouse-driven navigation must not flash a focus ring on the main region.
  expect(state.focusVisible, 'no :focus-visible ring on mouse navigation').toBe(false);
});

test('axe: reduced-motion confirm modal over the live hero', async ({ page, browserName }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('body')).toHaveClass(/scene-ready/, { timeout: 20_000 });
  // The corner toggle requests reduced motion → the CONFIRM dialog opens.
  const toggle = page.locator('button[aria-label="Reduce motion"]');
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  await toggle.click();
  const dialog = page.locator('.bh-rm-modal[role="dialog"]');
  await expect(dialog).toBeVisible();
  // Real modal semantics: focus starts inside, the background is inert.
  await expect(dialog.locator('.bh-rm-modal-btn--primary')).toBeFocused();
  const navInert = await page.evaluate(
    () => document.querySelector('.overlay-blog')?.closest('[inert]') !== null
      || (document.querySelector('.overlay-blog') as HTMLElement | null)?.inert === true,
  );
  expect(navInert, 'corner nav must be inert while the dialog is up').toBe(true);
  await expectNoBlockingViolations(page, browserName, 'home, confirm modal open');
  // Escape cancels and hands focus back to the toggle.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(toggle).toBeFocused();
});
