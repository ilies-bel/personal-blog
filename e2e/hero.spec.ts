import { test, expect } from '@playwright/test';

// E2E coverage for the one twist: the personalized hero.
// Runs against the built+previewed static site (see playwright.config.ts).

test.describe('personalized hero', () => {
  test('shows a personalized line after hydration', async ({ page }) => {
    await page.goto('./');
    const hero = page.locator('.hero-line');
    await expect(hero).toBeVisible();
    await expect(hero).toHaveClass(/is-personalized/, { timeout: 10_000 });
    await expect(hero).not.toHaveText('Welcome. Glad you’re here.');
    await expect(page.locator('.hero-eyebrow')).toHaveText(/hey, you/i);
  });

  test('greeting reflects the time of day', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-05-30T20:30:00') });
    await page.goto('./');
    const hero = page.locator('.hero-line');
    await expect(hero).toHaveClass(/is-personalized/, { timeout: 10_000 });
    await expect(hero).toContainText(/evening/i);
  });

  test('recognizes a returning visitor across reloads', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.hero-line')).toHaveClass(/is-personalized/, { timeout: 10_000 });
    const first = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('visits.v1') || '{}').count,
    );
    expect(first).toBe(1);

    await page.reload();
    await expect(page.locator('.hero-line')).toHaveClass(/is-personalized/, { timeout: 10_000 });
    const second = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('visits.v1') || '{}').count,
    );
    expect(second).toBe(2);
  });
});

test.describe('SEO / no-JS resilience', () => {
  test('raw HTML has the crawler-safe fallback hero and real prose', async ({ request }) => {
    const res = await request.get('./');
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toContain('Welcome. Glad you');
    expect(html).toMatch(/Why I Build Content Sites With Astro Islands/);
  });

  test('a blog post is fully readable without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('posts/why-astro-islands/');
    await expect(page.locator('article.prose')).toContainText('hydrate only what moves');
    await expect(page.locator('h1')).toContainText('Astro Islands');
    await context.close();
  });
});
