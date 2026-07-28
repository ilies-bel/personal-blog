import type { Page } from '@playwright/test';

// Hero-path detection for the release-gate specs.
//
// The home hero commits to one of three paths at boot, and which one a given
// browser takes is a property of the ENVIRONMENT, not the site:
//
//   • live WebGL scene   — a real GPU is present (dev machines, GPU CI runners)
//   • software-GL poster — the WebGL probe finds a software rasteriser
//     (SwiftShader / llvmpipe / Microsoft Basic Render). HeroIsland mounts the
//     poster slideshow instead of the three.js engine and stamps the body with
//     POSTER_MODE_BODY_CLASS. This is what headless CI (and headless local
//     Chromium) get — there is no GPU, so the live scene never runs.
//   • phone video        — the viewport is below PHONE_VIEWPORT_WIDTH, so
//     MobileHeroVideo owns the hero (checked BEFORE the WebGL probe), and
//     neither the live-scene DOM nor the desktop no-WebGL edition ever mounts.
//
// Specs that assert live-scene DOM (in-scene markers, finale proof cards, the
// scene:ready event, dive carriers) or the desktop no-WebGL edition therefore
// cannot pass in those environments — the thing under test is not on the page.
// They use these predicates to self-skip WITH A REASON (so CI reports a
// documented skip, not a silent pass) while still running for real wherever the
// path they exercise is actually taken.

/** The body class HeroIsland stamps when the software-GL fallback (or a genuine
 *  reduced-motion preference) serves the poster instead of the live scene.
 *  Mirrors POSTER_MODE_BODY_CLASS in src/hero/lib/constants.ts — read here off
 *  the live DOM so we track the site's ACTUAL decision, never a re-derivation
 *  that could drift from it. */
const POSTER_MODE_BODY_CLASS = 'bh-poster-mode';

/** src/hero/lib/config.ts PHONE_VIEWPORT_WIDTH, mirrored (not imported) to keep
 *  the hero's browser-only deps out of the Playwright bundle. */
const PHONE_VIEWPORT_WIDTH = 768;

/**
 * Whether the hero committed to the software-GL poster fallback rather than the
 * live WebGL scene. Resolves as soon as the hero has committed EITHER way — the
 * poster class appears, or a reveal lands without it — so a live boot returns
 * `false` promptly rather than paying the full timeout. Only a live boot that
 * deliberately holds the loader up (engine chunks stalled at the network edge)
 * waits out `timeoutMs`, then returns `false`; those specs pass a budget that
 * comfortably clears their own network hold.
 *
 * mountReducedMotionHero adds the poster class together with scene-ready /
 * loader-gone in a single classList.add, so once any reveal signal is observed
 * the poster class — if it is coming at all — is already present; there is no
 * read-too-early race.
 */
export async function posterFallbackActive(page: Page, timeoutMs = 8000): Promise<boolean> {
  await page
    .waitForFunction(
      () => {
        const b = document.body?.classList;
        return (
          !!b &&
          (b.contains('bh-poster-mode') ||
            b.contains('scene-ready') ||
            b.contains('loader-gone') ||
            b.contains('webgl-unavailable'))
        );
      },
      { timeout: timeoutMs },
    )
    .catch(() => {
      /* held-loader live boot: no signal within budget — treat as not-poster */
    });
  return page.evaluate((cls) => document.body?.classList.contains(cls) ?? false, POSTER_MODE_BODY_CLASS);
}

/**
 * Whether this run is a phone-width viewport, where MobileHeroVideo owns the
 * hero. Note `browserName` is 'chromium' for BOTH the desktop `chromium` and
 * the `mobile-chrome` (Pixel 7) projects, so it cannot tell them apart — the
 * viewport can. Synchronous and deterministic: no navigation required.
 */
export function isPhoneViewport(page: Page): boolean {
  const width = page.viewportSize()?.width ?? Number.POSITIVE_INFINITY;
  return width < PHONE_VIEWPORT_WIDTH;
}
