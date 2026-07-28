import { test, expect } from './test-base';
import { ALL_ROUTES } from './routes';

// Route-level smoke: every public route serves 200, carries exactly one <h1>
// and one <main> landmark, and produces no page errors or console errors.
// This is the cheapest possible "the site is not broken" gate — everything
// deeper builds on top of it.

for (const route of ALL_ROUTES) {
  test(`smoke ${route}`, async ({ page, browserName }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    // Collect 404 URLs so assertion failures name the missing asset rather than
    // logging only the opaque "Failed to load resource" message Chrome emits.
    const urls404: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    page.on('response', (res) => {
      if (res.status() === 404) urls404.push(res.url());
    });

    const response = await page.goto(route, { waitUntil: 'load' });
    expect(response?.status()).toBe(200);

    // Exactly one top-level heading and one main landmark per document.
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main')).toHaveCount(1);

    // Let islands hydrate and the first frames settle before judging errors.
    await page.waitForTimeout(1500);

    // WebGL capability warnings on software renderers are expected in CI;
    // real errors are not. Filter the known-benign GPU chatter.
    // On webkit/Linux CI external HTTPS resources (CNRS, NASA imagery) fail
    // with TLS errors — "Failed to load resource" — because the CI runner's
    // certificate chain differs from real Safari's. These are infrastructure
    // artefacts, not site bugs; filter them only in webkit.
    const benign =
      browserName === 'webkit'
        ? /GPU stall|SwiftShader|WebGL.*deprecated|Automatic fallback|Failed to load resource/i
        : /GPU stall|SwiftShader|WebGL.*deprecated|Automatic fallback/i;
    expect(pageErrors, `page errors on ${route}`).toEqual([]);
    const filteredErrors = consoleErrors.filter((e) => !benign.test(e));
    const errorContext = urls404.length
      ? `console errors on ${route}\n  404 requests: ${urls404.join(', ')}`
      : `console errors on ${route}`;
    expect(filteredErrors, errorContext).toEqual([]);
  });
}

test('unknown route serves the branded 404 with a real 404 status', async ({ page, baseURL }) => {
  // astro preview mirrors GitHub Pages behavior: dist/404.html with HTTP 404.
  const response = await page.goto('/this-page-does-not-exist', { waitUntil: 'load' });
  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText(/collapsed/i);
  // Every primary destination is one link away from the error page.
  for (const label of ['Home', 'Work', 'Writing', 'About', 'Contact']) {
    await expect(page.locator('.notfound-links a', { hasText: label })).toBeVisible();
  }
  // Error pages must not claim a canonical URL or ask to be indexed.
  expect(await page.locator('link[rel="canonical"]').count()).toBe(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  void baseURL;
});
