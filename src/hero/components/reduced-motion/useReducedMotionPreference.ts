// Resolved reduced-motion preference — a thin hero-flavored facade over the ONE
// sitewide motion module (src/lib/motion.ts), which owns the pre-paint
// <html data-motion> attribute, the persisted manual override, and the single
// OS matchMedia listener:
//
//     resolvedReduced = manualOverride ?? osPreference
//
// A manual choice (the corner toggle) always wins and PERSISTS in localStorage;
// with no manual choice the OS reduced-motion preference is the default. An OS
// change only moves the resolved value when there is no manual override (the
// module computes override-first). This facade keeps the hero's boolean-shaped
// API (reduced / fromOsOnly / setReduced) so its consumers stay unchanged.
import { useCallback, useEffect, useState } from 'react';
import {
  getMotion,
  getMotionOverride,
  setMotionOverride,
  useMotion,
  type Motion,
} from '../../../lib/motion';

/**
 * SYNCHRONOUS resolve of the reduced-motion preference — a thin wrapper over
 * getMotion() (the <html data-motion> attribute the pre-paint script stamped).
 *
 * Why it exists: HeroIsland's mount effect uses this to gate the heavy
 * `createScene` import. Under `client:visible` the island is SSR'd first, so the
 * hook's React `reduced` value is 'full' on the hydration render by design (that
 * is what matches the server HTML) — long enough, if the effect trusted it, to
 * have built and torn down a WebGL canvas. Reading the real value synchronously
 * means no scene is ever created when the resolved preference is reduced.
 * SSR-safe (falls back to false on the server).
 */
export function resolveReducedMotionNow(): boolean {
  return getMotion() === 'reduced';
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
 * The resolved reduced-motion preference for the lifetime of the hero island.
 * The value itself comes live from the motion module (useMotion — hydration-safe
 * and subscribed to OS changes); this hook only adds the hero-specific override
 * bookkeeping (`fromOsOnly`) and the boolean setter the corner toggle calls.
 */
export function useReducedMotionPreference(): ReducedMotionPreference {
  const motion = useMotion();

  // Track the manual override so fromOsOnly (override unset + reduced resolved)
  // recomputes when the toggle writes one. Seeded null (the server value) and
  // reconciled post-mount — localStorage is only readable on the client, and the
  // one-time OS explanation this gates fires from a post-mount effect anyway.
  const [override, setOverride] = useState<Motion | null>(null);
  useEffect(() => {
    setOverride(getMotionOverride());
  }, []);

  const setReduced = useCallback((value: boolean): void => {
    const next: Motion = value ? 'reduced' : 'full';
    setMotionOverride(next);
    setOverride(next);
  }, []);

  const reduced = motion === 'reduced';
  const fromOsOnly = override === null && reduced;

  return { reduced, fromOsOnly, setReduced };
}
