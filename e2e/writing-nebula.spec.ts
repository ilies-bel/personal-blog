/**
 * Writing nebula map — EXP-027
 *
 * Asserts the knowledge-map view and list view are equivalent: every article
 * reachable via the cluster map is also reachable via the list, and vice versa.
 *
 * Physical law: "dispersed matter coalescing" (route-physical-laws.md §Writing).
 * Articles cluster by type (EXP-016 metadata); the list view is always the
 * first-class accessible equivalent (backlog rule: never force spatial navigation
 * for essential discovery).
 *
 * Acceptance criteria verified here:
 *   • Articles cluster by type in the map view with a visible heading per cluster
 *   • Every article reachable in the list is also reachable in the map view
 *   • Every article reachable in the map view is also reachable in the list view
 *   • Readable metadata (date, reading time, topics) is present on map cards
 *   • View toggle controls exist with correct ARIA state
 *   • Graveyard and About remain discoverable in both views
 */

import { test, expect } from '@playwright/test'

test.describe('writing nebula map — EXP-027', () => {
  // -------------------------------------------------------------------------
  // Core equivalence — every article must be reachable in both views
  // -------------------------------------------------------------------------

  test('every article in the list view is reachable in the map view (list equivalence)', async ({ page }) => {
    await page.goto('/writing')

    // Collect article hrefs from the list panel (default state).
    // List rows carry data-entry-type — the EXP-016 attribute for typed article links.
    const listHrefs = await page
      .locator('[data-panel="list"] a[data-entry-type]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))

    expect(listHrefs.length, 'Expected at least one article in the list view').toBeGreaterThan(0)

    // Switch to map view.
    const mapBtn = page.locator('button[data-view="map"]')
    await mapBtn.click()

    // Wait for map panel to become visible.
    await expect(page.locator('[data-panel="map"]')).not.toHaveAttribute('aria-hidden', 'true')

    // Collect article hrefs from the map panel.
    // Map cards are located by their class — they don't repeat data-entry-type
    // (that attribute belongs to the list; classification in the map is on the
    // cluster container via data-cluster-type).
    const mapHrefs = await page
      .locator('[data-panel="map"] a.nebula-card')
      .evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))

    expect(mapHrefs.length, 'Expected at least one article in the map view').toBeGreaterThan(0)

    // Every list article must appear in the map, and vice versa.
    const listSet = new Set(listHrefs)
    const mapSet = new Set(mapHrefs)

    for (const href of listSet) {
      expect(mapSet, `Article "${href}" is in the list but missing from the map`).toContain(href)
    }
    for (const href of mapSet) {
      expect(listSet, `Article "${href}" is in the map but missing from the list`).toContain(href)
    }
  })

  // -------------------------------------------------------------------------
  // Map view metadata — readable without HUD decoding (EXP-016)
  // -------------------------------------------------------------------------

  test('map view exposes readable metadata for each article card', async ({ page }) => {
    await page.goto('/writing')
    await page.locator('button[data-view="map"]').click()

    const memLeakCard = page.locator(
      '[data-panel="map"] a[href*="memory-leak-search-and-destroy"]'
    )
    await expect(memLeakCard).toBeVisible()

    // Title is visible.
    await expect(memLeakCard.locator('.nebula-card-title')).toBeVisible()

    // Machine-readable date.
    const timeEl = memLeakCard.locator('time')
    await expect(timeEl).toBeVisible()
    await expect(timeEl).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}/)

    // Reading commitment in plain language.
    const readEl = memLeakCard.locator('.nebula-card-read')
    await expect(readEl).toBeVisible()
    await expect(readEl).toContainText('min read')

    // Subject-matter topics.
    const topicsEl = memLeakCard.locator('.nebula-card-topics')
    await expect(topicsEl).toBeVisible()
    const topicsText = (await topicsEl.textContent()) ?? ''
    expect(topicsText.toLowerCase()).toMatch(/java|jvm|debug/)
  })

  // -------------------------------------------------------------------------
  // Toggle controls — ARIA state and operability
  // -------------------------------------------------------------------------

  test('view toggle buttons exist with correct initial ARIA state', async ({ page }) => {
    await page.goto('/writing')

    const listBtn = page.locator('button[data-view="list"]')
    const mapBtn = page.locator('button[data-view="map"]')

    await expect(listBtn).toBeVisible()
    await expect(mapBtn).toBeVisible()

    // List is the default view.
    await expect(listBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(mapBtn).toHaveAttribute('aria-pressed', 'false')
  })

  test('view toggle correctly switches between list and map panels', async ({ page }) => {
    await page.goto('/writing')

    const listBtn = page.locator('button[data-view="list"]')
    const mapBtn = page.locator('button[data-view="map"]')

    // Initial: list visible; map panel is absent from DOM until first toggle
    // (it is generated client-side from JSON on first click).
    await expect(page.locator('[data-panel="list"]')).not.toHaveAttribute('aria-hidden', 'true')
    await expect(page.locator('[data-panel="map"]')).toHaveCount(0)

    // Switch to map — panel is generated and inserted, aria-hidden is removed.
    await mapBtn.click()
    await expect(listBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(mapBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-panel="map"]')).not.toHaveAttribute('aria-hidden', 'true')

    // Switch back to list — list is active, map is aria-hidden.
    await listBtn.click()
    await expect(listBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(mapBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('[data-panel="list"]')).not.toHaveAttribute('aria-hidden', 'true')
    await expect(page.locator('[data-panel="map"]')).toHaveAttribute('aria-hidden', 'true')
  })

  // -------------------------------------------------------------------------
  // Cluster grouping — articles cluster by type in the map view
  // -------------------------------------------------------------------------

  test('articles cluster by editorial type in the map view', async ({ page }) => {
    await page.goto('/writing')
    await page.locator('button[data-view="map"]').click()

    // The investigation cluster is present.
    const cluster = page.locator('.nebula-cluster[data-cluster-type="investigation"]')
    await expect(cluster).toBeVisible()

    // It has a plain-language heading.
    await expect(cluster.locator('.nebula-cluster-label')).toContainText('Investigations')

    // The article card lives inside the correct cluster.
    const card = cluster.locator('a[href*="memory-leak-search-and-destroy"]')
    await expect(card).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Persistent destinations — graveyard and About always accessible
  // -------------------------------------------------------------------------

  test('Graveyard and About remain accessible when map view is active', async ({ page }) => {
    await page.goto('/writing')
    await page.locator('button[data-view="map"]').click()

    // Graveyard link persists (lives outside the toggled panels).
    const graveyardLink = page.locator('a[href*="graveyard"]').first()
    await expect(graveyardLink).toBeAttached()

    // Behind the Build link persists.
    const btbLink = page.locator('a[href*="behind-the-build"]').first()
    await expect(btbLink).toBeAttached()
  })
})
