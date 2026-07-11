// MOTION PREFERENCE — the ONE module that owns the resolved motion preference
// sitewide. The single source of truth is the `data-motion` attribute on <html>
// ('reduced' | 'full'), stamped BEFORE first paint by the tiny is:inline script
// in BaseHead.astro (which consults the same localStorage override key), and
// kept fresh here for the rest of the session.
//
//     effective motion = manual override ?? OS preference
//
// A manual choice (the hero's corner toggle → setMotionOverride) always wins and
// persists in localStorage; with no manual choice the OS reduced-motion media
// query is the default. This module owns the ONLY matchMedia listener for the
// preference: an OS change recomputes the effective value, re-stamps the
// attribute, and notifies every subscriber — so JS consumers (getMotion /
// onMotionChange / useMotion) and CSS (html[data-motion='reduced'] selectors,
// see src/styles) can never disagree.
//
// The module is a singleton that survives Astro ClientRouter SPA swaps (bundled
// modules evaluate once per session). The router's swapRootAttributes REPLACES
// the <html> attributes with the incoming document's on every swap — and the
// incoming static HTML has no data-motion (the pre-paint script does not re-run)
// — so the astro:after-swap hook below re-stamps the attribute immediately after
// each swap, before the new page paints.
import { useSyncExternalStore } from 'react';

export type Motion = 'reduced' | 'full';

/** localStorage key persisting the visitor's MANUAL motion override (a bare
 *  'true'/'false' string, kept in the historical format so existing visitors'
 *  choices survive). When present it WINS over the OS prefers-reduced-motion
 *  default; when absent the OS preference is the source of truth. The literal is
 *  duplicated in BaseHead.astro's pre-paint script (is:inline scripts cannot
 *  import) — keep the two in sync. */
const STORAGE_KEY = 'bh:reduced-motion';
const OS_QUERY = '(prefers-reduced-motion: reduce)';

const listeners = new Set<(motion: Motion) => void>();

/** The persisted manual override, or null when the visitor never set one
 *  (→ fall back to the OS preference). SSR- and private-mode-safe. */
export function getMotionOverride(): Motion | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (raw === 'true') return 'reduced';
    if (raw === 'false') return 'full';
  } catch {
    // Private mode / disabled storage — behave as if no override was set.
  }
  return null;
}

function osMotion(): Motion {
  if (typeof window === 'undefined' || !window.matchMedia) return 'full';
  return window.matchMedia(OS_QUERY).matches ? 'reduced' : 'full';
}

/** effective motion = manual override ?? OS preference. Mirrors exactly what the
 *  BaseHead pre-paint script stamps at first paint. */
function computeMotion(): Motion {
  return getMotionOverride() ?? osMotion();
}

/** Re-stamp <html data-motion> and notify subscribers on an actual change. */
function applyMotion(next: Motion): void {
  if (typeof document === 'undefined') return;
  if (document.documentElement.dataset.motion === next) {
    return;
  }
  document.documentElement.dataset.motion = next;
  for (const listener of [...listeners]) listener(next);
}

/**
 * The resolved motion preference, read synchronously from the <html> attribute
 * the pre-paint script stamped (and this module keeps fresh). SSR-safe: returns
 * 'full' on the server — never use the SSR value for render decisions; islands
 * that branch on motion read it client-side (useMotion) or in effects.
 */
export function getMotion(): Motion {
  if (typeof document === 'undefined') return 'full';
  return document.documentElement.dataset.motion === 'reduced' ? 'reduced' : 'full';
}

/**
 * Persist (or clear, with null) the manual motion override, recompute the
 * effective value, re-stamp the attribute, and notify subscribers. Storage
 * failures (private mode) never throw — the in-memory attribute still flips, so
 * the choice drives the current session even when it cannot persist.
 */
export function setMotionOverride(value: Motion | null): void {
  try {
    if (value === null) window.localStorage?.removeItem(STORAGE_KEY);
    else window.localStorage?.setItem(STORAGE_KEY, value === 'reduced' ? 'true' : 'false');
  } catch {
    // Private mode / disabled storage — the in-memory state still drives this session.
  }
  applyMotion(computeMotion());
}

/**
 * Subscribe to effective-motion changes (OS flips with no override set, manual
 * override writes). Returns the unsubscribe. The module owns the single
 * process-wide matchMedia listener — subscribers never bind their own.
 */
export function onMotionChange(callback: (motion: Motion) => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * React hook: the live resolved motion preference. Server render (and the
 * hydration render, so server HTML and first client render can never disagree —
 * the React #418 seam this module kills) sees 'full'; immediately after
 * hydration React reconciles against the real client snapshot and re-renders if
 * it differs, then OS/override changes stream in via onMotionChange.
 */
export function useMotion(): Motion {
  return useSyncExternalStore(onMotionChange, getMotion, () => 'full');
}

// --- module init (client only, once per session) -----------------------------
if (typeof window !== 'undefined') {
  // Seed/refresh the attribute at module eval: normally a no-op (the pre-paint
  // script already stamped the same value), but it self-heals any page that
  // reached this module without the stamp.
  applyMotion(computeMotion());
  // THE one shared OS listener. With a manual override set, an OS flip leaves
  // the computed value unchanged and applyMotion no-ops — override wins.
  window.matchMedia?.(OS_QUERY).addEventListener('change', () => {
    applyMotion(computeMotion());
  });
  // ClientRouter swaps replace <html>'s attributes with the incoming (static)
  // document's, which carries no data-motion — re-stamp before the page paints.
  document.addEventListener('astro:after-swap', () => {
    applyMotion(computeMotion());
  });
}
