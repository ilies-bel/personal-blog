// ===========================================================================
// scroll.ts — a single source of truth for "how far down the page are we".
//
// The home page is one tall scroll track (see index.astro: .scene-track holds N
// full-viewport stages). The pinned BlackHole scene reads a normalized scroll
// progress from here and maps it onto the stellar lifecycle. Keeping the read in
// one place means the three.js frame loop and any DOM copy stay perfectly in
// lockstep — they sample the same number, computed once per scroll/resize.
//
// progress: 0 at the very top, 1 at the bottom of the scrollable range.
// stageF:   progress * stageCount — the floating "which stage are we in" value
//           (e.g. 1.5 = halfway between stage 1 and stage 2).
// ===========================================================================

export interface ScrollState {
  /** 0 at top of page, 1 at the bottom of the scroll range. */
  progress: number;
  /** progress scaled to [0, stageCount]; the fractional part is the morph t. */
  stageF: number;
  /** Total number of lifecycle stages the track is divided into. */
  stageCount: number;
}

type Listener = (s: ScrollState) => void;

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// ===========================================================================
// LIFECYCLE DIRECTION SEAM
//
// The single seam that decides whether the stellar lifecycle plays FORWARD
// (top = pale blue dot) or in REVERSE (top = the big black hole you land on).
// It lives HERE — the leaf scroll module with no imports — rather than in
// timeline.ts so that sceneTable.ts (the pure data layer) can read it WITHOUT
// importing timeline.ts. That import was the one edge in the
// sceneTable ⇄ timeline cycle; routing this single function through the leaf
// breaks the cycle, so a server-rendered consumer (BaseLayout's sub-nav, which
// imports HUD_NAV_ITEMS from sceneTable) no longer hits a TDZ
// ("Cannot access 'HUD_NAV_ITEMS' before initialization") during the Astro
// prerender. timeline.ts RE-EXPORTS both names, so its existing importers
// (ManifestoOverlay, HudNavigation) are unchanged.
// ===========================================================================
export type LifecycleDirection = 'normal' | 'reverse';
export const LIFECYCLE_DIRECTION: LifecycleDirection = 'reverse';

/** Map the raw scroll value (0..1, increases scrolling down) to the value the
 *  lifecycle renderer consumes. Normal = identity; reverse = mirror. This is the
 *  ONLY place direction is applied — keep it the single seam. */
export function lifecycleProgress(userScrollProgress: number): number {
  const p = clamp01(userScrollProgress);
  return LIFECYCLE_DIRECTION === 'reverse' ? 1 - p : p;
}

export function segment(globalProgress: number, start: number, end: number): number {
  if (end === start) return globalProgress >= end ? 1 : 0;
  return clamp01((globalProgress - start) / (end - start));
}

export function band(progress: number, start: number, end: number): number {
  return progress >= start && progress <= end ? 1 : 0;
}

export function fadeInOut(
  progress: number,
  inStart: number,
  inEnd: number,
  outStart: number,
  outEnd: number,
): number {
  return segment(progress, inStart, inEnd) * (1 - segment(progress, outStart, outEnd));
}

/**
 * Tracks window scroll progress and notifies subscribers on a rAF-throttled
 * basis. One instance per page is plenty; the BlackHole island owns it.
 */
export class ScrollTracker {
  private readonly listeners = new Set<Listener>();
  private state: ScrollState;
  private rafId: number | null = null;
  private active = false;
  private readonly onScroll = (): void => this.schedule();
  private readonly onResize = (): void => this.schedule();

  constructor(private readonly stageCount: number) {
    this.state = { progress: 0, stageF: 0, stageCount };
  }

  /** Begin listening to scroll/resize. Returns the current state immediately. */
  start(): ScrollState {
    this.active = true;
    this.measure();
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize, { passive: true });
    return this.state;
  }

  stop(): void {
    this.active = false;
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Current state without re-measuring (e.g. for the render loop). */
  get current(): ScrollState {
    return this.state;
  }

  private schedule(): void {
    if (this.rafId !== null || !this.active) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (!this.active) return;
      this.measure();
    });
  }

  private measure(): void {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const progress = clamp01(window.scrollY / max);
    const stageF = progress * this.stageCount;
    this.state = { progress, stageF, stageCount: this.stageCount };
    for (const fn of this.listeners) fn(this.state);
  }
}
