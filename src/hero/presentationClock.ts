// ===========================================================================
// presentationClock.ts — THE single eased lifecycle clock.
//
// THE PROBLEM THIS SEAM SOLVES: the hero used to run on TWO clocks. The scene
// engine (createScene) eased its morph toward the raw scroll target each frame
// (a follow-lerp, damped further by the active scene's dwell), so WHAT WAS ON
// SCREEN lagged the scrollbar by design. But every DOM consumer — the manifesto
// text bands, the HUD scroll-spy, the arc gauge, the star-marker beat gate —
// read the RAW scroll value. Scroll fast and the two clocks separated by up to
// a whole chapter: the rail highlighted NEBULA while the canvas still showed
// the red giant, and beat copy appeared before/after the body it narrates.
//
// THE SEAM: the ease now lives HERE, once. Each island (HeroIsland,
// ArticleScene) owns ONE PresentationClock; the scene engine and every DOM
// consumer read the SAME eased values from it. The engine no longer eases
// anything — it is a pure sampler of the clock — so the canvas and the chrome
// cannot disagree by construction (worst case: one frame of rAF skew).
//
//   raw scroll (ScrollTracker) ──targets──▶ PresentationClock ──eased──▶ engine
//                                              │                        DOM text
//                                              └── subscribe ─────────▶ HUD / markers
//
// The clock eases PROGRESS and STAGE as two parallel scalars — exactly as the
// engine used to — because the progress→stage curve is discontinuous (the band
// 7→8 stage jump 2.05→1.05 is authored data): easing progress and re-mapping
// would snap the stage across the jump, while easing the stage directly glides
// it. Do not "simplify" this to a single eased scalar.
//
// This module is browser-facing (rAF, performance.now) but the advance math is
// a pure method (`tick`) driven by an injected timestamp, so tests can step it
// deterministically without an animation loop.
// ===========================================================================
import { clamp01 } from './scroll';

/** The eased presentation state for one frame. */
export interface PresentationState {
  /** Eased scroll progress in RAW scroll space (0..1). What the camera and all
   *  progress-keyed DOM (beat bands, gauge rotation) should render. */
  progress: number;
  /** Eased shader stage (0..5). What the morph and stage-keyed readouts render. */
  stage: number;
  /** True while the eased values are still chasing their targets. */
  moving: boolean;
  /** True on a tick that SNAPPED to target (the settle window after start()) —
   *  consumers that track frame-to-frame deltas (streak direction latches) can
   *  treat a snapped frame as rest, not motion. */
  snapped: boolean;
}

/** The raw (un-eased) targets the clock chases, sampled once per tick. */
export interface PresentationTargets {
  /** Raw scroll progress (0..1). */
  progress: number;
  /** Shader stage for that progress (the caller owns the mapping — the hero
   *  maps via the scene table; an article maps via its authored journey). */
  stage: number;
}

export interface PresentationClockOptions {
  /** Reduced motion: the ease is instant (follow = 1) so the presentation is
   *  byte-identical to the raw scroll — nothing to linger on, fully accessible. */
  reduced?: boolean;
  /** The active scene's dwell strength (0..1) for a RAW progress value; damps
   *  the follow so dwelling beats feel stickier. Absent = no dwell (0). */
  dwellFor?: (rawProgress: number) => number;
}

type Listener = (state: PresentationState) => void;

// Base follow factor of the exponential ease (fraction of the remaining gap
// closed per frame). 0.28 is the value the engine always used; dwell damps it
// down to a 0.1 floor. See createScene's former ease block — the numbers moved
// here verbatim so the feel is unchanged.
const BASE_FOLLOW = 0.28;
const DWELL_DAMP = 0.6;
const FOLLOW_FLOOR = 0.1;
// Convergence epsilon: once BOTH gaps are inside it the clock lands EXACTLY on
// target and parks (the old engine ease asymptoted forever; landing exactly is
// what lets the self-driving loop rest at zero CPU).
const REST_EPS = 1e-4;
// SETTLE SNAP — land on the restored scroll state, don't animate into it. The
// page mounts while window.scrollY may still be 0; the browser applies scroll
// RESTORATION a beat later. For this window after start() the clock snaps
// straight to target so a late-restored position is absorbed instantly instead
// of gliding the whole lifecycle up from the top ("fast-forward" bug).
const SETTLE_SNAP_MS = 250;

export class PresentationClock {
  private readonly listeners = new Set<Listener>();
  private readonly reduced: boolean;
  private readonly dwellFor: ((rawProgress: number) => number) | null;
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
    options: PresentationClockOptions = {},
  ) {
    this.reduced = options.reduced === true;
    this.dwellFor = options.dwellFor ?? null;
    const t = this.getTargets();
    this.state = {
      progress: clamp01(t.progress),
      stage: t.stage,
      moving: false,
      snapped: true,
    };
  }

  /** Current eased state without advancing. The engine reads this each frame. */
  get current(): PresentationState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Begin self-driving. Seeds the eased state on the CURRENT targets (so the
   *  first frame lands wherever scroll already is) and opens the settle-snap
   *  window. Idempotent. */
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
   *  running so the ease chases them. Cheap to call on every scroll sample. */
  wake(): void {
    if (this.startedAt === null) return; // not started (or already stopped)
    this.schedule();
  }

  /**
   * Advance the ease once for frame `now` (ms). Pure state-machine step — the
   * rAF driver calls it, and tests can call it directly with fabricated
   * timestamps. Multiple calls with the SAME timestamp are no-ops, so an
   * external caller can never double-advance a frame.
   */
  tick(now: number): PresentationState {
    if (now === this.lastTick) return this.state;
    this.lastTick = now;

    const targets = this.getTargets();
    const progressTarget = clamp01(targets.progress);
    const stageTarget = targets.stage;

    const inSnapWindow =
      this.startedAt !== null && now - this.startedAt < SETTLE_SNAP_MS;

    let progress: number;
    let stage: number;
    let snapped = false;
    if (this.reduced || inSnapWindow) {
      // Reduced motion: instant, always. Settle window: absorb scroll
      // restoration without a glide.
      progress = progressTarget;
      stage = stageTarget;
      snapped = true;
    } else {
      const dwell = clamp01(this.dwellFor ? this.dwellFor(progressTarget) : 0);
      const follow = Math.max(FOLLOW_FLOOR, BASE_FOLLOW * (1 - DWELL_DAMP * dwell));
      progress = this.state.progress + (progressTarget - this.state.progress) * follow;
      stage = this.state.stage + (stageTarget - this.state.stage) * follow;
      // Land exactly once both gaps are imperceptible, so the loop can rest.
      if (
        Math.abs(progressTarget - progress) < REST_EPS &&
        Math.abs(stageTarget - stage) < REST_EPS
      ) {
        progress = progressTarget;
        stage = stageTarget;
      }
    }

    const moving = progress !== progressTarget || stage !== stageTarget;
    const changed =
      progress !== this.state.progress || stage !== this.state.stage;
    this.state = { progress, stage, moving, snapped };
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
