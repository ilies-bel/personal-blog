// HeroIsland — the React shell that mounts the black-hole hero scene.
//
// It owns the canvas host element, the scroll tracker, the mount/unmount
// lifecycle, and the cross-cutting runtime state. Frame-cadence values that must
// NOT trigger React renders are kept as refs; render-relevant snapshots are
// published through SceneStateProvider and consumed by the presentational
// sub-components (HeroIdentity / ManifestoOverlay / ScrollHint). The HUD keeps its
// own prop interface, fed from the same state.
//
// The three.js scene (renderer, rigs, GLSL, the per-frame loop) lives in
// ../scene/createScene; the timeline + copy live in ../beats (shared with
// index.astro's SSR fallback).
import { useEffect, useRef, useState } from 'react';
import { ScrollTracker } from '../scroll';
import { SCROLL_SECTION_COUNT, BUILT_STAGES } from '../beats';
import { legacyStageForProgress } from '../timeline';
import { hudIdForStage, MARKER_PLACEMENTS, type HudTargetId } from '../HudNavigation';
import { prefersReducedMotion } from '../lib/config';
import {
  SCROLLED_BODY_CLASS,
  SCROLL_DOWN,
  SCROLL_UP,
  type ScrollDirection,
  DIRECTION_DEADZONE,
  CHROME_HIDE_AT,
  SCROLL_HINT_DISMISS_AT,
  DEBUG_WINDOW_KEYS,
  CURSOR_WINDOW_KEYS,
  readDebugNumber,
} from '../lib/constants';
import { createScene } from '../scene/createScene';
import type { MarkerFrame } from '../scene/types';
import { SceneStateProvider } from './SceneStateContext';
import HeroIdentity from './HeroIdentity';
import ManifestoOverlay from './ManifestoOverlay';
import ExplorationHud from './ExplorationHud';
import ScrollHint from './ScrollHint';
import StarMarker from './StarMarker';

declare global {
  interface Window {
    /** Published by the live hero (this component) so the standalone custom-cursor
     *  IIFE can ask whether a screen point is over the red giant's surface — the
     *  cursor shows its interactive hexagon there. Absent on pages without the
     *  scrollable hero (about, ...). Key literal = CURSOR_WINDOW_KEYS.hitGiant. */
    __bhHitGiant?: (clientX: number, clientY: number) => boolean;
  }
}

interface HeroIslandProps {
  /** Backdrop mode: render only the scene canvas (no manifesto beats, no chrome,
   *  no scroll subscription) pinned to a fixed lifecycle frame. Used by reading
   *  pages (about, ...) that want the signature object as a dimmed, static backdrop
   *  behind their copy — the same room as the hero, pushed back. */
  backdrop?: boolean;
  /** The lifecycle frame to pin in backdrop mode, in getStage transition-space
   *  (0 = black hole, 3.5 = the smoky-blue nebula). The nebula is the calmest,
   *  coolest, most on-palette still, so reading copy sits over atmosphere, not a
   *  hot disk. */
  backdropStage?: number;
}

// React only needs a perceptual scroll snapshot for DOM copy/chrome. The scene
// render loop reads exact progress from progressRef, so this gate cuts context
// churn while still giving the shortest manifesto fade band ~20 samples.
const REACT_PROGRESS_MIN_DELTA = 1 / 2000;

function crossedProgressThreshold(previous: number, next: number, threshold: number): boolean {
  return (previous < threshold && next >= threshold) || (previous >= threshold && next < threshold);
}

export default function HeroIsland({ backdrop = false, backdropStage = BUILT_STAGES }: HeroIslandProps = {}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Frame-cadence marker data from the scene (position of the star object in CSS px).
  // Written every rAF by the scene's onMarkerFrame callback; read by StarMarker on
  // its own rAF loop. Never triggers React re-renders — that is the whole point.
  const markerFrameRef = useRef<MarkerFrame | null>(null);
  // Exact scroll progress (0..1) drives the morph through a ref the render loop
  // reads. React receives a lower-frequency visual snapshot for DOM overlays.
  const progressRef = useRef(0);
  const publishedProgressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  // Scroll direction is still published for components that support direction-
  // specific copy; the current forward lifecycle uses matching lines both ways.
  const lastProgressRef = useRef(0);
  const [direction, setDirection] = useState<ScrollDirection>(SCROLL_DOWN);
  const [reduced, setReduced] = useState(false);
  const [motionPreferenceVersion, setMotionPreferenceVersion] = useState(0);
  // The star-navigation rail is always visible (no scroll gate). Initialised on
  // so the HUD shows from the top of the page through to the bottom.
  const [explorationMode] = useState(true);
  const explorationModeRef = useRef(true);
  // Whether the opening chrome (name + menu) is currently shown. Tracked in a ref
  // so the scroll callback only touches the DOM on an actual transition.
  const chromeVisibleRef = useRef(true);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => setMotionPreferenceVersion((version) => version + 1);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

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

    // Drive the opening chrome (name + top-right menu) from a single source of
    // truth: it is shown at the very top OR whenever the HUD is present. The HUD
    // appears at the bottom and stays, so reusing its status keeps the name and
    // menu pinned alongside it (no separate scroll threshold to drift). Tracked
    // through chromeVisibleRef so the DOM is only touched on an actual transition.
    const syncChrome = (): void => {
      const visible = progressRef.current < CHROME_HIDE_AT || explorationModeRef.current;
      if (visible === chromeVisibleRef.current) return;
      chromeVisibleRef.current = visible;
      document.body.classList.toggle(SCROLLED_BODY_CLASS, !visible);
    };
    const publishProgress = (nextProgress: number, force = false): void => {
      const previous = publishedProgressRef.current;
      const crossedHint = crossedProgressThreshold(previous, nextProgress, SCROLL_HINT_DISMISS_AT);
      const hudStageChanged = explorationModeRef.current
        && hudIdForStage(legacyStageForProgress(previous)) !== hudIdForStage(legacyStageForProgress(nextProgress));

      if (
        !force
        && Math.abs(nextProgress - previous) < REACT_PROGRESS_MIN_DELTA
        && !crossedHint
        && !hudStageChanged
        && nextProgress !== 0
        && nextProgress !== 1
      ) {
        return;
      }

      publishedProgressRef.current = nextProgress;
      setProgress(nextProgress);
    };

    const tracker = new ScrollTracker(SCROLL_SECTION_COUNT);
    const unsub = tracker.subscribe((scrollState) => {
      progressRef.current = scrollState.progress;
      publishProgress(scrollState.progress);
      // Direction from the delta, with a deadzone so tiny jitter doesn't flip it.
      const delta = scrollState.progress - lastProgressRef.current;
      if (delta > DIRECTION_DEADZONE) setDirection(SCROLL_DOWN);
      else if (delta < -DIRECTION_DEADZONE) setDirection(SCROLL_UP);
      lastProgressRef.current = scrollState.progress;
      // Cinematic chrome: the name (.bh-identity) and the top-right menu
      // (.overlay-blog, owned by the layout) belong to the opening frame only. Once
      // scroll leaves the top they fade away so the lifecycle scene plays
      // uninterrupted; they return at the top — and again once the HUD is present at
      // the bottom (syncChrome reuses the exploration status). A class on <body>
      // drives both (the menu lives outside this island).
      syncChrome();
    });
    const initial = tracker.start();
    progressRef.current = initial.progress;
    publishedProgressRef.current = initial.progress;
    lastProgressRef.current = initial.progress;
    setProgress(initial.progress);

    // One normalized forward progress value owns the public choreography. The
    // shader stage is a legacy implementation coordinate derived from it.
    const getStage = (): number => legacyStageForProgress(progressRef.current);
    const getProgress = (): number => progressRef.current;

    const dispose = createScene(host, isReduced, {
      getStage,
      getProgress,
      getFocusTarget: () => null,
      isExplorationMode: () => explorationModeRef.current,
      onMarkerFrame: (m) => { markerFrameRef.current = m; },
    });
    // Bridge the scene's red-giant hit-test to the standalone custom cursor (which
    // can't import scene/three code). Published on window under the __bh* hook
    // convention; deleted on unmount so other pages never see a stale closure.
    window[CURSOR_WINDOW_KEYS.hitGiant] = dispose.hitTestGiant;
    return () => {
      unsub();
      tracker.stop();
      delete window[CURSOR_WINDOW_KEYS.hitGiant];
      dispose();
      // Leave the body in a clean state if the island unmounts mid-scroll.
      document.body.classList.remove(SCROLLED_BODY_CLASS);
    };
  }, [backdrop, backdropStage, motionPreferenceVersion]);

  const base = import.meta.env.BASE_URL ?? '/';
  // Scroll-spy: the HUD target the live scroll position maps to. Derived from the
  // same forward-progress to shader-stage expression the scene uses.
  const scrollHudId: HudTargetId | null = explorationMode
    ? hudIdForStage(legacyStageForProgress(progress))
    : null;

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
      state={{ progress, direction, reduced, explorationMode, scrollHudId, base }}
      actions={{}}
    >
      <div className="bh-root" data-exploring={explorationMode}>
        <div className="bh-stage" ref={hostRef} aria-hidden="true" />
        <HeroIdentity />
        <ManifestoOverlay />
        {/* One marker per placement, all mounted at once. Each instance gates its
            own visibility on its state being the settled one (the nebula owns three;
            the others one each) — no mount/unmount thrash, lock ownership is
            per-marker via the placement id. */}
        {MARKER_PLACEMENTS.map((placement) => (
          <StarMarker key={placement.id} placement={placement} markerFrameRef={markerFrameRef} />
        ))}
        <ExplorationHud />
        <ScrollHint />
      </div>
    </SceneStateProvider>
  );
}
