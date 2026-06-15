// magneticSettle.ts — Subtle "magnetic catch" that gently eases the viewport
// into the nearest scene centre when the visitor nearly stops scrolling near one.
//
// This is NOT scroll-jacking:
//   • No preventDefault on wheel / touchmove / any input event.
//   • The native window scroll (ScrollTracker reading window.scrollY) is ALWAYS
//     the source of truth — the settle only nudges a stationary page.
//   • window.scrollTo is used ONLY after IDLE_DELAY_MS of zero scroll movement,
//     and cancelled immediately on any fresh user input (wheel / touch / key).
//   • Disabled entirely under prefers-reduced-motion (caller passes `reduced`).
//
// A hard / fast flick carries past the capture zone before the idle timer fires,
// so it scrolls straight through unaffected — intent wins.
//
// Scene centres are derived from the SEGMENTS idle bands + lifecycleProgress()
// so LIFECYCLE_DIRECTION is honoured and they update whenever the table is
// re-timed. No hard-coded pixel offsets.

import { SEGMENTS, STARTS } from './sceneTable';
import { lifecycleProgress } from './timeline';
import { clamp01 } from './scroll';

// ---- Tuning knobs — adjust live in the browser ----------------------------
const IDLE_DELAY_MS = 150;   // scroll must be still this long before triggering
const CAPTURE_RADIUS = 0.08; // raw-progress tolerance around a scene centre (0..1)
const SETTLE_MS = 320;       // settle glide duration (ms)

function easeOutCubic(t: number): number {
  const c = clamp01(t);
  return 1 - (1 - c) ** 3;
}

// ---------------------------------------------------------------------------
// Derive raw-scroll centres (0..1) for every idle-phase segment.
// lifecycleProgress() handles direction so both 'normal' and 'reverse' work
// without a separate LIFECYCLE_DIRECTION import.
// ---------------------------------------------------------------------------
function deriveSceneCentres(): readonly number[] {
  // Probe direction: for 'reverse', lifecycleProgress(0) === 1.
  const isReverse = lifecycleProgress(0) === 1;
  const centres: number[] = [];
  for (let i = 0; i < SEGMENTS.length; i++) {
    if (SEGMENTS[i].phase !== 'idle') continue;
    // Lifecycle-space midpoint of the idle band:
    const lifecycleMid = (STARTS[i] + STARTS[i + 1]) / 2;
    // Convert to raw scroll progress:
    //   reverse → raw = 1 − lifecycle
    //   normal  → raw = lifecycle
    centres.push(clamp01(isReverse ? 1 - lifecycleMid : lifecycleMid));
  }
  return centres;
}

const SCENE_CENTRES: readonly number[] = deriveSceneCentres();

function nearestCentre(rawProgress: number): { centre: number; dist: number } {
  let best = SCENE_CENTRES[0];
  let bestDist = Math.abs(rawProgress - best);
  for (let i = 1; i < SCENE_CENTRES.length; i++) {
    const d = Math.abs(rawProgress - SCENE_CENTRES[i]);
    if (d < bestDist) { bestDist = d; best = SCENE_CENTRES[i]; }
  }
  return { centre: best, dist: bestDist };
}

export interface MagneticSettle {
  stop(): void;
}

/**
 * Activate the magnetic settle loop. Returns a disposer.
 *
 * @param getProgress  Read the current raw scroll progress (0..1); supplied by
 *                     HeroIsland so the settle shares the same source of truth.
 * @param reduced      True under prefers-reduced-motion — returns a no-op stub.
 */
export function createMagneticSettle(
  getProgress: () => number,
  reduced: boolean,
): MagneticSettle {
  // Under reduced motion: no rAF loop, no listeners, nothing.
  if (reduced) return { stop(): void {} };

  let isSettling = false;
  let animRaf = 0;
  let pollRaf = 0;

  // Settle animation state.
  let animStartAt = 0;
  let animFrom = 0;
  let animTo = 0;

  // Scroll-stability tracking for idle detection.
  let lastScrollY = window.scrollY;
  let stableAt = performance.now();

  const cancelSettle = (): void => {
    if (animRaf) { cancelAnimationFrame(animRaf); animRaf = 0; }
    isSettling = false;
  };

  // Fresh user gesture → cancel any in-progress settle, reset idle clock.
  const onUserInput = (): void => {
    stableAt = performance.now(); // reset: won't re-trigger for IDLE_DELAY_MS
    cancelSettle();
  };

  // All passive — we never call preventDefault.
  window.addEventListener('wheel',      onUserInput, { passive: true });
  window.addEventListener('touchstart', onUserInput, { passive: true });
  window.addEventListener('touchmove',  onUserInput, { passive: true });
  window.addEventListener('keydown',    onUserInput, { passive: true });

  /** Convert a normalised raw progress value to an absolute scrollY. */
  const toScrollY = (p: number): number => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    return clamp01(p) * max;
  };

  // Ease-out settle animation. Scroll events generated here are handled by
  // ScrollTracker normally; the settle module does not listen to 'scroll' so it
  // never cancels itself from its own movement.
  const animStep = (now: DOMHighResTimeStamp): void => {
    const elapsed = now - animStartAt;
    const t = easeOutCubic(Math.min(1, elapsed / SETTLE_MS));
    window.scrollTo(0, animFrom + (animTo - animFrom) * t);
    if (elapsed < SETTLE_MS) {
      animRaf = requestAnimationFrame(animStep);
    } else {
      window.scrollTo(0, animTo); // land exactly on centre
      isSettling = false;
      animRaf = 0;
    }
  };

  // Poll loop — runs every frame while the settle is active.
  const poll = (now: DOMHighResTimeStamp): void => {
    pollRaf = requestAnimationFrame(poll);

    if (isSettling) return; // a glide is already running

    // Update scroll-stability clock only when the page is actually moving.
    const currentY = window.scrollY;
    if (Math.abs(currentY - lastScrollY) > 0.5) {
      lastScrollY = currentY;
      stableAt = now;
    }

    // Not idle yet — keep waiting.
    if (now - stableAt < IDLE_DELAY_MS) return;

    const raw = getProgress();
    const { centre, dist } = nearestCentre(raw);

    // Skip if already at centre, or too far away for a subtle nudge.
    if (dist < 0.002 || dist > CAPTURE_RADIUS) return;

    // Both conditions met: trigger the settle glide toward the scene centre.
    animFrom  = window.scrollY;
    animTo    = toScrollY(centre);
    animStartAt = now;
    isSettling  = true;
    animRaf = requestAnimationFrame(animStep);
  };

  pollRaf = requestAnimationFrame(poll);

  return {
    stop(): void {
      cancelSettle();
      if (pollRaf) { cancelAnimationFrame(pollRaf); pollRaf = 0; }
      window.removeEventListener('wheel',      onUserInput);
      window.removeEventListener('touchstart', onUserInput);
      window.removeEventListener('touchmove',  onUserInput);
      window.removeEventListener('keydown',    onUserInput);
    },
  };
}
