// ===========================================================================
// presentationClock.ts — THE single lifecycle clock.
//
// THE PROBLEM THIS SEAM SOLVES: the hero used to run on TWO clocks. The scene
// engine (createScene) eased its morph toward the raw scroll target each frame,
// so WHAT WAS ON SCREEN lagged the scrollbar, while every DOM consumer — the
// manifesto text bands, the HUD scroll-spy, the arc gauge, the star-marker beat
// gate — read the RAW scroll value, and the two could disagree by a chapter.
//
// THE SEAM: every consumer reads the SAME values from this one clock. Each
// island (HeroIsland, ArticleScene) owns ONE PresentationClock; the scene
// engine and every DOM consumer sample it, so the canvas and the chrome cannot
// disagree by construction (worst case: one frame of rAF skew).
//
//   raw scroll (ScrollTracker) ──targets──▶ PresentationClock ──values──▶ engine
//                                              │                         DOM text
//                                              └── subscribe ──────────▶ HUD / markers
//
// THE CLOCK NO LONGER EASES. Scrolling used to feel hijacked: an exponential
// follow-ease (damped further by per-scene "dwell") made the presentation chase
// the scrollbar instead of tracking it. The values now track their targets 1:1
// on every tick — equivalent to the old reduced-motion `follow = 1` path — for
// everyone, and dwell has no effect. `settling`/`moving` semantics are kept for
// consumers: with 1:1 tracking the clock is on target the moment it ticks, so
// `moving` is always false after a tick and every tick reports `snapped`.
//
// The clock still carries PROGRESS and STAGE as two parallel scalars — the
// progress→stage curve is discontinuous (the band 7→8 stage jump 2.05→1.05 is
// authored data), and the caller owns the mapping. Do not "simplify" this to a
// single scalar.
//
// This module is browser-facing (rAF, performance.now) but the advance math is
// a pure method (`tick`) driven by an injected timestamp, so tests can step it
// deterministically without an animation loop.
// ===========================================================================
import { clamp01 } from './scroll';

/** The presentation state for one frame. */
export interface PresentationState {
  /** Scroll progress in RAW scroll space (0..1). What the camera and all
   *  progress-keyed DOM (beat bands, gauge rotation) should render. */
  progress: number;
  /** Shader stage (0..5). What the morph and stage-keyed readouts render. */
  stage: number;
  /** True while the values are still chasing their targets. With 1:1 tracking
   *  the clock lands on target every tick, so this is always false post-tick;
   *  kept so consumers' settling semantics are unchanged. */
  moving: boolean;
  /** True on a tick that SNAPPED to target — with 1:1 tracking that is every
   *  tick, so consumers that track frame-to-frame deltas (streak direction
   *  latches) always treat a frame as rest, not motion. */
  snapped: boolean;
}

/** The raw targets the clock tracks, sampled once per tick. */
export interface PresentationTargets {
  /** Raw scroll progress (0..1). */
  progress: number;
  /** Shader stage for that progress (the caller owns the mapping — the hero
   *  maps via the scene table; an article maps via its authored journey). */
  stage: number;
}

export interface PresentationClockOptions {
  /** Retained for API compatibility: tracking is now instant (1:1) for
   *  everyone, so reduced motion no longer changes the clock's behavior. */
  reduced?: boolean;
  /** Retained for API compatibility: dwell no longer damps anything — the
   *  clock tracks its targets 1:1 regardless. */
  dwellFor?: (rawProgress: number) => number;
}

type Listener = (state: PresentationState) => void;

export class PresentationClock {
  private readonly listeners = new Set<Listener>();
  private state: PresentationState;
  private startedAt: number | null = null;
  private lastTick = -1;
  private rafId: number | null = null;
  private readonly onFrame = (): void => {
    this.rafId = null;
    this.tick(performance.now());
    if (this.state.moving) this.schedule();
  };

  constructor(
    private readonly getTargets: () => PresentationTargets,
    _options: PresentationClockOptions = {},
  ) {
    const t = this.getTargets();
    this.state = {
      progress: clamp01(t.progress),
      stage: t.stage,
      moving: false,
      snapped: true,
    };
  }

  /** Current state without advancing. The engine reads this each frame. */
  get current(): PresentationState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Begin self-driving. Seeds the state on the CURRENT targets (so the first
   *  frame lands wherever scroll already is). Idempotent. */
  start(): void {
    if (this.startedAt !== null) return;
    this.startedAt = typeof performance !== 'undefined' ? performance.now() : 0;
    this.wake();
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.startedAt = null;
  }

  /** The targets changed (a scroll event landed): make sure the loop is
   *  running so the next tick picks them up. Cheap to call on every sample. */
  wake(): void {
    if (this.startedAt === null) return; // not started (or already stopped)
    this.schedule();
  }

  /**
   * Advance once for frame `now` (ms). Pure state-machine step — the rAF
   * driver calls it, and tests can call it directly with fabricated
   * timestamps. Multiple calls with the SAME timestamp are no-ops, so an
   * external caller can never double-advance a frame.
   *
   * Tracking is 1:1: the state lands EXACTLY on the raw targets every tick
   * (no follow-ease, no dwell damping), so `moving` is always false after a
   * tick and every tick is `snapped`.
   */
  tick(now: number): PresentationState {
    if (now === this.lastTick) return this.state;
    this.lastTick = now;

    const targets = this.getTargets();
    const progress = clamp01(targets.progress);
    const stage = targets.stage;

    const changed =
      progress !== this.state.progress || stage !== this.state.stage;
    this.state = { progress, stage, moving: false, snapped: true };
    if (changed) {
      for (const fn of this.listeners) fn(this.state);
    }
    return this.state;
  }

  private schedule(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(this.onFrame);
  }
}
