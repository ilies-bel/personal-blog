import { test, expect } from './test-base';

// The no-JS contract: with JavaScript disabled the homepage must be the
// static edition — identity, labelled primary navigation in the first
// viewport, the full manifesto, and a compact page. The intro loader and the
// hero shell (whose .bh-stage is an opaque fixed cover) must not paint.

test.use({ javaScriptEnabled: false });

test('no-JS homepage shows the static edition, not the loader', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });

  await expect(page.locator('.static-edition')).toBeVisible();
  await expect(page.locator('.scene-loader')).toBeHidden();
  await expect(page.locator('.bh-root')).toBeHidden();
  await expect(page.locator('.scene-track')).toBeHidden();

  // Identity + all four primary destinations, labelled, inside the document.
  await expect(page.locator('.scene-fallback-name')).toBeVisible();
  const nav = page.locator('.static-edition-nav a');
  await expect(nav).toHaveText(['Work', 'Writing', 'About', 'Contact']);

  // The nav must land in the FIRST viewport — reachable without scrolling.
  const viewport = page.viewportSize();
  const navBox = await page.locator('.static-edition-nav').boundingBox();
  expect(navBox, 'nav renders').toBeTruthy();
  expect(navBox!.y + navBox!.height).toBeLessThan(viewport!.height);

  // The 1800svh scroll track must be gone: the page is prose-length now.
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(scrollHeight).toBeLessThan(viewport!.height * 4);

  // Manifesto beats are real headings under the single h1.
  await expect(page.locator('h1')).toHaveCount(1);
  expect(await page.locator('.static-edition h2').count()).toBeGreaterThanOrEqual(4);
});

test('no-JS content routes still render their content', async ({ page }) => {
  for (const route of ['/projects', '/writing', '/graveyard', '/about', '/contact']) {
    await page.goto(route, { waitUntil: 'load' });
    await expect(page.locator('h1'), `${route} has a visible h1`).toBeVisible();
    // Body copy must not be gated behind JS-driven reveals.
    const textLength = await page.evaluate(() => document.body.innerText.length);
    expect(textLength, `${route} has real text`).toBeGreaterThan(200);
  }
});
