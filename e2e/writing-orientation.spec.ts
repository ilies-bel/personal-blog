/**
 * Writing orientation suite — EXP-016
 *
 * Asserts that the writing index exposes type, date, and reading commitment
 * for every article entry in plain language — no HUD decoding required.
 *
 * Acceptance criteria verified here:
 *   • Articles section groups entries by type with a visible plain-language heading
 *   • Each article entry carries a machine-readable publication date (<time>)
 *   • Each article entry exposes reading commitment ("N min read")
 *   • Each article entry is annotated with its editorial type (data-entry-type)
 *   • Each article entry exposes subject-matter topics
 *   • Graveyard and Behind the Build remain discoverable as destinations
 */

import { test, expect } from '@playwright/test'

test.describe('writing orientation — EXP-016', () => {
  // All assertions are against the fully-built static output (webServer in
  // playwright.config.ts runs `astro build && astro preview` before the suite).

  test('articles section groups entries by type with a visible heading', async ({ page }) => {
    await page.goto('/writing')

    // The only currently-published article (memory-leak) is classified as
    // "investigation", so the "Investigations" group heading must be visible.
    const heading = page.getByRole('heading', { name: 'Investigations' })
    await expect(heading).toBeVisible()
  })

  test('each article entry exposes a machine-readable publication date', async ({ page }) => {
    await page.goto('/writing')

    const memLeakRow = page.locator('a[href*="memory-leak-search-and-destroy"]')
    await expect(memLeakRow).toBeVisible()

    // A <time datetime="..."> element must be present and hold a valid ISO date.
    const timeEl = memLeakRow.locator('time')
    await expect(timeEl).toBeVisible()
    await expect(timeEl).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}/)
  })

  test('each article entry exposes reading commitment in plain language', async ({ page }) => {
    await page.goto('/writing')

    const memLeakRow = page.locator('a[href*="memory-leak-search-and-destroy"]')

    // Reading time must say "N min read" — plain text, not a raw number or code.
    const factEl = memLeakRow.locator('.writing-row-fact')
    await expect(factEl).toBeVisible()
    await expect(factEl).toContainText('min read')
  })

  test('each article entry carries its editorial type as a data attribute', async ({ page }) => {
    await page.goto('/writing')

    // data-entry-type lets tooling (and tests) assert classification without
    // relying on the human-readable group heading text.
    const investigationLink = page.locator('a[data-entry-type="investigation"]')
    await expect(investigationLink).toBeVisible()
    await expect(investigationLink).toHaveAttribute('href', /memory-leak-search-and-destroy/)
  })

  test('each article entry exposes subject-matter topics', async ({ page }) => {
    await page.goto('/writing')

    const memLeakRow = page.locator('a[href*="memory-leak-search-and-destroy"]')
    const topicsEl = memLeakRow.locator('.writing-row-topics')
    await expect(topicsEl).toBeVisible()

    // Topics must mention at least one of the investigation's key subjects.
    const topicsText = (await topicsEl.textContent()) ?? ''
    expect(topicsText.toLowerCase()).toMatch(/java|jvm|debug/)
  })

  test('Graveyard is discoverable as a named destination from Writing', async ({ page }) => {
    await page.goto('/writing')

    // "The graveyard" section must have a visible link to /graveyard.
    const graveyardSection = page.locator('section[aria-labelledby="graveyard-title"]')
    await expect(graveyardSection).toBeVisible()
    const graveyardLink = graveyardSection.locator('a[href*="graveyard"]')
    await expect(graveyardLink).toBeVisible()
  })

  test('Behind the Build is discoverable as a named destination from Writing', async ({ page }) => {
    await page.goto('/writing')

    // "About this site" section must have a visible link to /behind-the-build.
    const metaSection = page.locator('section[aria-labelledby="meta-title"]')
    await expect(metaSection).toBeVisible()
    const btbLink = metaSection.locator('a[href*="behind-the-build"]')
    await expect(btbLink).toBeVisible()
    await expect(btbLink.locator('.writing-row-title')).toContainText('Behind the build')
  })
})
