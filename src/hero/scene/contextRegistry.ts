/**
 * contextRegistry — site-wide WebGL context cap.
 *
 * At most {@link CONTEXT_CAP} THREE.WebGLRenderer instances may be alive
 * simultaneously. Every call site that creates a renderer MUST call
 * `acquire()` first; if it returns `false` the caller degrades gracefully
 * (static placeholder, idle state). When the renderer is disposed the call
 * site MUST call `release()` so the slot is freed for another consumer.
 *
 * The live count is written to `window.__webgl_context_count__` so Playwright
 * E2E tests can assert the invariant without polling internal module state.
 */

/** Maximum simultaneous live WebGL renderers across the whole site. */
export const CONTEXT_CAP = 2;

let _live = 0;

function _sync(): void {
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>)['__webgl_context_count__'] = _live;
  }
}

/**
 * Reserve a WebGL context slot.
 *
 * Returns `true` when a slot was granted — the caller MUST call `release()`
 * when the renderer is disposed.  Returns `false` when the cap is already
 * full; the caller should show a static placeholder or stay idle.
 */
export function acquire(): boolean {
  if (_live >= CONTEXT_CAP) {
    if (import.meta.env.DEV) {
      console.warn(
        `[contextRegistry] cap (${CONTEXT_CAP}) reached — renderer denied (live=${_live})`,
      );
    }
    return false;
  }
  _live++;
  _sync();
  return true;
}

/**
 * Release a previously acquired context slot.
 *
 * Idempotent: a second call when the count is already 0 emits a dev warning
 * but does not corrupt the counter.
 */
export function release(): void {
  if (_live <= 0) {
    if (import.meta.env.DEV) {
      console.warn(
        '[contextRegistry] release() called but liveCount is already 0 — double-release bug',
      );
    }
    return;
  }
  _live--;
  _sync();
}

/** Current count of live renderer slots (diagnostics / tests). */
export function liveContextCount(): number {
  return _live;
}

/** Reset all state.  ONLY for unit tests — never call from production code. */
export function _resetForTest(): void {
  _live = 0;
  _sync();
}

// Publish the initial count immediately so the window property is always
// present before the first acquire() call — E2E tests can read it on load.
_sync();
