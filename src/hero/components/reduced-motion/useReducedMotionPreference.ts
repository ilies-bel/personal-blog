// Resolved reduced-motion preference — the single source of truth shared by the
// hero's mount decision (live WebGL vs poster slideshow) and the corner toggle.
//
//     resolvedReduced = manualOverride ?? osPreference
//
// A manual choice (the corner toggle) always wins and PERSISTS in localStorage;
// with no manual choice the OS `prefers-reduced-motion: reduce` is the default.
// The OS media query is still observed, but an OS change only moves the resolved
// value when there is no manual override. SSR-safe: every window/localStorage
// touch is guarded, defaulting to OS=false on the server.
import { useCallback, useEffect, useState } from 'react';
import { prefersReducedMotion } from '../../lib/config';
import { REDUCED_MOTION_STORAGE_KEY } from '../../lib/constants';

/** Read the persisted manual override, or null when the visitor has never set
 *  one (→ fall back to the OS preference). SSR- and private-mode-safe. */
function readManualOverride(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(REDUCED_MOTION_STORAGE_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  } catch {
    // Private mode / disabled storage — behave as if no override was set.
    return null;
  }
}

/** Persist the manual override. Best-effort: a storage failure must never throw. */
function writeManualOverride(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(REDUCED_MOTION_STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    // Private mode / disabled storage — the in-memory state still drives this session.
  }
}

/**
 * SYNCHRONOUS resolve of the reduced-motion preference, read straight from the
 * client environment (persisted manual override, else the live OS media query).
 *
 * Why it exists: HeroIsland's mount effect uses this to gate the heavy
 * `createScene` import. Under `client:visible` the island is SSR'd first (window
 * undefined → false), so the hook's React `reduced` state can be a stale false on
 * the first client render and only flip true in a post-mount effect — long enough
 * for the effect to have built and torn down a WebGL canvas. Reading the real
 * value synchronously means no scene is ever created when the resolved preference
 * is reduced. SSR-safe (window guarded → false).
 */
export function resolveReducedMotionNow(): boolean {
  return readManualOverride() ?? prefersReducedMotion();
}

/** The resolved reduced-motion preference + a setter that records a manual choice. */
export interface ReducedMotionPreference {
  /** resolvedReduced = manualOverride ?? osPreference. */
  reduced: boolean;
  /** Whether the resolved value comes purely from the OS (no manual override set
   *  yet) — drives the one-time "your system requested this" explanation. */
  fromOsOnly: boolean;
  /** Record a manual override (wins over OS) and persist it. */
  setReduced: (value: boolean) => void;
}

/**
 * Own the resolved reduced-motion preference for the lifetime of the hero island.
 * Seeds from the persisted manual override or, failing that, the OS preference;
 * keeps listening to the OS media query so an OS flip updates the default when
 * there is no manual override. `setReduced` records an explicit manual override.
 */
export function useReducedMotionPreference(): ReducedMotionPreference {
  // Track the manual override and the live OS preference separately so the
  // resolved value (override ?? os) recomputes cleanly when either moves.
  //
  // HYDRATION-STABLE BOOT: both states are initialised to the server-safe
  // defaults (null / false) rather than reading from localStorage / matchMedia
  // via a lazy initialiser. The lazy-initialiser form ran on the client's
  // hydration render and returned real values (e.g. true for an OS
  // prefers-reduced-motion: reduce visitor), which disagreed with the
  // server-rendered markup (always null / false) and triggered React hydration
  // error #418. Using static defaults makes the first client render
  // byte-identical to the server render; the reconciliation useEffect below
  // syncs the real preference immediately after hydration completes.
  const [override, setOverride] = useState<boolean | null>(null);
  const [osReduced, setOsReduced] = useState<boolean>(false);

  // Reconcile after hydration: read the real localStorage override and the live
  // OS media query now that we are in a client-only execution context. This
  // fires once, immediately after the first paint, so the resolved value
  // reaches its true state before any user interaction.
  useEffect(() => {
    setOverride(readManualOverride());
    setOsReduced(prefersReducedMotion());
  }, []);

  // Observe the OS media query. Since the resolved value reads `override ??
  // osReduced`, updating osReduced only changes the result when there is no manual
  // override — exactly the "OS change updates the default only" rule.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => setOsReduced(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const reduced = override ?? osReduced;
  const fromOsOnly = override === null && osReduced;

  const setReduced = useCallback((value: boolean): void => {
    writeManualOverride(value);
    setOverride(value);
  }, []);

  return { reduced, fromOsOnly, setReduced };
}
