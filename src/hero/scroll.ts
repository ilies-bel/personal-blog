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

// ===========================================================================
// MOBILE SCENE-PROGRESS DAMPER (ENG-007 / mobile-cut.md §5)
//
// Protects two lifecycle beats on mobile that a hard flick can skip entirely:
//   • Supernova (B1)  — the only narrative climax that fits in one viewport
//   • Finale (B8)     — the pale-blue-dot resolution
//
// The damper is a PURE function of (visualStage, rawStage, scrollVelocity).
// It lives here — the leaf scroll module — so the frame loop imports only one
// dependency and unit tests can exercise the math without touching the DOM.
//
// Contract:
//   • DOM scroll position is NEVER programmatically modified (no jacking).
//   • Below DAMP_VELOCITY_THRESHOLD the follower is passthrough (zero lag).
//   • Inside a zone at high velocity: per-frame advance is capped at maxDelta.
//   • After velocity drops < DAMP_VELOCITY_THRESHOLD: snap instantly to rawStage.
//   • Reduced motion: the caller passes rawStage for both visualStage and
//     rawStage so the damper always returns rawStage (zero latency).
// ===========================================================================

/** Lifecycle stage value at which the scroll track ends. */
export const STAGE_MAX = 5.0;

/** Number of CSS .scene-stage elements. Unchanged by the mobile cut. */
export const STAGE_COUNT = 6;

/**
 * Mobile-only: the number of viewport-heights the hero scroll track spans.
 * 6 stages × calc(8/6 × 100svh) = 8 × 100svh total.
 */
export const MOBILE_VIEWPORT_COUNT = 8;

/**
 * Pure: linear scroll-progress → lifecycle-stage mapping for mobile viewports.
 *
 * The desktop curve (sceneTable.ts `legacyStageForProgressFromTable`) is a
 * non-linear SEGMENTS curve that compresses some beats and expands others to
 * match an authored narrative pacing. On mobile the 8-viewport track is too
 * short for that compression to work — a beat that takes 2% of scroll distance
 * on desktop still takes 2% on a mobile track that is only 800svh, which is
 * under one viewport-height. The linear map distributes ALL beats evenly across
 * the 8 viewports (one lifecycle-stage-unit per viewport, 5/8 per viewport).
 *
 * The direction seam (LIFECYCLE_DIRECTION = 'reverse') is NOT applied here
 * because the desktop SEGMENTS curve was authored from DOT→BLACK HOLE and relies
 * on the 1-p reversal in `lifecycleProgress()` to play BLACK HOLE→DOT. The
 * linear mobile curve is authored the other way (progress 0 = black hole, 1 =
 * end of dot beat), so no reversal is needed.
 *
 * Caller: the frame loop in HeroIsland passes this instead of
 * `legacyStageForProgress` when `window.innerWidth <= 767`.
 *
 * @param progress - raw scroll progress (0 = hero top / black hole, 1 = hero bottom / dot)
 */
export function mobileLifecycleStage(progress: number): number {
  return clamp01(progress) * STAGE_MAX;
}

/** Scroll velocity (viewport-heights per second) above which damping engages.
 *  A deliberate flick will comfortably exceed this; a careful drag won't. */
export const DAMP_VELOCITY_THRESHOLD = 1.5;

/** Supernova damping zone — protects the nova flash at stage 0.62 (§5.1). */
export const SUPERNOVA_DAMP_ZONE = {
  lo: 0.40,
  hi: 0.90,
  /** Maximum allowed visual-stage advance per 60 fps frame. */
  maxDelta: 0.018,
} as const;

/** Finale damping zone — protects the pale-blue-dot reveal (§5.2). */
export const FINALE_DAMP_ZONE = {
  lo: 4.30,
  hi: 5.00,
  /** Maximum allowed visual-stage advance per 60 fps frame. */
  maxDelta: 0.015,
} as const;

/**
 * Pure: advance `visualStage` toward `rawStage`, capping the per-frame delta
 * inside the two declared damping zones when `|scrollVelocityVpPerS|` exceeds
 * `DAMP_VELOCITY_THRESHOLD`.
 *
 * Called once per animation frame by the frame loop BEFORE `lifecycle()`.
 * Reduced-motion callers pass `rawStage` as both arguments so the result is
 * always `rawStage` (zero latency path).
 *
 * @param visualStage  - last frame's damped lifecycle stage (0..STAGE_MAX)
 * @param rawStage     - this frame's undamped lifecycle stage (0..STAGE_MAX)
 * @param scrollVelocityVpPerS - signed scroll velocity in viewport-heights/s
 */
export function advanceVisualStage(
  visualStage: number,
  rawStage: number,
  scrollVelocityVpPerS: number,
): number {
  // Below the velocity threshold → passthrough. Preserves direct-manipulation
  // feel for users who scroll slowly; also covers the snap-after-stop case.
  if (Math.abs(scrollVelocityVpPerS) <= DAMP_VELOCITY_THRESHOLD) return rawStage;

  // Determine which zone (if any) rawStage is inside.
  let maxDelta = Infinity;
  if (rawStage >= SUPERNOVA_DAMP_ZONE.lo && rawStage <= SUPERNOVA_DAMP_ZONE.hi) {
    maxDelta = SUPERNOVA_DAMP_ZONE.maxDelta;
  } else if (rawStage >= FINALE_DAMP_ZONE.lo && rawStage <= FINALE_DAMP_ZONE.hi) {
    maxDelta = FINALE_DAMP_ZONE.maxDelta;
  }

  // Outside all zones → passthrough (zero lag).
  if (maxDelta === Infinity) return rawStage;

  // Inside a zone → clamp the per-frame delta.
  const delta = rawStage - visualStage;
  return visualStage + Math.max(-maxDelta, Math.min(maxDelta, delta));
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
