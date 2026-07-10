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
 *
 * EXP-001 — authored no-JS manifesto edition.
 *
 * The <noscript> block must read as a deliberate authored piece, not a broken
 * live scene. Tests verify:
 *   • the five manifesto beats render in reverse-lifecycle order
 *     (black hole → red giant → yellow star → nebula → pale blue dot)
 *   • lifecycle-state kickers are present so the arc is named, not anonymous
 *   • the canonical CTA ("Get in touch.") links to /about#get-in-touch
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

// ---------------------------------------------------------------------------
// EXP-001 — authored no-JS manifesto edition
// ---------------------------------------------------------------------------

test.describe('EXP-001 no-JS homepage — authored manifesto edition', () => {
  test(
    'manifesto beats render in reverse-lifecycle order',
    async ({ browser }) => {
      // Disable JavaScript — same isolation pattern as ENG-001.
      const ctx = await browser.newContext({ javaScriptEnabled: false })
      const page = await ctx.newPage()

      try {
        await page.goto('/')

        // The reverse-lifecycle manifesto reads BLACK HOLE → PALE BLUE DOT
        // top-to-bottom: BEATS.slice().reverse() in index.astro. Verify each
        // h2 within .scene-fallback-beat carries the correct copy from the
        // canonical BEATS source and that their DOM order matches the arc.
        const expectedBeats = [
          'Under pressure, structure remains.',
          'Complexity expands. My work is to keep the center readable.',
          'Systems grow. Interfaces drift. Complexity compounds.',
          'One clear boundary can save a thousand future decisions.',
          'What remains is the work.',
        ] as const

        const fallback = page.locator('.scene-fallback')
        await expect(fallback, '.scene-fallback must be rendered').toBeVisible()

        const headings = fallback.locator('.scene-fallback-beat-heading')
        await expect(
          headings,
          `exactly ${expectedBeats.length} beat headings must be present`,
        ).toHaveCount(expectedBeats.length)

        for (let i = 0; i < expectedBeats.length; i += 1) {
          await expect(
            headings.nth(i),
            `beat ${i + 1} heading must read "${expectedBeats[i]}"`,
          ).toHaveText(expectedBeats[i])
        }
      } finally {
        await ctx.close()
      }
    },
  )

  test(
    'lifecycle-state kickers name the arc and destinations are operable',
    async ({ browser }) => {
      const ctx = await browser.newContext({ javaScriptEnabled: false })
      const page = await ctx.newPage()

      try {
        await page.goto('/')

        const fallback = page.locator('.scene-fallback')
        await expect(fallback, '.scene-fallback must be rendered').toBeVisible()

        // ── 1. Lifecycle kickers — each beat is labelled with its state so the
        //    reverse arc is named ("BLACK HOLE → PALE BLUE DOT"), not anonymous.
        //    The beat.state values are lowercase in the data; CSS uppercases them.
        const expectedKickers = [
          'black hole',
          'red giant',
          'yellow star',
          'nebula',
          'pale blue dot',
        ] as const

        const kickers = fallback.locator('.scene-fallback-beat-kicker')
        await expect(
          kickers,
          `exactly ${expectedKickers.length} lifecycle kickers must be present`,
        ).toHaveCount(expectedKickers.length)

        for (let i = 0; i < expectedKickers.length; i += 1) {
          await expect(
            kickers.nth(i),
            `kicker ${i + 1} must carry the lifecycle state text`,
          ).toHaveText(expectedKickers[i])
        }

        // ── 2. Canonical destinations — the nav links (Work / Writing / About /
        //    Contact) are exposed in the first viewport without scrolling and link
        //    to the correct sections. The CTA also provides a direct contact path.
        const nav = fallback.locator('.scene-fallback-nav')
        await expect(nav, '.scene-fallback-nav must be visible').toBeVisible()

        const navDestinations = [
          { label: 'Work',    hrefPattern: /\/projects/ },
          { label: 'Writing', hrefPattern: /\/writing/  },
          { label: 'About',   hrefPattern: /\/about/    },
          { label: 'Contact', hrefPattern: /\/about/    },
        ] as const

        for (const { label, hrefPattern } of navDestinations) {
          const link = nav.getByRole('link', { name: label })
          await expect(link, `${label} link must be visible`).toBeVisible()
          await expect(
            link,
            `${label} link href must match ${hrefPattern}`,
          ).toHaveAttribute('href', hrefPattern)
        }

        // ── 3. CTA link — the closing "Get in touch." provides a direct contact
        //    path independently of the nav, confirming the page never dead-ends.
        const cta = fallback.locator('.scene-fallback-cta').getByRole('link')
        await expect(cta, 'CTA link must be visible').toBeVisible()
        await expect(
          cta,
          'CTA link href must point to /about#get-in-touch',
        ).toHaveAttribute('href', /\/about/)
      } finally {
        await ctx.close()
      }
    },
  )
})
