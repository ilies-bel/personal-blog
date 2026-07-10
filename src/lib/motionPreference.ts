// Centralized motion-preference service.
//
// Single source of truth for the resolved reduced-motion preference across the
// whole site — hero WebGL scene, custom cursor, page transitions, decode hover,
// graveyard / about page entrance animations.
//
// Resolution order (first match wins):
//   1. Manual override stored in localStorage ('bh:reduced-motion': 'true'/'false')
//   2. OS prefers-reduced-motion: reduce media query
//
// Module side-effects on first import (browser only):
//   • Sets <html data-reduced-motion="true|false"> so CSS keys off one signal.
//   • Watches matchMedia('prefers-reduced-motion') for live OS changes.
//   • Re-broadcasts on astro:page-load so SPA-navigated pages pick up current state.
//
// Consumer pattern:
//   import { resolveMotionPreference, MOTION_CHANGE_EVENT } from '~/lib/motionPreference';
//   let reduced = resolveMotionPreference();
//   window.addEventListener(MOTION_CHANGE_EVENT, (e) => {
//     reduced = (e as CustomEvent<{ reduced: boolean }>).detail.reduced;
//   });

/** localStorage key for the manual reduced-motion override. */
const STORAGE_KEY = 'bh:reduced-motion';

/**
 * Custom event name dispatched on window whenever the resolved preference
 * changes — OS flip, manual override, or SPA navigation re-broadcast.
 * Detail: `{ reduced: boolean }`.
 */
export const MOTION_CHANGE_EVENT = 'bh:motion-preference-change';

// ---------------------------------------------------------------------------
// Pure reads (SSR-safe)
// ---------------------------------------------------------------------------

/**
 * Read the live OS reduced-motion preference from the prefers-reduced-motion
 * media query. Returns false in SSR contexts where matchMedia is unavailable.
 */
export function getOsPreference(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Read the persisted manual override from localStorage.
 *
 * Returns `true` / `false` when an explicit override is stored, or `null`
 * when no override has been set. Access is wrapped in try/catch so private
 * mode, quota exceeded, or SSR (ReferenceError) never throw.
 */
export function getManualOverride(): boolean | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  } catch {
    // SSR (localStorage undefined → ReferenceError), private mode, or quota.
    return null;
  }
}

/**
 * Resolve the final reduced-motion preference.
 *
 *   resolved = manualOverride ?? osPreference
 *
 * A manual override (corner toggle) wins and persists across reloads. With no
 * override the OS prefers-reduced-motion media feature is the default. SSR-safe:
 * returns false when neither source is available.
 */
export function resolveMotionPreference(): boolean {
  return getManualOverride() ?? getOsPreference();
}

// ---------------------------------------------------------------------------
// Side-effecting writes
// ---------------------------------------------------------------------------

/**
 * Apply the current resolved preference to the document root attribute and
 * broadcast `bh:motion-preference-change` to all same-page listeners.
 *
 * Called automatically on:
 *   - module initialization (initial page load)
 *   - OS matchMedia `change` event
 *   - every `astro:page-load` (SPA navigation re-broadcast)
 *   - explicit manual overrides via `setManualOverride()`
 */
function applyAndBroadcast(): void {
  if (typeof window === 'undefined') return;
  const reduced = resolveMotionPreference();
  document.documentElement.setAttribute('data-reduced-motion', String(reduced));
  window.dispatchEvent(new CustomEvent(MOTION_CHANGE_EVENT, { detail: { reduced } }));
}

/**
 * Record a manual reduced-motion override — wins over the OS preference and
 * persists across reloads via localStorage. Updates `<html data-reduced-motion>`
 * and broadcasts `bh:motion-preference-change` to every consumer on the page.
 *
 * This is the ONLY write path. All consumers read the resolved state via
 * `resolveMotionPreference()` or listen for `MOTION_CHANGE_EVENT`.
 */
export function setManualOverride(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Private mode / quota exceeded — preference won't persist but the
    // attribute and event still update the current session.
  }
  applyAndBroadcast();
}

// ---------------------------------------------------------------------------
// Module initialization — browser only
// ---------------------------------------------------------------------------
// Runs exactly once when the module is first imported. SSR-safe (guarded on
// window). The three side-effects make the service self-bootstrapping: any
// script that imports this module and then listens for MOTION_CHANGE_EVENT
// will receive the initial preference AND future changes without extra setup.

if (typeof window !== 'undefined') {
  // 1. Stamp the initial resolved preference into <html data-reduced-motion>.
  //    Running synchronously at import time means the attribute is set before
  //    any other script runs, so CSS and JS consumers start with consistent state.
  applyAndBroadcast();

  // 2. Watch for live OS preference changes (user enables Reduce Motion in
  //    System Preferences while the page is open) and propagate immediately.
  try {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    // `addEventListener` is the modern API; `addListener` is deprecated since
    // Safari 14. Node.js / jsdom may expose only one — guard both.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', applyAndBroadcast);
    }
  } catch {
    // matchMedia unavailable in some locked-down / headless contexts — skip.
  }

  // 3. Re-broadcast on every Astro ClientRouter SPA navigation. The <html>
  //    element persists across swaps so the attribute survives, but the
  //    re-broadcast ensures newly-mounted page scripts receive the event and
  //    newly-mounted React islands pick up the current preference in their
  //    useEffect callbacks.
  document.addEventListener('astro:page-load', applyAndBroadcast);
}
