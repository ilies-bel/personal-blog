import { test, expect } from '@playwright/test';

// Derived-count contract (P6): every count shown on the site comes from the
// content collections through getCounts() (src/lib/contentStats.ts) — never a
// hand-written literal. These tests read the counts the same way a visitor
// verifies them (by counting the entries the pages actually render) and assert
// the finale ledger notes on '/' agree, so a new project/specimen that ships
// without the ledger updating fails CI.
//
// The ledger rows are SERVER-RENDERED inside the BlackHole island's static HTML
// (ManifestoOverlay renders on the server for client:visible), so we assert on
// document content directly — no scrolling to the finale beat, no hydration
// wait, no flake. The rows are visibility-gated (data-visible) until the finale
// band, hence textContent assertions rather than toBeVisible().

test('finale ledger counts match the rendered collections', async ({ page }) => {
  // Count what /projects and /graveyard ACTUALLY render — the same collections
  // getCounts() aggregates (2/2 today; the assertion tracks the content, not
  // the literals).
  await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  const shipped = await page.locator('article.projects-entry').count();
  expect(shipped).toBeGreaterThan(0);

  await page.goto('/graveyard', { waitUntil: 'domcontentloaded' });
  const dead = await page.locator('article.graveyard-entry').count();
  expect(dead).toBeGreaterThan(0);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const ledgerRow = (label: string) =>
    page
      .locator('.bh-finale-ledger-row', { has: page.locator('.bh-finale-ledger-label', { hasText: label }) })
      .locator('.bh-finale-ledger-note');

  await expect(ledgerRow('PROJECTS')).toHaveText(`${shipped} shipped`);
  // Mirrors graveyardNote() in src/lib/contentFormat.ts (unit-pinned in
  // test/content-stats.test.mjs): "both honest" only when exactly two.
  const expectedGraveyardNote =
    dead === 2 ? '2 dead, both honest' : dead === 1 ? '1 dead, honest' : `${dead} dead, all honest`;
  await expect(ledgerRow('GRAVEYARD')).toHaveText(expectedGraveyardNote);
});

test('projects and graveyard render every collection entry with its record', async ({ page }) => {
  await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  // Both migrated entries, by their stable collection ids.
  await expect(page.locator('article#fleet .projects-entry-name')).toContainText('Fleet');
  await expect(page.locator('article#mars .projects-entry-name')).toContainText('Mars');
  // The evidence-schema'd copy actually rendered from the MDX bodies.
  await expect(page.locator('article#fleet .projects-copy .projects-proud')).toContainText(
    'What I am proud of',
  );
  await expect(page.locator('article#mars .projects-topology')).toHaveCount(1);

  await page.goto('/graveyard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('article#keywordlens .graveyard-entry-name')).toContainText('KeywordLens');
  await expect(page.locator('article#heydaniel .graveyard-entry-name')).toContainText('HeyDaniel');
  // Frontmatter record + MDX body both present per specimen.
  const lessons = page.locator('.graveyard-lesson');
  await expect(lessons).toHaveCount(await page.locator('article.graveyard-entry').count());
});

test('co-authored post carries byline, provenance, and JSON-LD authors', async ({ page }) => {
  await page.goto('/posts/memory-leak-search-and-destroy/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.article-byline')).toHaveText(/Co-written with Lansana Diomande/);
  await expect(page.locator('.article-provenance a')).toHaveAttribute(
    'href',
    /medium\.com\/takima/,
  );
  // The BlogPosting author array formalizes both names.
  const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
  const graph = JSON.parse(jsonLd ?? '{}')['@graph'] as Array<Record<string, unknown>>;
  const posting = graph.find((node) => node['@type'] === 'BlogPosting');
  expect(posting).toBeTruthy();
  const authors = posting?.author as Array<Record<string, string>>;
  expect(authors).toHaveLength(2);
  expect(JSON.stringify(authors)).toContain('Lansana Diomande');

  // A solo post shows no byline and no provenance row.
  await page.goto('/posts/thanks-for-scrolling-to-the-bottom/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.article-byline')).toHaveCount(0);
  await expect(page.locator('.article-provenance')).toHaveCount(0);
});
