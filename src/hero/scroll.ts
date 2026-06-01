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

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Tracks window scroll progress and notifies subscribers on a rAF-throttled
 * basis. One instance per page is plenty; the BlackHole island owns it.
 */
export class ScrollTracker {
  private readonly listeners = new Set<Listener>();
  private state: ScrollState;
  private rafPending = false;
  private readonly onScroll = (): void => this.schedule();
  private readonly onResize = (): void => this.schedule();

  constructor(private readonly stageCount: number) {
    this.state = { progress: 0, stageF: 0, stageCount };
  }

  /** Begin listening to scroll/resize. Returns the current state immediately. */
  start(): ScrollState {
    this.measure();
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize, { passive: true });
    return this.state;
  }

  stop(): void {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
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
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
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
