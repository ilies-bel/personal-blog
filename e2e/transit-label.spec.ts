import { test, expect } from './test-base';

// PRD-004 Destination-name transition continuity.
//
// A decorative destination readout (WRITING / PROJECTS / GRAVEYARD / INSPIRATION)
// rides the persisted dive bloom, then yields to the destination's real <h1> and
// the true SiteNav current state. The carrier is aria-hidden, pointer-inert, and
// nonfocusable; it never claims a false aria-current and clears on every exit.
//
// A dive needs a live GL context (webkit/firefox take the no-WebGL path in CI, so
// the in-scene markers never mount). Chromium/SwiftShader is the reliable path.
test.describe('destination-name transition continuity (PRD-004)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'dive needs a working GL context');

  test('the carrier is aria-hidden, pointer-inert and empty at rest', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const carrier = page.locator('[data-dive-overlay] [data-dive-label]');
    await expect(carrier).toHaveCount(1);
    // Permanently out of the a11y tree (the overlay wrapping it is aria-hidden).
    const overlayHidden = await page
      .locator('[data-dive-overlay]')
      .getAttribute('aria-hidden');
    expect(overlayHidden).toBe('true');
    // Empty at rest, not flagged active, not focusable.
    expect(await carrier.textContent()).toBe('');
    await expect(page.locator('[data-dive-overlay]')).not.toHaveAttribute('data-dive-label', 'active');
    expect(await carrier.getAttribute('tabindex'), 'carrier is not focusable').toBeNull();
    const pe = await carrier.evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(pe).toBe('none');
  });

  test('firing a dive arms the carrier with the marker’s audited label', async ({ page }) => {
    test.slow();
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('body')).toHaveClass(/loader-gone/, { timeout: 15_000 });
    // Reveal the yellow marker by scrolling to its settled band.
    const marker = page.locator('a.star-marker[href$="projects#fleet"]');
    for (let i = 1; i <= 14; i += 1) {
      await page.evaluate((fraction) => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, Math.round(max * fraction));
      }, i / 14);
      await page.waitForTimeout(300);
      if ((await marker.count()) > 0 && (await marker.getAttribute('data-visible')) === 'true') break;
    }
    await expect(marker).toHaveCount(1);
    // Fire the dive via a real click event on the anchor (dispatch bypasses the
    // scroll-track pointer occlusion; the marker's own handler runs beginDive).
    // We intercept the navigation so we can inspect the armed carrier before swap.
    // COARSE POINTER (mobile-chrome): the marker's designed touch contract is a
    // two-step — the first tap only reveals the info card (tap-to-lock, no
    // navigation), the SECOND tap fires the dive. Mirror that here: tap twice
    // on coarse pointers, once on fine pointers (desktop dives on first click).
    await marker.evaluate((el) => {
      el.addEventListener('click', (e) => e.preventDefault(), { capture: true });
      const tap = () =>
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      tap();
      if (window.matchMedia('(pointer: coarse)').matches) tap();
    });
    // beginDive armed the persisted carrier with the audited PROJECTS label.
    await expect(page.locator('[data-dive-overlay]')).toHaveAttribute('data-dive-label', 'active', {
      timeout: 2_000,
    });
    await expect(page.locator('[data-dive-overlay] [data-dive-label]')).toHaveText('PROJECTS');
  });

  // Arrival contract per dive route — the destination <h1> and the TRUE SiteNav
  // current state own the page, and the resurface handler clears the carrier that
  // rode in on the persisted overlay. Seed the arrived-via-dive state before the
  // page's resurface script runs, exactly as the persisted overlay would carry it.
  for (const route of [
    { href: '/projects#fleet', label: 'PROJECTS', h1: 'h1#projects-title', h1Text: 'The work that held.', navCurrent: /Work/i },
    { href: '/writing', label: 'WRITING', h1: 'h1', h1Text: 'Everything, in plain words.', navCurrent: /Writing/i },
    { href: '/graveyard', label: 'GRAVEYARD', h1: 'h1#graveyard-title', h1Text: 'Not everything survives.', navCurrent: null },
  ]) {
    test(`arrival at ${route.href}: h1 owns the page, carrier clears, nav is truthful`, async ({ page }) => {
      // Seed the dive flag + a pre-populated carrier BEFORE the destination's
      // resurface handler runs, mirroring the persisted-overlay carry-in.
      await page.addInitScript((label) => {
        try {
          sessionStorage.setItem('bh:dive', '1');
        } catch {
          /* private mode */
        }
        // Populate the carrier the instant the overlay exists in the parsed DOM.
        document.addEventListener('astro:page-load', () => {}, { once: true });
        const seed = () => {
          const overlay = document.querySelector('[data-dive-overlay]');
          const carrier = overlay?.querySelector('[data-dive-label]');
          if (overlay && carrier && !carrier.textContent) {
            carrier.textContent = label;
            (overlay as HTMLElement).dataset.diveLabel = 'active';
          }
        };
        document.addEventListener('DOMContentLoaded', seed, { once: true });
      }, route.label);

      await page.goto(route.href, { waitUntil: 'load' });

      // The real route h1 is present and owns the arrival.
      await expect(page.locator(route.h1).first()).toHaveText(route.h1Text);

      // Truthful nav current state — the audited value, or NONE for graveyard.
      // Reading pages render the section nav as .subnav-link (SiteNav surface=page);
      // match aria-current anywhere in the primary nav, surface-agnostic.
      const current = page.locator('nav a[aria-current="page"]');
      if (route.navCurrent) {
        await expect(current.first()).toContainText(route.navCurrent);
      } else {
        await expect(current, 'no false aria-current on a route with no nav item').toHaveCount(0);
      }

      // The resurface handler clears the carrier's text + flag — no stale label.
      await expect
        .poll(
          async () => (await page.locator('[data-dive-overlay] [data-dive-label]').textContent()) ?? '',
          { timeout: 3_000 },
        )
        .toBe('');
      await expect(page.locator('[data-dive-overlay]')).not.toHaveAttribute('data-dive-label', 'active');
    });
  }

  test('a normal nav (no dive) never shows the carrier', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('body')).toHaveClass(/loader-gone/, { timeout: 15_000 });
    // Use the ordinary section nav (not a marker dive) to reach Writing.
    await page.locator('.overlay-blog-links a', { hasText: 'Writing' }).click();
    await page.waitForURL(/\/writing\/?$/);
    await expect(page.locator('h1')).toBeVisible();
    // No carrier flag, no text — a plain navigation never arms it.
    await expect(page.locator('[data-dive-overlay]')).not.toHaveAttribute('data-dive-label', 'active');
    expect(await page.locator('[data-dive-overlay] [data-dive-label]').textContent()).toBe('');
  });
});

// Reduced motion: the decorative carrier is OMITTED (not merely slowed).
test.describe('transit label under reduced motion (PRD-004)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'dive needs a working GL context');
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('reduced motion omits the travelling carrier (display:none)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    const carrier = page.locator('[data-dive-overlay] [data-dive-label]');
    await expect(carrier).toHaveCount(1);
    // Even if a label were set, CSS hides the carrier entirely under reduced motion.
    const display = await carrier.evaluate((el) => getComputedStyle(el).display);
    expect(display, 'carrier is display:none under reduced motion').toBe('none');
  });
});
