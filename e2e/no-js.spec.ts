/**
 * ENG-001 — no-JS homepage fallback (QA-002 coverage)
 *
 * With JavaScript disabled the homepage must:
 *   • show NO fixed full-viewport loader cover (.scene-loader hidden)
 *   • have a sane document height (< 3 viewports — NOT the ~1800svh scroll track)
 *   • present keyboard-reachable Work, Writing, About, and Contact links
 *     immediately in the first viewport (inside .scene-fallback-nav)
 *
 * Fix: BaseLayout.astro starts with html.no-js; an is:inline head script
 * removes the class synchronously when JS is available. scene.css rules keyed
 * on html.no-js hide .scene-loader and collapse .scene-track when JS is off.
 * The <noscript> block in index.astro includes the nav links.
 */

import { test, expect } from '@playwright/test'

test.describe('ENG-001 no-JS homepage', () => {
  test(
    'no fixed cover, sane height, nav links present and focusable',
    async ({ browser }) => {
      // Disable JavaScript for this context only — does not affect other tests.
      const ctx = await browser.newContext({ javaScriptEnabled: false })
      const page = await ctx.newPage()

      try {
        await page.goto('/')

        // ── 1. No fixed full-viewport loader cover ───────────────────────────
        // The .scene-loader div is position:fixed and covers the full viewport.
        // With JS off, html.no-js persists and scene.css hides it via
        // `html.no-js .scene-loader { display: none !important }`.
        await expect(
          page.locator('.scene-loader'),
          'scene-loader must be hidden when JS is absent',
        ).not.toBeVisible()

        // ── 2. Sane document height ──────────────────────────────────────────
        // The .scene-track is 6 × 300svh ≈ 1800svh of dead scroll.
        // With JS off, html.no-js collapses it via `display: none !important`.
        // We assert < 3 viewport heights — generous enough for the fallback
        // content, tight enough to rule out the scroll track.
        const vh = page.viewportSize()?.height ?? 800
        const scrollH = await page.evaluate(
          () => document.documentElement.scrollHeight,
        )
        expect(
          scrollH,
          `document height ${scrollH}px must be < ${vh * 3}px (3 viewports)`,
        ).toBeLessThan(vh * 3)

        // ── 3. Nav links present and keyboard-focusable ──────────────────────
        // The <noscript> block renders .scene-fallback-nav with four <a> links.
        // Each must be visible AND receive keyboard focus (Tab-reachable).
        const nav = page.locator('.scene-fallback-nav')
        await expect(nav, '.scene-fallback-nav must be rendered').toBeVisible()

        const destinations = [
          { label: 'Work',    hrefPattern: /\/projects/ },
          { label: 'Writing', hrefPattern: /\/writing/  },
          { label: 'About',   hrefPattern: /\/about/    },
          { label: 'Contact', hrefPattern: /\/about/    },  // /about#get-in-touch
        ] as const

        for (const { label, hrefPattern } of destinations) {
          const link = nav.getByRole('link', { name: label })

          await expect(link, `${label} link must be visible`).toBeVisible()

          await expect(
            link,
            `${label} link href must match ${hrefPattern}`,
          ).toHaveAttribute('href', hrefPattern)

          // Confirm keyboard reachability: programmatic focus must land on the link.
          await link.focus()
          await expect(
            link,
            `${label} link must be keyboard-focusable`,
          ).toBeFocused()
        }
      } finally {
        await ctx.close()
      }
    },
  )
})
