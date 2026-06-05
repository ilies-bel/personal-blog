// ===========================================================================
// BlackHole.tsx — the React island that mounts the black-hole hero scene.
//
// The three.js scene (renderer, rigs, GLSL, the per-frame loop) lives in
// ./scene and ./shaders; this file is the thin React shell: it owns the canvas
// host element, the scroll tracker, the manifesto overlay + HUD chrome, and the
// mount/unmount lifecycle. See ./scene/createScene for the scene controller and
// ./beats for the timeline + copy (shared with index.astro's SSR fallback).
// ===========================================================================
import { useEffect, useRef, useState } from 'react';
import { ScrollTracker } from './scroll';
import { BEATS, STAGE_COUNT, BUILT_STAGES } from './beats';
import HudNavigation, { HUD_NAV_BY_ID, type HudTargetId } from './HudNavigation';
import { prefersReducedMotion } from './lib/config';
import {
  SCROLLED_BODY_CLASS,
  HUD_SELECTED_STORAGE_KEY,
  SCROLL_DOWN,
  SCROLL_UP,
  type ScrollDirection,
  type BeatEdge,
  DIRECTION_DEADZONE,
  CHROME_HIDE_AT,
  EXPLORATION_TRIGGER_AT,
  EXPLORATION_REVEAL_DELAY_MS,
  BEAT_HOLD,
  BEAT_FADE,
  DEBUG_WINDOW_KEYS,
  readDebugNumber,
} from './lib/constants';
import { createScene } from './scene/createScene';

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

// Per-beat opacity: a trapezoid centred on `at` — ramp in, hold across a flat
// top, ramp out — so neighbouring beats cross-dissolve. `edge` pins the open side
// so the first/last beats never leave a dead band at the page extremes: 'leading'
// holds full opacity before the centre (the opening black-hole beat sits at the
// very top), 'trailing' holds it after (so the closing pale-blue-dot beat stays
// reachable all the way to the bottom).
function beatOpacity(progress: number, at: number, edge?: BeatEdge): number {
  if (edge === 'leading' && progress <= at) return 1;
  if (edge === 'trailing' && progress >= at) return 1;
  const distance = Math.abs(progress - at);
  if (distance <= BEAT_HOLD) return 1;
  if (distance >= BEAT_HOLD + BEAT_FADE) return 0;
  return clamp01((BEAT_HOLD + BEAT_FADE - distance) / BEAT_FADE);
}

// ---------------------------------------------------------------------------
//  Public component — a thin React shell that owns the canvas container, the
//  scroll tracker, and the manifesto overlay.
// ---------------------------------------------------------------------------
interface BlackHoleProps {
  /** Backdrop mode: render only the scene canvas (no manifesto beats, no chrome,
   *  no scroll subscription) pinned to a fixed lifecycle frame. Used by reading
   *  pages (about, …) that want the signature object as a dimmed, static backdrop
   *  behind their copy — the same room as the hero, pushed back. */
  backdrop?: boolean;
  /** The lifecycle frame to pin in backdrop mode, in getStage transition-space
   *  (0 = black hole … 5 = the smoky-blue nebula at the end of the rewind). The
   *  nebula is the calmest, coolest, most on-palette still — cobalt room, no warm
   *  sphere — so reading copy sits over atmosphere, not a hot disk. */
  backdropStage?: number;
}

export default function BlackHole({ backdrop = false, backdropStage = 5 }: BlackHoleProps = {}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Live scroll progress (0..1) drives both the morph (via a ref the render loop
  // reads) and the manifesto opacities (via React state, updated on scroll).
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  // Scroll direction drives the big-line swap. 'down' is the default (rewind /
  // hopeful arc); 'up' swaps in the forward / tragic line. A small deadzone keeps
  // sub-pixel jitter from flipping it.
  const lastProgressRef = useRef(0);
  const [direction, setDirection] = useState<ScrollDirection>(SCROLL_DOWN);
  const [reduced, setReduced] = useState(false);
  const [explorationMode, setExplorationMode] = useState(false);
  const [previewHudId, setPreviewHudId] = useState<HudTargetId | null>(null);
  const [selectedHudId, setSelectedHudId] = useState<HudTargetId | null>(() => {
    try {
      const stored = localStorage.getItem(HUD_SELECTED_STORAGE_KEY);
      return stored && stored in HUD_NAV_BY_ID ? (stored as HudTargetId) : null;
    } catch {
      return null;
    }
  });
  const explorationModeRef = useRef(false);
  const explorationTimerRef = useRef<number | null>(null);
  const selectedHudRef = useRef<HudTargetId | null>(selectedHudId);
  const activeHudRef = useRef<HudTargetId | null>(selectedHudId);
  // Whether the opening chrome (name + menu) is currently shown. Tracked in a
  // ref so the scroll callback only touches the DOM on an actual transition.
  const chromeVisibleRef = useRef(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const isReduced = prefersReducedMotion();
    setReduced(isReduced);

    // Backdrop mode: no scroll, no morph timeline. The scene is pinned to a fixed
    // lifecycle frame and rendered as a static, dimmed atmosphere behind page
    // copy (reading pages). None of the scroll wiring, beat opacities, or the
    // `is-scrolled` chrome toggle apply here.
    if (backdrop) {
      const fallback = Math.min(BUILT_STAGES, Math.max(0, backdropStage));
      // window.__bhBackdropStage lets a capture script A/B the pinned frame live
      // (mirrors the home's __bhMorph debug hook). Defaults to the prop.
      const pinnedStage = (): number => {
        const override = readDebugNumber(DEBUG_WINDOW_KEYS.backdropStage);
        const value = typeof override === 'number' ? override : fallback;
        return Math.min(BUILT_STAGES, Math.max(0, value));
      };
      const dispose = createScene(host, isReduced, {
        getStage: pinnedStage,
      });
      return () => dispose();
    }

    const clearExplorationTimer = (): void => {
      if (explorationTimerRef.current == null) return;
      window.clearTimeout(explorationTimerRef.current);
      explorationTimerRef.current = null;
    };
    const openExploration = (): void => {
      explorationModeRef.current = true;
      setExplorationMode(true);
    };

    const tracker = new ScrollTracker(STAGE_COUNT);
    const unsub = tracker.subscribe((s) => {
      progressRef.current = s.progress;
      setProgress(s.progress);
      // Direction from the delta, with a deadzone so tiny jitter doesn't flip it.
      const delta = s.progress - lastProgressRef.current;
      if (delta > DIRECTION_DEADZONE) setDirection(SCROLL_DOWN);
      else if (delta < -DIRECTION_DEADZONE) setDirection(SCROLL_UP);
      if (explorationModeRef.current && selectedHudRef.current && Math.abs(delta) > DIRECTION_DEADZONE) {
        selectedHudRef.current = null;
        activeHudRef.current = null;
        setSelectedHudId(null);
        try { localStorage.removeItem(HUD_SELECTED_STORAGE_KEY); } catch { /* noop */ }
      }
      lastProgressRef.current = s.progress;
      // Cinematic chrome: the name (.bh-identity) and the top-right menu
      // (.overlay-blog, owned by the layout) belong to the opening frame only.
      // Once the scroll leaves the top they fade away so the lifecycle scene
      // plays uninterrupted; they return the moment you're back at the top. A
      // class on <body> drives both (the menu lives outside this island), with a
      // small threshold + hysteresis so a hair of jitter never flickers it.
      const top = s.progress < CHROME_HIDE_AT;
      if (top !== chromeVisibleRef.current) {
        chromeVisibleRef.current = top;
        document.body.classList.toggle(SCROLLED_BODY_CLASS, !top);
      }

      if (s.progress >= EXPLORATION_TRIGGER_AT) {
        if (!explorationModeRef.current && explorationTimerRef.current == null) {
          explorationTimerRef.current = window.setTimeout(() => {
            explorationTimerRef.current = null;
            openExploration();
          }, isReduced ? 0 : EXPLORATION_REVEAL_DELAY_MS);
        }
      } else if (!explorationModeRef.current) {
        clearExplorationTimer();
      }
    });
    const initial = tracker.start();
    progressRef.current = initial.progress;
    lastProgressRef.current = initial.progress;
    setProgress(initial.progress);

    // Lifecycle position over the scroll. Each stage is 1/STAGE_COUNT of the page;
    // the five transitions span stage 0→1, 1→2, ... 4→5. Clamp to the number of
    // transitions built so the bottom of the page holds the final state.
    const getStage = (): number => {
      const activeItem = explorationModeRef.current && !isReduced && activeHudRef.current
        ? HUD_NAV_BY_ID[activeHudRef.current]
        : null;
      return activeItem?.stage ?? Math.min(BUILT_STAGES, progressRef.current * STAGE_COUNT);
    };

    const dispose = createScene(host, isReduced, {
      getStage,
      getFocusTarget: () => activeHudRef.current,
      isExplorationMode: () => explorationModeRef.current,
    });
    return () => {
      clearExplorationTimer();
      unsub();
      tracker.stop();
      dispose();
      // Leave the body in a clean state if the island unmounts mid-scroll.
      document.body.classList.remove(SCROLLED_BODY_CLASS);
    };
  }, []);

  const base = import.meta.env.BASE_URL ?? '/';
  const activeHudId = explorationMode ? previewHudId ?? selectedHudId : null;

  const handleHudPreview = (id: HudTargetId): void => {
    if (!explorationModeRef.current) return;
    activeHudRef.current = id;
    setPreviewHudId(id);
  };

  const handleHudPreviewEnd = (): void => {
    setPreviewHudId(null);
    activeHudRef.current = selectedHudRef.current;
  };

  const handleHudActivate = (id: HudTargetId): void => {
    if (!explorationModeRef.current) return;
    selectedHudRef.current = id;
    activeHudRef.current = id;
    setPreviewHudId(null);
    setSelectedHudId(id);
    try { localStorage.setItem(HUD_SELECTED_STORAGE_KEY, id); } catch { /* noop */ }
  };

  const handleHudClearSelection = (): void => {
    selectedHudRef.current = null;
    activeHudRef.current = null;
    setPreviewHudId(null);
    setSelectedHudId(null);
    try { localStorage.removeItem(HUD_SELECTED_STORAGE_KEY); } catch { /* noop */ }
  };

  // Backdrop mode renders only the scene canvas — the reading page owns its own
  // chrome and copy, and dims this layer via CSS (.bh-backdrop).
  if (backdrop) {
    return (
      <div className="bh-root bh-root--backdrop">
        <div className="bh-stage bh-backdrop" ref={hostRef} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="bh-root" data-exploring={explorationMode}>
      <div className="bh-stage" ref={hostRef} aria-hidden="true" />

      {/* Persistent identity — fixed top-left across every beat. The sole
          top-left mark on the bare home (the small wordmark is hidden there). */}
      <a className="bh-identity" href={base.replace(/\/+$/, '') || '/'}>
        <span className="bh-identity-name">ILIÈS BELDJILALI</span>
        <span className="bh-identity-role">Software Engineer</span>
      </a>

      <div
        className="bh-overlay"
        data-exploring={explorationMode}
        style={{ opacity: explorationMode && !reduced ? 0 : undefined }}
      >
        {BEATS.map((beat, i) => {
          // Under reduced motion every beat is shown (so all copy is reachable);
          // otherwise the trapezoid fade reveals one beat at a time. The first and
          // last beats pin their outer edge so nothing goes blank at progress 0/1.
          const isLast = i === BEATS.length - 1;
          const edge = i === 0 ? 'leading' : isLast ? 'trailing' : undefined;
          const opacity = reduced ? 1 : beatOpacity(progress, beat.at, edge);
          const visible = opacity > 0.5;
          return (
            <div
              className="bh-beat"
              key={i}
              style={{ opacity }}
              aria-hidden={!reduced && !visible}
            >
              {/* Big line: both directions rendered, crossfaded by `direction`.
                  Under reduced motion both are shown stacked (no crossfade). */}
              <h2 className="bh-beat-big">
                <span
                  className="bh-beat-line bh-beat-line--down"
                  data-active={reduced || direction === 'down'}
                >
                  {beat.down}
                </span>
                <span
                  className="bh-beat-line bh-beat-line--up"
                  data-active={reduced || direction === 'up'}
                  aria-hidden={!reduced && direction !== 'up'}
                >
                  {beat.up}
                </span>
              </h2>

              <p className="bh-beat-whisper">
                <span className="bh-beat-state">{beat.state}</span>
                {beat.whisper}
              </p>
            </div>
          );
        })}
      </div>

      <HudNavigation
        visible={explorationMode}
        activeId={activeHudId}
        selectedId={selectedHudId}
        base={base}
        onPreview={handleHudPreview}
        onPreviewEnd={handleHudPreviewEnd}
        onActivate={handleHudActivate}
        onClearSelection={handleHudClearSelection}
      />

      {!reduced && progress < 0.02 && <p className="bh-hint">scroll to rewind ↓</p>}
    </div>
  );
}
