import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL_ROUTES } from './routes';

// Automated accessibility sweep: axe-core against every public route in its
// hydrated state. Serious/critical violations fail the build; the full result
// list is attached for review either way. (Manual screen-reader and
// keyboard passes complement this — axe can only see what's computable.)

for (const route of ALL_ROUTES) {
  test(`axe ${route}`, async ({ page }, testInfo) => {
    await page.goto(route, { waitUntil: 'load' });
    // Let islands hydrate and the loader lift so we scan the settled page.
    if (route === '/') {
      await page.locator('body.scene-ready').waitFor({ timeout: 15_000 }).catch(() => {});
    }
    await page.waitForTimeout(800);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    await testInfo.attach(`axe-${route.replace(/\W+/g, '_')}`, {
      body: JSON.stringify(results.violations, null, 2),
      contentType: 'application/json',
    });

    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(
      blocking.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help}`),
      `serious/critical axe violations on ${route}`,
    ).toEqual([]);
  });
}
