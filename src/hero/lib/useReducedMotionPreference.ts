// Resolved reduced-motion preference — the SINGLE source of truth shared by the
// hero's mount decision (live WebGL vs poster slideshow) and the corner toggle
// button. The resolved value is:
//
//     resolvedReduced = manualOverride ?? osPreference
//
// i.e. a MANUAL choice (the corner toggle) always wins and PERSISTS in
// localStorage across reloads + in-app navigations; with no manual choice the OS
// `prefers-reduced-motion: reduce` is the default. The OS media query is still
// observed, but an OS change only moves the resolved value when there is NO manual
// override (otherwise the user's explicit choice stands). SSR-safe: every
// window/localStorage touch is guarded, defaulting to OS=false on the server.
import { useCallback, useEffect, useState } from 'react';
import { prefersReducedMotion } from './config';
import { REDUCED_MOTION_STORAGE_KEY } from './constants';

/** Read the persisted manual override, or null when the visitor has never set
 *  one (→ fall back to the OS preference). SSR-safe + private-mode safe. */
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
 * client environment: the persisted manual override, or failing that the live OS
 * `prefers-reduced-motion` media query. Both are readable on the FIRST client render
 * (matchMedia + localStorage exist client-side), so this returns the TRUE resolved
 * value without waiting for the hook's post-mount reconcile effect.
 *
 * Why it exists: HeroIsland's scene-mount effect uses this to gate the heavy
 * `createScene` dynamic import. Under `client:visible` the island is server-rendered
 * first (window undefined → false), so the hook's React `reduced` state can be false
 * on the very first client render and only flip true in a post-mount effect — long
 * enough for the mount effect to have already imported + built a WebGL canvas that is
 * then torn down. Reading the real value synchronously here means NO scene is ever
 * created when the resolved preference is reduced. SSR-safe (window guarded → false).
 */
export function resolveReducedMotionNow(): boolean {
  return readManualOverride() ?? prefersReducedMotion();
}

/** The resolved reduced-motion preference + a toggle that records a manual choice. */
export interface ReducedMotionPreference {
  /** resolvedReduced = manualOverride ?? osPreference. */
  reduced: boolean;
  /** Flip the resolved value and persist it as the manual override (wins over OS). */
  toggle: () => void;
}

/**
 * Own the resolved reduced-motion preference for the lifetime of the hero island.
 * Seeds from the persisted manual override or, failing that, the OS preference;
 * keeps listening to the OS media query so an OS flip updates the default WHEN
 * there is no manual override. `toggle` records the opposite of the current
 * resolved value as a manual override (so the user's choice wins + persists).
 */
export function useReducedMotionPreference(): ReducedMotionPreference {
  // Track the manual override and the live OS preference separately so the
  // resolved value (override ?? os) recomputes cleanly when either moves. Both are
  // SSR-safe (default to null / false on the server, then reconcile after mount).
  const [override, setOverride] = useState<boolean | null>(() => readManualOverride());
  const [osReduced, setOsReduced] = useState<boolean>(() => prefersReducedMotion());

  // Reconcile after hydration: the server rendered with override=null / os=false,
  // but the real localStorage + OS values are only readable on the client. Run
  // once on mount so the resolved value matches the visitor's environment.
  useEffect(() => {
    setOverride(readManualOverride());
    setOsReduced(prefersReducedMotion());
  }, []);

  // Observe the OS media query. The resolved value reads `override ?? osReduced`,
  // so updating osReduced only changes the result WHEN there is no manual
  // override — exactly the "OS change updates the default only" rule. (This is the
  // single matchMedia listener; HeroIsland no longer keeps its own.)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => setOsReduced(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const reduced = override ?? osReduced;

  const toggle = useCallback((): void => {
    setOverride((current) => {
      const resolved = current ?? prefersReducedMotion();
      const next = !resolved;
      writeManualOverride(next);
      return next;
    });
  }, []);

  return { reduced, toggle };
}
