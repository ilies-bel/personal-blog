// HeroIsland — the React shell that mounts the black-hole hero scene.
//
// It owns the canvas host element, the scroll tracker, the mount/unmount
// lifecycle, and the cross-cutting runtime state. Frame-cadence values that must
// NOT trigger React renders are kept as refs; render-relevant snapshots are
// published through SceneStateProvider and consumed by the presentational
// sub-components (HeroIdentity / ManifestoOverlay / ScrollHint). The HUD keeps its
// own prop interface, fed from the same state + actions.
//
// The three.js scene (renderer, rigs, GLSL, the per-frame loop) lives in
// ../scene/createScene; the timeline + copy live in ../beats (shared with
// index.astro's SSR fallback).
import { useEffect, useRef, useState } from 'react';
import { ScrollTracker } from '../scroll';
import { STAGE_COUNT, BUILT_STAGES } from '../beats';
import { HUD_NAV_BY_ID, type HudTargetId } from '../HudNavigation';
import { prefersReducedMotion } from '../lib/config';
import {
  SCROLLED_BODY_CLASS,
  HUD_SELECTED_STORAGE_KEY,
  SCROLL_DOWN,
  SCROLL_UP,
  type ScrollDirection,
  DIRECTION_DEADZONE,
  CHROME_HIDE_AT,
  EXPLORATION_TRIGGER_AT,
  EXPLORATION_REVEAL_DELAY_MS,
  DEBUG_WINDOW_KEYS,
  readDebugNumber,
} from '../lib/constants';
import { createScene } from '../scene/createScene';
import { SceneStateProvider } from './SceneStateContext';
import HeroIdentity from './HeroIdentity';
import ManifestoOverlay from './ManifestoOverlay';
import ExplorationHud from './ExplorationHud';
import ScrollHint from './ScrollHint';

interface HeroIslandProps {
  /** Backdrop mode: render only the scene canvas (no manifesto beats, no chrome,
   *  no scroll subscription) pinned to a fixed lifecycle frame. Used by reading
   *  pages (about, …) that want the signature object as a dimmed, static backdrop
   *  behind their copy — the same room as the hero, pushed back. */
  backdrop?: boolean;
  /** The lifecycle frame to pin in backdrop mode, in getStage transition-space
   *  (0 = black hole … 5 = the smoky-blue nebula at the end of the rewind). The
   *  nebula is the calmest, coolest, most on-palette still, so reading copy sits
   *  over atmosphere, not a hot disk. */
  backdropStage?: number;
}

export default function HeroIsland({ backdrop = false, backdropStage = 5 }: HeroIslandProps = {}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Live scroll progress (0..1) drives both the morph (via a ref the render loop
  // reads) and the manifesto opacities (via React state, updated on scroll).
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  // Scroll direction drives the big-line swap; a small deadzone keeps sub-pixel
  // jitter from flipping it.
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
  // Whether the opening chrome (name + menu) is currently shown. Tracked in a ref
  // so the scroll callback only touches the DOM on an actual transition.
  const chromeVisibleRef = useRef(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const isReduced = prefersReducedMotion();
    setReduced(isReduced);

    // Backdrop mode: no scroll, no morph timeline. The scene is pinned to a fixed
    // lifecycle frame and rendered as a static, dimmed atmosphere behind page copy.
    if (backdrop) {
      const fallback = Math.min(BUILT_STAGES, Math.max(0, backdropStage));
      // window.__bhBackdropStage lets a capture script A/B the pinned frame live
      // (mirrors the home's __bhMorph debug hook). Defaults to the prop.
      const pinnedStage = (): number => {
        const override = readDebugNumber(DEBUG_WINDOW_KEYS.backdropStage);
        const value = typeof override === 'number' ? override : fallback;
        return Math.min(BUILT_STAGES, Math.max(0, value));
      };
      const dispose = createScene(host, isReduced, { getStage: pinnedStage });
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
    const unsub = tracker.subscribe((scrollState) => {
      progressRef.current = scrollState.progress;
      setProgress(scrollState.progress);
      // Direction from the delta, with a deadzone so tiny jitter doesn't flip it.
      const delta = scrollState.progress - lastProgressRef.current;
      if (delta > DIRECTION_DEADZONE) setDirection(SCROLL_DOWN);
      else if (delta < -DIRECTION_DEADZONE) setDirection(SCROLL_UP);
      if (explorationModeRef.current && selectedHudRef.current && Math.abs(delta) > DIRECTION_DEADZONE) {
        selectedHudRef.current = null;
        activeHudRef.current = null;
        setSelectedHudId(null);
        try { localStorage.removeItem(HUD_SELECTED_STORAGE_KEY); } catch { /* noop */ }
      }
      lastProgressRef.current = scrollState.progress;
      // Cinematic chrome: the name (.bh-identity) and the top-right menu
      // (.overlay-blog, owned by the layout) belong to the opening frame only. Once
      // scroll leaves the top they fade away so the lifecycle scene plays
      // uninterrupted; they return at the top. A class on <body> drives both (the
      // menu lives outside this island), with a threshold + hysteresis so a hair of
      // jitter never flickers it.
      const top = scrollState.progress < CHROME_HIDE_AT;
      if (top !== chromeVisibleRef.current) {
        chromeVisibleRef.current = top;
        document.body.classList.toggle(SCROLLED_BODY_CLASS, !top);
      }

      if (scrollState.progress >= EXPLORATION_TRIGGER_AT) {
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
    // the five transitions span stage 0→1 … 4→5. Clamp to the number of transitions
    // built so the bottom of the page holds the final state.
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
    <SceneStateProvider
      state={{ progress, direction, reduced, explorationMode, activeHudId, selectedHudId, base }}
      actions={{
        onHudPreview: handleHudPreview,
        onHudPreviewEnd: handleHudPreviewEnd,
        onHudActivate: handleHudActivate,
        onHudClearSelection: handleHudClearSelection,
      }}
    >
      <div className="bh-root" data-exploring={explorationMode}>
        <div className="bh-stage" ref={hostRef} aria-hidden="true" />
        <HeroIdentity />
        <ManifestoOverlay />
        <ExplorationHud />
        <ScrollHint />
      </div>
    </SceneStateProvider>
  );
}
