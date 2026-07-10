/**
 * EXP-030 — Graveyard forensic records
 *
 * Each specimen on /graveyard must expose five structured forensic fields:
 *   hypothesis, warning sign, cause of death, lesson, surviving insight.
 *
 * These fields replace the undifferentiated body-copy model: each entry
 * is now a forensic record, not a narrative paragraph dump.
 */

import { test, expect } from '@playwright/test'

/** The five forensic fields, keyed by data-forensic-field attribute value. */
const FORENSIC_FIELDS = [
  'hypothesis',
  'warning-sign',
  'cause-of-death',
  'lesson',
  'surviving-insight',
] as const

test.describe('graveyard — forensic record structure (EXP-030)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/graveyard')
  })

  test('page has at least one specimen', async ({ page }) => {
    const specimens = page.locator('.graveyard-entry')
    await expect(specimens.first()).toBeAttached()
    const count = await specimens.count()
    expect(count, 'Expected at least one graveyard specimen').toBeGreaterThan(0)
  })

  test('each specimen exposes all five forensic fields', async ({ page }) => {
    const specimens = page.locator('.graveyard-entry')
    const count = await specimens.count()

    for (let i = 0; i < count; i++) {
      const specimen = specimens.nth(i)

      // Read the specimen name for legible failure messages.
      const name = await specimen.locator('h2').textContent().catch(() => `specimen ${i + 1}`)

      for (const field of FORENSIC_FIELDS) {
        const fieldEl = specimen.locator(`[data-forensic-field="${field}"]`)

        await expect(
          fieldEl,
          `Specimen "${name?.trim()}" is missing forensic field: ${field}`,
        ).toBeAttached()

        // The field must carry readable text — not just an empty node.
        const text = await fieldEl.textContent()
        expect(
          text?.trim().length,
          `Forensic field "${field}" on "${name?.trim()}" must not be empty`,
        ).toBeGreaterThan(0)
      }
    }
  })

  test('forensic field labels are keyboard-readable (dt elements present)', async ({ page }) => {
    const specimens = page.locator('.graveyard-entry')
    const count = await specimens.count()

    for (let i = 0; i < count; i++) {
      const specimen = specimens.nth(i)
      const name = await specimen.locator('h2').textContent().catch(() => `specimen ${i + 1}`)

      // Each field div wraps a <dt> label and a <dd> value inside a <dl>.
      // This ensures screen-reader and keyboard users can navigate the record.
      const dl = specimen.locator('.graveyard-forensic')
      await expect(
        dl,
        `Specimen "${name?.trim()}" must contain a .graveyard-forensic <dl>`,
      ).toBeAttached()

      const dtCount = await dl.locator('dt').count()
      expect(
        dtCount,
        `Specimen "${name?.trim()}" must have at least ${FORENSIC_FIELDS.length} <dt> labels`,
      ).toBeGreaterThanOrEqual(FORENSIC_FIELDS.length)
    }
  })

  test('forensic record is present and structured on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/graveyard')

    const specimens = page.locator('.graveyard-entry')
    const count = await specimens.count()
    expect(count).toBeGreaterThan(0)

    // On mobile the forensic <dl> must still be attached (layout stacks, not hides).
    const firstSpecimen = specimens.first()
    for (const field of FORENSIC_FIELDS) {
      await expect(
        firstSpecimen.locator(`[data-forensic-field="${field}"]`),
        `Field "${field}" must be attached on mobile`,
      ).toBeAttached()
    }
  })
})
