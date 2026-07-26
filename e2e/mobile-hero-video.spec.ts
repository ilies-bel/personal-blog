import { test, expect } from './test-base';

// Run all tests in this file sequentially. Tablet and desktop tests exercise the
// GL scene path, which can contend for software-rasterisation (SwiftShader) resources
// in headless mode when multiple tests run in parallel — causing flaky timeouts.
test.describe.configure({ mode: 'serial' });

// MOBILE HERO VIDEO — phones-only scroll-scrubbed video (PRD ef2abde8)
//
// Contract:
//   • On phones (viewport < 768 px wide), HeroIsland renders a <video> element
//     with class "bh-mobile-video", muted, playsinline, and an opening poster.
//   • The video sits at the same z-layer as the WebGL canvas (z-index 0, fixed,
//     object-fit cover) and replaces the live GL scene — no GL token is claimed.
//   • Tablets (viewport ≥ 768 px) and all desktops receive the live scene and
//     the tier ladder unchanged; no video element is present.
//   • Reduced-motion preference on phones takes precedence and shows the still
//     poster slideshow instead of the video (the same behaviour as on desktops).
//   • The hero loader resolves (body.scene-ready + body.loader-gone) on the
//     phone video path exactly as on the reduced-motion path.

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 800 };

test.describe('mobile hero video — phone viewport (390×844)', () => {
  test.use({ viewport: PHONE });

  test('video element is present with required accessibility attributes', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for HeroIsland to hydrate and detect the phone viewport.
    // scene-ready is the canonical "hero is ready" signal (lifted by
    // mountReducedMotionHero on the phone/reduced path).
    await page.waitForFunction(
      () => document.body.classList.contains('scene-ready'),
      { timeout: 15_000, polling: 200 },
    );

    const video = page.locator('video.bh-mobile-video');
    await expect(video).toBeAttached();

    // muted and playsinline are required for autoplay policies on mobile
    await expect(video).toHaveJSProperty('muted', true);
    // playsInline is a property name variant browsers expose
    const playsInline = await video.evaluate((el) =>
      (el as HTMLVideoElement).hasAttribute('playsinline') ||
      (el as HTMLVideoElement).hasAttribute('webkit-playsinline'),
    );
    expect(playsInline).toBe(true);

    // poster attribute should point at the opening black-hole still
    const poster = await video.getAttribute('poster');
    expect(poster).toBeTruthy();
    expect(poster).toMatch(/blackhole/);

    // aria-hidden: the video is decorative — it must not be announced
    await expect(video).toHaveAttribute('aria-hidden', 'true');
  });

  test('video sources include H.264 and prefer HEVC on Apple', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.body.classList.contains('scene-ready'),
      { timeout: 15_000, polling: 200 },
    );

    const video = page.locator('video.bh-mobile-video');
    await expect(video).toBeAttached();

    // HEVC source (hvc1) should be the first child — preferred for Apple
    const firstSrc = await video.locator('source').first().getAttribute('src');
    expect(firstSrc).toMatch(/hero-mobile\.hevc\.mp4/);

    // H.264 universal fallback must be the second source
    const secondSrc = await video.locator('source').nth(1).getAttribute('src');
    expect(secondSrc).toMatch(/hero-mobile\.mp4/);
  });

  test('loader resolves on the phone video path (scene-ready + loader-gone)', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () =>
        document.body.classList.contains('scene-ready') &&
        document.body.classList.contains('loader-gone'),
      { timeout: 15_000, polling: 200 },
    );

    // Both body classes must be present — these gate all the hero chrome
    const sceneReady = await page.evaluate(() =>
      document.body.classList.contains('scene-ready'),
    );
    const loaderGone = await page.evaluate(() =>
      document.body.classList.contains('loader-gone'),
    );
    expect(sceneReady).toBe(true);
    expect(loaderGone).toBe(true);
  });

  test('no GL canvas is created on phone (video replaces the live scene)', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.body.classList.contains('scene-ready'),
      { timeout: 15_000, polling: 200 },
    );

    // The bh-stage host div should be empty — createScene was never called, so
    // the three.js renderer never appended a canvas inside it.
    const canvasCount = await page.locator('.bh-stage canvas').count();
    expect(canvasCount).toBe(0);
  });
});

test.describe('mobile hero video — tablet viewport (768×1024)', () => {
  test.use({ viewport: TABLET });

  test('no mobile video element on tablet — live scene instead', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for React to hydrate and run the phone-detection effect.
    // We do NOT wait for scene-ready here — on a headless browser without GPU
    // acceleration the GL scene may take longer or be unavailable; what matters
    // is that the phone-video branch was NOT taken (innerWidth=768 ≥ 768 threshold).
    // Give the hydration cycle enough time to run and settle.
    await page.waitForFunction(
      () => document.readyState === 'complete',
      { timeout: 10_000 },
    );
    // Allow the React hydration / useEffect cycle to settle on the correct branch
    await page.waitForTimeout(1500);

    // The scroll-scrubbed video must NOT be rendered on a tablet
    await expect(page.locator('video.bh-mobile-video')).not.toBeAttached();
  });
});

test.describe('mobile hero video — desktop viewport (1280×800)', () => {
  test.use({ viewport: DESKTOP });

  test('no mobile video element on desktop — live scene instead', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () => document.readyState === 'complete',
      { timeout: 10_000 },
    );
    await page.waitForTimeout(1500);

    await expect(page.locator('video.bh-mobile-video')).not.toBeAttached();
  });
});
