/**
 * QA-002 — no-WebGL fallback and forced context-loss coverage
 *
 * EXP-007: When WebGL creation fails the page must present the authored
 * no-WebGL edition — not a blank canvas, apology screen, or broken loader.
 *
 * PERF-010: Forced context loss must either recover once or transition to the
 * no-WebGL edition without a reload loop, black frame, or broken navigation.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Test 1 — WebGL context creation stubbed to return null  (@smoke @gate)
 *
 *   Patches `HTMLCanvasElement.prototype.getContext` via addInitScript so
 *   every call to getContext('webgl') or getContext('webgl2') returns null.
 *   This simulates devices (old integrated GPUs, locked-down kiosks) where
 *   the browser cannot create a WebGL context at all.
 *
 *   The scene engine must detect the null context and set
 *   `body.webgl-unavailable`, revealing the branded fallback note.
 *
 * Test 2 — Forced context loss via WEBGL_lose_context extension  (@gate)
 *
 *   Navigates home, waits for a live WebGL context, then calls
 *   `gl.getExtension('WEBGL_lose_context').loseContext()` from inside
 *   page.evaluate().  If WebGL is absent in the headless environment, or the
 *   WEBGL_lose_context extension is unavailable, the test is skipped
 *   gracefully so CI stays green on software-rendering environments.
 *
 *   After the forced loss the app must either restore state (recovery path)
 *   or transition to the no-WebGL edition.  In both cases:
 *     • `nav[aria-label="Sections"]` remains attached.
 *     • The page never reloads (no reload loop).
 *     • No unexpected console errors fire.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Test 1 — No-WebGL stub: authored fallback appears when getContext returns null
// ---------------------------------------------------------------------------

test(
  'no-WebGL stub — authored fallback visible when getContext returns null',
  { tag: ['@smoke'] },
  async ({ page }) => {
    // Block WebGL context creation for the entire page lifecycle.
    // The scene engine calls canvas.getContext('webgl2') first, then falls back
    // to canvas.getContext('webgl').  Returning null for both forces the
    // no-WebGL path without waiting for the 8 s hard-timeout backstop.
    // 2D contexts (used by text measurement, offscreen canvas, etc.) are passed
    // through to avoid collateral damage.
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — patching browser prototype
      const _orig = HTMLCanvasElement.prototype.getContext
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      HTMLCanvasElement.prototype.getContext = function (
        contextType: string,
        ...args: unknown[]
      ): RenderingContext | null {
        if (contextType === 'webgl' || contextType === 'webgl2') {
          return null
        }
        return (_orig as Function).call(this, contextType, ...args) as RenderingContext | null
      }
    })

    // Capture console errors; allow WebGL/Three.js-related messages but flag
    // anything unexpected from the application layer.
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto('/')

    // With WebGL stubbed, the engine detects the failure and should call
    // revealWithoutWebgl() much faster than the 8 s timeout.  We wait
    // up to 12 s to accommodate both the fast detection path and the
    // rare slow path where the engine tries several fallback approaches.
    await page.waitForFunction(
      () => document.body.classList.contains('webgl-unavailable'),
      { timeout: 12_000 },
    )

    // ── 1. Authored fallback note is visible ─────────────────────────────
    await expect(
      page.locator('.webgl-fallback'),
      'The branded no-WebGL fallback note must be visible after getContext returns null',
    ).toBeVisible()

    // ── 2. Navigation remains operable ───────────────────────────────────
    const nav = page.locator('nav[aria-label="Sections"]')
    await expect(
      nav,
      'Primary nav must be present after no-WebGL fallback',
    ).toBeAttached()

    for (const label of ['Work', 'Writing', 'About', 'Contact']) {
      await expect(
        nav.getByRole('link', { name: label, exact: true }),
        `"${label}" nav link must be attached after no-WebGL fallback`,
      ).toBeAttached()
    }

    // ── 3. No unexpected console errors on the fallback path ─────────────
    // WebGL/Three.js error messages are expected and acceptable; anything
    // else (hydration errors, resource 404s, JS exceptions) is not.
    const unexpectedErrors = consoleErrors.filter(msg => {
      const lower = msg.toLowerCase()
      return (
        !lower.includes('webgl') &&
        !lower.includes('three') &&
        !lower.includes('context') &&
        !lower.includes('renderer')
      )
    })
    expect(
      unexpectedErrors,
      'Unexpected console errors on the no-WebGL fallback path',
    ).toHaveLength(0)
  },
)

// ---------------------------------------------------------------------------
// Test 2 — Forced context loss via WEBGL_lose_context extension
// ---------------------------------------------------------------------------

test(
  'forced WebGL context loss — recover or transition gracefully (PERF-010)',
  async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    // Count full-page reloads — a reload loop is an unacceptable failure mode.
    let reloadCount = 0
    page.on('load', () => {
      reloadCount += 1
    })

    await page.goto('/')

    // Reset after the initial load so only post-navigation reloads are counted.
    reloadCount = 0

    // Wait for the scene to become ready OR for the timeout fallback.
    // Generous timeout: Three.js loading can take 5–15 s on cold CI runners.
    await page.waitForFunction(
      () =>
        document.body.classList.contains('scene-ready') ||
        document.body.classList.contains('webgl-unavailable'),
      { timeout: 25_000 },
    )

    // If WebGL was not available in this headless environment the context count
    // is 0, meaning nothing was rendered and there is no context to lose.
    // The no-WebGL stub test above covers that path; skip here to avoid a false
    // positive from trying to lose a context that was never created.
    const hadWebgl = await page.evaluate(() => {
      const count =
        (
          window as unknown as { __webgl_context_count__?: number }
        ).__webgl_context_count__ ?? 0
      return count > 0
    })

    if (!hadWebgl) {
      test.skip(true, 'WebGL not available in this headless environment — skipped gracefully')
      return
    }

    // Attempt to force context loss via the WEBGL_lose_context debug extension.
    // This extension is required to be present when WebGL is available but it
    // may be absent in some software-rendering configurations.
    const lossTriggered = await page.evaluate(() => {
      const canvases = Array.from(
        document.querySelectorAll<HTMLCanvasElement>('canvas'),
      )
      for (const canvas of canvases) {
        // Try WebGL 2 first, then WebGL 1.
        const gl =
          (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ??
          (canvas.getContext('webgl') as WebGLRenderingContext | null)
        if (!gl) continue
        const ext = gl.getExtension('WEBGL_lose_context')
        if (ext) {
          ext.loseContext()
          return true
        }
      }
      return false
    })

    if (!lossTriggered) {
      test.skip(true, 'WEBGL_lose_context extension not available in this environment — skipped gracefully')
      return
    }

    // After forcing context loss the app must either:
    //   a) Recover (body.scene-ready stays set, nav remains present), OR
    //   b) Transition to the no-WebGL edition (body.webgl-unavailable set).
    // We wait up to 8 s for either outcome.
    await page.waitForFunction(
      () =>
        document.body.classList.contains('webgl-unavailable') ||
        (document.body.classList.contains('loader-gone') &&
          document.querySelector('nav[aria-label="Sections"]') !== null),
      { timeout: 8_000 },
    )

    // ── 1. No reload loop ─────────────────────────────────────────────────
    expect(
      reloadCount,
      'The page must not reload as a result of WebGL context loss',
    ).toBe(0)

    // ── 2. Navigation remains usable regardless of the recovery path ──────
    await expect(
      page.locator('nav[aria-label="Sections"]'),
      'Primary nav must remain attached after context loss',
    ).toBeAttached()

    // ── 3. No unexpected console error storms ─────────────────────────────
    // A single "WebGL: CONTEXT_LOST_WEBGL" message is expected; anything
    // outside the WebGL/Three.js domain is not.
    const unexpectedErrors = consoleErrors.filter(msg => {
      const lower = msg.toLowerCase()
      return (
        !lower.includes('webgl') &&
        !lower.includes('three') &&
        !lower.includes('context') &&
        !lower.includes('renderer')
      )
    })
    expect(
      unexpectedErrors,
      'Unexpected console errors after WebGL context loss',
    ).toHaveLength(0)
  },
)
