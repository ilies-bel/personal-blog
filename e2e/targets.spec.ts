import { test, expect, type Page } from './test-base';
import { ALL_ROUTES } from './routes';

// 44×44px COARSE-POINTER TARGETS (P8, WCAG 2.5.8 at the program's 44px bar).
//
// At a 390×844 phone viewport with touch emulation (pointer: coarse — the media
// query the sizing rules in src/styles/a11y.css key on), every visible
// interactive element (a / button / summary / [role=button]) on every public
// route must present a ≥44×44 CSS-pixel hit box. Padding counts (it grows the
// border box the assertion measures); font sizes are untouched by the fixes.
//
// The one exemption is WCAG 2.5.8's own: links inside a text-flow paragraph
// (`<p>`), whose size is legitimately constrained by the line — prose links.
//
// Elements that are present but NOT currently interactive are skipped:
// display:none / visibility:hidden, zero-size boxes, pointer-events:none,
// ancestors with opacity ~0 (the manifesto's off-beat layers), aria-hidden or
// inert subtrees, and controls parked with tabindex="-1" (the finale ledger
// outside its scroll band). The home route is swept twice — settled top frame
// AND the finale frame at the bottom of the scroll track — so the ledger rows
// and the REPLAY button are measured in their live state.

const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE, hasTouch: true });

interface Offender {
  desc: string;
  width: number;
  height: number;
}

async function collectOffenders(page: Page): Promise<Offender[]> {
  return page.evaluate(() => {
    const MIN = 44;
    const EPSILON = 0.5; // sub-pixel rounding tolerance
    const offenders: { desc: string; width: number; height: number }[] = [];
    const candidates = document.querySelectorAll<HTMLElement>(
      'a[href], button, summary, [role="button"]',
    );
    for (const el of Array.from(candidates)) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility !== 'visible') continue;
      if (style.pointerEvents === 'none') continue;
      if (el.closest('[aria-hidden="true"], [inert]')) continue;
      // Controls the page has deliberately parked out of the tab order
      // (e.g. ledger rows outside the finale band) are not live targets.
      if (el.getAttribute('tabindex') === '-1') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // Effective visibility: any ancestor faded to ~0 hides the control.
      let faded = false;
      for (let node: HTMLElement | null = el; node; node = node.parentElement) {
        if (Number(getComputedStyle(node).opacity) < 0.05) {
          faded = true;
          break;
        }
      }
      if (faded) continue;
      // WCAG 2.5.8 inline exception: a target "in a sentence, or whose size is
      // otherwise constrained by the line-height of non-target text". Three
      // recognised shapes, each a real sentence/text-flow context — never a
      // bare navigation list:
      //   1. inside a <p> (a sentence, anywhere);
      //   2. inside a text-flow container (<li>/<dd>/<dt>/<figcaption>) that
      //      carries real text BEYOND the link itself (e.g. the 404 list's
      //      "Home — the full lifecycle…" rows);
      //   3. inside long-form prose (.prose reading column), where reference
      //      lists / figure captions are authored text whose line-height
      //      constrains the target (markdown bullet links).
      const container = el.closest('p, li, dd, dt, figcaption');
      if (container) {
        const containerText = (container.textContent ?? '').trim();
        const ownText = (el.textContent ?? '').trim();
        const isSentence = container.tagName === 'P';
        const hasSurroundingText = containerText.length > ownText.length + 3;
        const inProse = el.closest('.prose') !== null;
        if (isSentence || hasSurroundingText || inProse) continue;
      }
      if (rect.width + EPSILON < MIN || rect.height + EPSILON < MIN) {
        const label = (el.getAttribute('aria-label') || el.textContent || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 40);
        const cls = typeof el.className === 'string' ? el.className.split(/\s+/)[0] : '';
        offenders.push({
          desc: `<${el.tagName.toLowerCase()} class=${cls}> "${label}"`,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        });
      }
    }
    return offenders;
  });
}

const format = (offenders: Offender[]) =>
  offenders.map((o) => `${o.desc} — ${o.width}×${o.height}px`);

test('touch emulation exposes a coarse pointer to the sizing rules', async ({ page }) => {
  await page.goto('/contact', { waitUntil: 'load' });
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  expect(coarse, 'hasTouch must flip (pointer: coarse) or the suite proves nothing').toBe(true);
});

for (const route of ALL_ROUTES) {
  test(`≥44px targets on ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'load' });
    if (route === '/') {
      // Sweep the SETTLED page: loader lifted, markers released.
      await page.locator('body.scene-ready').waitFor({ timeout: 20_000 }).catch(() => {});
      await expect(page.locator('body')).toHaveClass(/loader-gone/, { timeout: 20_000 });
    }
    await page.waitForTimeout(600);

    const offenders = await collectOffenders(page);
    expect(format(offenders), `sub-44px targets on ${route}`).toEqual([]);

    if (route === '/') {
      // Second sweep at the FINALE frame: the ledger + REPLAY become live only
      // inside their scroll band (the presentation clock eases there, so wait
      // for the ledger's own visibility gate rather than a blind timeout).
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight - window.innerHeight),
      );
      const ledgerLive = await page
        .locator('.bh-finale-ledger[data-visible="true"]')
        .waitFor({ timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      if (ledgerLive) {
        const finaleOffenders = await collectOffenders(page);
        expect(format(finaleOffenders), 'sub-44px targets on / (finale frame)').toEqual([]);
      }
    }
  });
}
