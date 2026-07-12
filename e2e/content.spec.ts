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

// Finale proof-card contract: the three featured cards above the ledger must
// exist in the DOM (server-rendered inside the island's static HTML, just like
// the ledger rows) with correct destinations and collection-derived kickers.
// We assert on href and kicker text — the actual title/summary come from the
// collection and are tested implicitly (build fails if the fields are absent).
test('finale proof cards exist with collection-derived kickers and correct hrefs', async ({ page }) => {
  // Re-use the counts from the collections already counted above — ship/dead
  // are the same values the kickers must show.
  await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  const shipped = await page.locator('article.projects-entry').count();

  await page.goto('/graveyard', { waitUntil: 'domcontentloaded' });
  const dead = await page.locator('article.graveyard-entry').count();

  // The proof cards are server-rendered inside the BlackHole island's static
  // HTML (ManifestoOverlay renders on the server for client:visible), so
  // domcontentloaded is enough — no hydration wait, no flake. They are
  // visibility-gated (data-visible on .bh-finale-section), so we assert on
  // DOM content rather than toBeVisible().
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const cards = page.locator('.bh-finale-proof-card');
  await expect(cards).toHaveCount(3);

  // Card 1 — flagship project: kicker includes count and links to /projects.
  const flagship = cards.nth(0);
  await expect(flagship.locator('.bh-finale-proof-kicker')).toContainText(String(shipped));
  await expect(flagship).toHaveAttribute('href', /\/projects/);

  // Card 2 — investigation post: kicker says "Investigation" and links to a post.
  const investigation = cards.nth(1);
  await expect(investigation.locator('.bh-finale-proof-kicker')).toHaveText('Investigation');
  await expect(investigation).toHaveAttribute('href', /\/posts\//);

  // Card 3 — graveyard summary: kicker includes dead count and links to /graveyard.
  const graveyard = cards.nth(2);
  await expect(graveyard.locator('.bh-finale-proof-kicker')).toContainText(String(dead));
  await expect(graveyard).toHaveAttribute('href', /\/graveyard/);
});

test('projects and graveyard render every collection entry with its record', async ({ page }) => {
  await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  // Both migrated entries, by their stable collection ids.
  await expect(page.locator('article#fleet .projects-entry-name')).toContainText('Fleet');
  await expect(page.locator('article#mars .projects-entry-name')).toContainText('Mars');
  // The case-study copy actually rendered from the restructured MDX bodies
  // (P13): problem → decisive choice → outcome sections.
  await expect(page.locator('article#fleet .projects-copy h3').first()).toHaveText('The problem');
  await expect(page.locator('article#mars .projects-topology')).toHaveCount(1);

  await page.goto('/graveyard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('article#keywordlens .graveyard-entry-name')).toContainText('KeywordLens');
  await expect(page.locator('article#heydaniel .graveyard-entry-name')).toContainText('HeyDaniel');
  // Frontmatter record + MDX body both present per specimen.
  const lessons = page.locator('.graveyard-lesson');
  await expect(lessons).toHaveCount(await page.locator('article.graveyard-entry').count());
});

// P13 — the proof-first case-study contract: every claim renders WITH its
// backing adjacent. Today both projects carry exactly one draftEvidence claim
// each, so the honest debt marker appears exactly twice — retiring the debt
// (docs/INPUTS-NEEDED.md #2/#3/#5) intentionally breaks this pin, forcing the
// count down as real evidence lands.
test('claims render with evidence adjacency; draft debt is marked exactly twice', async ({ page }) => {
  await page.goto('/projects', { waitUntil: 'domcontentloaded' });

  // Each project renders its claims ledger under the "Proof" section head.
  await expect(page.locator('article#fleet .projects-proof .projects-claim')).toHaveCount(1);
  await expect(page.locator('article#mars .projects-proof .projects-claim')).toHaveCount(1);
  await expect(page.locator('article#fleet .projects-claim-statement')).toContainText(
    'engineers doing parallel QA',
  );

  // The draftEvidence marker: quiet, honest, and EXACTLY twice today. Every
  // claim shows either real evidence or this marker — never neither.
  const pending = page.locator('.projects-claim-pending');
  await expect(pending).toHaveCount(2);
  for (const marker of await pending.all()) {
    await expect(marker).toHaveText('evidence being gathered');
  }
  const claims = await page.locator('.projects-claim').count();
  const backed = await page.locator('.projects-claim-evidence').count();
  expect(backed + 2).toBe(claims);

  // Decisions & consequences: the honesty fields rendered from frontmatter.
  await expect(page.locator('article#fleet .projects-decisions')).toContainText('Paths not taken');
  await expect(page.locator('article#fleet .projects-decisions')).toContainText('Known limits');
  await expect(page.locator('article#mars .projects-decisions')).toContainText('Current status');
});

// P13 — graveyard specimens expose their full record: the hypothesis (the
// bet) before the story, warning signs / surviving insight after it.
test('graveyard specimens render their record rows', async ({ page }) => {
  await page.goto('/graveyard', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('article#keywordlens .graveyard-record dt', { hasText: 'Hypothesis' })).toHaveCount(1);
  await expect(page.locator('article#keywordlens .graveyard-record dt', { hasText: 'Warning signs' })).toHaveCount(1);
  await expect(page.locator('article#heydaniel .graveyard-record dt', { hasText: 'What survived' })).toHaveCount(1);
  // Records carry the authored content, not just labels. (Each specimen may
  // render TWO record blocks — the bet before the story, the autopsy after —
  // so anchor on the row content, not the block.)
  await expect(
    page.locator('article#heydaniel .graveyard-record dd', {
      hasText: 'the product died, the tool lives',
    }),
  ).toHaveCount(1);
});

// P13 — /writing rows expose the editorial record: type + reading commitment
// per article (both derived: frontmatter `type`, body wordcount).
test('writing rows expose type and reading time', async ({ page }) => {
  await page.goto('/writing', { waitUntil: 'domcontentloaded' });
  const row = page.locator('.writing-row', { hasText: 'Memory Leak' });
  await expect(row.locator('.writing-row-fact', { hasText: 'Investigation' })).toHaveCount(1);
  await expect(row.locator('.writing-row-fact', { hasText: 'min read' })).toHaveCount(1);
  // The topics readout renders the post's own tags.
  await expect(row.locator('.writing-row-topics')).toContainText('java');
});

// P13 — the About "now" block (role/base/availability/proof + the Contact
// line) must land within the first two phone viewports at 390×844.
test('about answers who/where/available within two phone viewports', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Entrance animations are translate/opacity-only, but measure the settled
  // frame anyway: reduced motion pins everything from the first paint.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/about', { waitUntil: 'domcontentloaded' });

  const now = page.locator('.about-now');
  await expect(now).toBeVisible();
  await expect(now.locator('a[href*="contact"]')).toHaveText('Start a conversation');
  await expect(now.locator('a[href*="projects"]')).toHaveText('see the work');

  // Document-space bottom edge (the page loads unscrolled, so the viewport
  // origin IS the document origin — no scroll compensation needed).
  const box = await now.boundingBox();
  expect(box, 'the now block must have a layout box').toBeTruthy();
  expect((box?.y ?? Infinity) + (box?.height ?? Infinity)).toBeLessThan(844 * 2);
});

// P13 — the memory-leak investigation renders its Evidence aside from
// frontmatter: the artifacts the article itself references.
test('investigation post renders its evidence aside', async ({ page }) => {
  await page.goto('/posts/memory-leak-search-and-destroy/', { waitUntil: 'domcontentloaded' });
  const aside = page.locator('.article-evidence');
  await expect(aside.locator('.article-evidence-title')).toHaveText('Evidence');
  await expect(aside.locator('a[href*="medium.com/takima"]')).toHaveCount(1);
  await expect(aside.locator('a[href*="getsentry/sentry-java"]')).toHaveCount(2);

  // The essay declares no evidence artifacts — no aside, no placeholder box.
  await page.goto('/posts/thanks-for-scrolling-to-the-bottom/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.article-evidence')).toHaveCount(0);
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
