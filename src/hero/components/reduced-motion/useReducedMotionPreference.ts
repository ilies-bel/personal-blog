// Resolved reduced-motion preference — the single source of truth shared by the
// hero's mount decision (live WebGL vs poster slideshow) and the corner toggle.
//
//     resolvedReduced = manualOverride ?? osPreference
//
// A manual choice (the corner toggle) always wins and PERSISTS in localStorage;
// with no manual choice the OS `prefers-reduced-motion: reduce` is the default.
// All reads and writes go through the centralized motion-preference service
// (src/lib/motionPreference.ts), which also owns the `bh:motion-preference-change`
// custom event and the `<html data-reduced-motion>` CSS attribute.
import { useCallback, useEffect, useState } from 'react';
import {
  MOTION_CHANGE_EVENT,
  getManualOverride,
  getOsPreference,
  resolveMotionPreference,
  setManualOverride,
} from '../../../lib/motionPreference';

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
  return resolveMotionPreference();
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
 * subscribes to the centralized `bh:motion-preference-change` event so OS flips
 * and manual overrides propagate live without a reload. `setReduced` records an
 * explicit manual override via the service (writes localStorage + broadcasts).
 */
export function useReducedMotionPreference(): ReducedMotionPreference {
  // Track the manual override and the live OS preference separately so the
  // resolved value (override ?? os) recomputes cleanly when either moves, and the
  // `fromOsOnly` signal stays accurate.
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

  useEffect(() => {
    // Reconcile after hydration: read the real localStorage override and the live
    // OS media query now that we are in a client-only execution context.
    setOverride(getManualOverride());
    setOsReduced(getOsPreference());

    // Subscribe to the centralized service event so any future change — OS flip,
    // manual override from this tab or another tab, or re-broadcast on SPA
    // navigation — keeps both slices in sync. This replaces the old dedicated
    // matchMedia listener (and the storage event listener that was missing).
    const onMotionChange = (): void => {
      setOverride(getManualOverride());
      setOsReduced(getOsPreference());
    };
    window.addEventListener(MOTION_CHANGE_EVENT, onMotionChange);
    return () => window.removeEventListener(MOTION_CHANGE_EVENT, onMotionChange);
  }, []);

  const reduced = override ?? osReduced;
  const fromOsOnly = override === null && osReduced;

  // Delegate to the service: writes localStorage, updates the root attribute,
  // and broadcasts to all subscribers on this page (including this hook, which
  // will receive the event and update override / osReduced accordingly).
  const setReduced = useCallback((value: boolean): void => {
    setManualOverride(value);
    // Optimistically update local state too so the hero re-renders before the
    // event round-trip (the event will fire synchronously, but this makes the
    // intent explicit and avoids a one-tick lag on slow loops).
    setOverride(value);
  }, []);

  return { reduced, fromOsOnly, setReduced };
}
