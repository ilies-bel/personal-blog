import { test as base, expect } from '@playwright/test';

// Global cross-browser fixture.
//
// Problem: on Linux CI WebKit's WebGL implementation either hangs indefinitely
// during context creation or crashes the browser process.  The home page
// initialises Three.js synchronously on load, which means:
//   - waitUntil:'load' never resolves (page hangs), OR
//   - the browser process crashes partway through the test run.
// Both failures cascade: once the process is unstable, all subsequent tests
// in the same worker also die.
//
// Fix: for webkit (including mobile-safari, which shares the webkit engine)
// we inject a script that shadows HTMLCanvasElement.prototype.getContext so
// that every attempt to create a webgl/webgl2 context returns null — exactly
// what a GPU-less browser reports.  This routes the site through its own
// no-WebGL path (revealWithoutWebgl → 8-second scene-ready backstop) so the
// page loads cleanly without any Three.js involvement.
//
// Tests that specifically exercise WebGL behaviour (webgl.spec.ts figure
// activation, etc.) add their own `test.skip(browserName !== 'chromium', …)`
// guards and are not affected here.

export const test = base.extend<{ page: Parameters<typeof base.extend>[0]['page'] }>({
  // eslint-disable-next-line no-empty-pattern
  page: async ({ page, browserName }, use) => {
    if (browserName === 'webkit') {
      // Inject before any page script: return null for every WebGL-family
      // context type so Three.js's capability probe immediately takes the
      // no-WebGL branch instead of hanging on a GPU that doesn't exist.
      await page.addInitScript(() => {
        const _original = HTMLCanvasElement.prototype.getContext;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = function (
          type: string,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...rest: any[]
        ) {
          if (
            type === 'webgl' ||
            type === 'webgl2' ||
            type === 'experimental-webgl'
          ) {
            return null;
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return _original.call(this as HTMLCanvasElement, type as any, ...rest);
        };
      });
    }
    await use(page);
  },
});

export { expect };
// Re-export Playwright types so test files can import them from here instead
// of mixing `from '@playwright/test'` imports with `from './test-base'` ones.
export type { Page, Locator } from '@playwright/test';
