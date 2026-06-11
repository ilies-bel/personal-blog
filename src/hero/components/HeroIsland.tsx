// HeroIsland — the React shell that mounts the black-hole hero scene.
//
// It owns the canvas host element, the scroll tracker, the mount/unmount
// lifecycle, and the cross-cutting runtime state. Frame-cadence values that must
// NOT trigger React renders are kept as refs; render-relevant snapshots are
// published through SceneStateProvider and consumed by the presentational
// sub-components (HeroIdentity / ManifestoOverlay). The HUD keeps its
// own prop interface, fed from the same state.
//
// The three.js scene (renderer, rigs, GLSL, the per-frame loop) lives in
// ../scene/createScene; the timeline + copy live in ../beats (shared with
// index.astro's SSR fallback).
import { useEffect, useRef, useState } from 'react';
import { ScrollTracker } from '../scroll';
import { SCROLL_SECTION_COUNT, BUILT_STAGES } from '../beats';
import { legacyStageForProgress } from '../timeline';
import { hudIdForStage, resolve } from '../lifecycleMachine';
import { MARKER_PLACEMENTS, type HudTargetId } from '../HudNavigation';
import { sceneActivatesHud } from '../sceneTable';
import { prefersReducedMotion } from '../lib/config';
import {
  SCROLLED_BODY_CLASS,
  HUD_BOOTING_BODY_CLASS,
  HUD_POWER_EVENT,
  type HudPowerEventDetail,
  SCROLL_DOWN,
  SCROLL_UP,
  type ScrollDirection,
  DIRECTION_DEADZONE,
  CHROME_HIDE_AT,
  SCROLL_HINT_DISMISS_AT,
  DEBUG_WINDOW_KEYS,
  CURSOR_WINDOW_KEYS,
  SCENE_READY_BODY_CLASS,
  WEBGL_UNAVAILABLE_BODY_CLASS,
  readDebugNumber,
} from '../lib/constants';
// createScene (and, transitively, three.js + GPUComputationRenderer + UnrealBloom
// + every rig + the ~1800-line shader) is imported DYNAMICALLY inside the mount
// effect below — not statically here — so the ~200 KB-gzip engine lands in its own
// async chunk that is fetched only after the page shell + the instant intro loader
// have painted. A static import would fold the whole engine into this island's
// initial bundle and block first paint. Only the TYPE is imported eagerly (types
// are erased at build time, so this costs nothing at runtime). See the effect.
import { isWebGLUnavailableError, type SceneHandle, type MarkerFrame } from '../scene/types';
import { SceneStateProvider } from './SceneStateContext';
import HeroIdentity from './HeroIdentity';
import ManifestoOverlay from './ManifestoOverlay';
import ExplorationHud from './ExplorationHud';
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

/**
 * Graceful no-WebGL / context-lost reveal. Two body classes, both idempotent:
 *   - SCENE_READY_BODY_CLASS lifts the instant intro loader RIGHT AWAY (when WebGL
 *     is detectably unavailable we know immediately, so we don't make the visitor
 *     wait out the 8s safety backstop in index.astro — that backstop still stands as
 *     the ultimate guarantee, this just fires faster). Without it the page would sit
 *     trapped behind the loader over a canvas that will never paint.
 *   - WEBGL_UNAVAILABLE_BODY_CLASS reveals the on-brand themed note (scene.css) and
 *     marks the page as the no-canvas variant. The manifesto copy + the section nav
 *     links are real, scroll-driven DOM that keep working with no canvas, so the
 *     conventional path stays fully usable; this just adds a short themed explanation.
 * SSR-safe: only ever called from the mount effect / a runtime event, never at module
 * load, but it still guards `document` defensively.
 */
function revealWithoutWebgl(): void {
  if (typeof document === 'undefined') return;
  document.body.classList.add(SCENE_READY_BODY_CLASS, WEBGL_UNAVAILABLE_BODY_CLASS);
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
  // Whether real scroll progress has reached the black hole (bottom hero). When
  // this flips, the island REQUESTS a HUD power change (dispatches HUD_POWER_EVENT)
  // rather than owning body.hud-active itself — the boot FSM in BaseLayout is the
  // single owner of the HUD body classes now. Ref-tracked so the request fires only
  // on the actual at-end transition, not every scroll sample. The FSM honours the
  // forced override + the once-booted-stays-powered rule, so the island can dispatch
  // freely and let the machine decide.
  const hudAtEndRef = useRef(false);

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

    // The three.js engine is loaded lazily (dynamic import) so it never blocks first
    // paint. Because the import resolves on a later microtask, the effect can be torn
    // down (Strict-Mode double-invoke, fast route change, motion-preference re-run)
    // BEFORE createScene exists. We track that with `cancelled` and stash the eventual
    // dispose in `disposeRef`: cleanup disposes whatever has been created so far, and
    // a late-arriving createScene that finds `cancelled` set disposes itself at once.
    let cancelled = false;
    let disposeRef: SceneHandle | null = null;

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
      void import('../scene/createScene')
        .then(({ createScene }) => {
          if (cancelled) return;
          disposeRef = createScene(host, isReduced, { getStage: pinnedStage });
        })
        .catch((error: unknown) => {
          // Backdrop mode is the dimmed atmosphere behind a reading page's own copy —
          // there is no home loader / manifesto / fallback note to reveal here. So we
          // only SWALLOW the failure (no unhandled rejection): a missing-WebGL backdrop
          // (or a chunk-load error) simply leaves this layer blank while the page's real
          // content stays fully usable. The typed narrowing keeps the WebGL case
          // distinguishable for any future per-case handling.
          void isWebGLUnavailableError(error);
        });
      return () => {
        cancelled = true;
        disposeRef?.();
      };
    }

    // Drive the opening chrome (name + top-right menu) from a single source of
    // truth: it is shown at the very top OR whenever the HUD is present. The HUD
    // appears at the bottom and stays, so reusing its status keeps the name and
    // menu pinned alongside it (no separate scroll threshold to drift). Tracked
    // through chromeVisibleRef so the DOM is only touched on an actual transition.
    const syncChrome = (): void => {
      // HUD activation REQUEST: once the REAL scroll position reaches the bottom hero
      // (the black hole / 'end' stage), the island asks the boot FSM to power the HUD
      // on (and asks it to power off again when scroll leaves). It does NOT touch
      // body.hud-active itself — the FSM owns that class so the loader → ignite
      // sequence is sequenced in exactly one place. We dispatch only on the at-end
      // EDGE (ref-tracked) so the request fires once per transition, never every
      // scroll sample. The FSM decides what to honour: it suppresses the scroll
      // power-off while the corner override (body.hud-forced) is engaged and keeps
      // the HUD lit once booted, so the island can dispatch freely.
      // Table-driven: ask the scene the scroll-spy maps to whether IT arms the HUD
      // (its `activatesHud` flag), instead of hardcoding `=== 'end'`. Only the 'end'
      // scene is flagged, so this fires on exactly the same edge as before — but the
      // "which scene arms the HUD" decision now lives on the scene, not in this if.
      const atEnd = sceneActivatesHud(hudIdForStage(resolve(progressRef.current).stage));
      if (atEnd !== hudAtEndRef.current) {
        hudAtEndRef.current = atEnd;
        window.dispatchEvent(
          new CustomEvent<HudPowerEventDetail>(HUD_POWER_EVENT, {
            detail: { on: atEnd, source: 'scroll' },
          }),
        );
      }

      const visible = progressRef.current < CHROME_HIDE_AT || explorationModeRef.current;
      if (visible === chromeVisibleRef.current) return;
      chromeVisibleRef.current = visible;
      document.body.classList.toggle(SCROLLED_BODY_CLASS, !visible);
    };
    const publishProgress = (nextProgress: number, force = false): void => {
      const previous = publishedProgressRef.current;
      const crossedHint = crossedProgressThreshold(previous, nextProgress, SCROLL_HINT_DISMISS_AT);
      const hudStageChanged = explorationModeRef.current
        && hudIdForStage(resolve(previous).stage) !== hudIdForStage(resolve(nextProgress).stage);

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
    // The active scene's dwell strength (0..1) for the live scroll position, read
    // from the same pure resolver everything else uses. createScene damps its morph
    // follow-ease by this so dwelling beats (red giant, black hole) feel stickier —
    // mirrors how getStage/getProgress flow into the scene. No scrollbar is touched.
    const getDwell = (): number => resolve(progressRef.current).dwell;

    // Pull in the three.js engine asynchronously, THEN build the scene. The scroll
    // tracker above is pure JS and stays synchronous, so scroll is wired the instant
    // the island hydrates; only the heavy GPU scene waits for its own chunk. The
    // tracker already snapshotted the initial scroll position, so createScene reads
    // the right stage/progress as soon as it arrives.
    void import('../scene/createScene')
      .then(({ createScene }) => {
        if (cancelled) return;
        const dispose = createScene(host, isReduced, {
          getStage,
          getProgress,
          getDwell,
          getFocusTarget: () => null,
          isExplorationMode: () => explorationModeRef.current,
          onMarkerFrame: (m) => { markerFrameRef.current = m; },
          // GPU context lost mid-session: the scene has already preventDefault'd and
          // paused its render loop. Reveal the on-brand fallback so the frozen canvas is
          // replaced by the usable scroll-driven DOM (manifesto + nav links), exactly
          // like the no-WebGL-at-mount path below. We do NOT auto-clear it on restore:
          // only the standard rigs recover on the live context, so we keep the note up
          // rather than risk showing a half-restored (GPGPU-less) scene.
          onContextLost: () => revealWithoutWebgl(),
        });
        disposeRef = dispose;
        // Bridge the scene's red-giant hit-test to the standalone custom cursor (which
        // can't import scene/three code). Published on window under the __bh* hook
        // convention; deleted on unmount so other pages never see a stale closure.
        window[CURSOR_WINDOW_KEYS.hitGiant] = dispose.hitTestGiant;
      })
      .catch((error: unknown) => {
        // The mount was torn down before the chunk resolved — nothing to reveal.
        if (cancelled) return;
        // WebGL unavailable at mount (createScene threw the typed error) → graceful,
        // on-brand fallback: lift the loader IMMEDIATELY (don't wait out the 8s safety
        // backstop) and show the themed "needs WebGL" note. The manifesto copy + the
        // section nav links are real, scroll-driven DOM that work with no canvas, so the
        // conventional path stays usable. A DIFFERENT failure (e.g. the engine chunk
        // failing to load) gets the SAME graceful reveal — a blank-but-usable page beats
        // a page trapped behind the loader on an unhandled rejection.
        void isWebGLUnavailableError(error);
        revealWithoutWebgl();
      });
    return () => {
      cancelled = true;
      unsub();
      tracker.stop();
      delete window[CURSOR_WINDOW_KEYS.hitGiant];
      // Dispose the scene if it has already been created; if the engine chunk is
      // still in flight, the `cancelled` guard above stops it from ever building.
      // (We dispose via disposeRef, not a `dispose` local, because createScene now
      // resolves inside the dynamic import's .then() and is out of scope here.)
      disposeRef?.();
      // Leave the body in a clean state if the island unmounts mid-scroll. We clear
      // ONLY the island-owned chrome class (is-scrolled) and the transient boot
      // class (hud-booting) — a half-finished loader must not survive an unmount.
      // We deliberately do NOT strip hud-active / hud-forced anymore: those are
      // owned by the boot FSM and mirrored to localStorage, so the persisted power
      // state is the source of truth across an SPA unmount/reload. Reset the
      // at-end edge tracker so a re-mount re-evaluates and re-requests from scratch.
      hudAtEndRef.current = false;
      // Also clear the no-WebGL fallback class so a fresh mount (e.g. a motion-preference
      // re-run, or an SPA return that re-creates the island) re-evaluates WebGL from a
      // clean slate instead of inheriting a stale "unavailable" note. If WebGL is still
      // unavailable the next mount simply re-adds it. (SCENE_READY stays owned by the
      // loader script — we never strip it here.)
      document.body.classList.remove(SCROLLED_BODY_CLASS, HUD_BOOTING_BODY_CLASS, WEBGL_UNAVAILABLE_BODY_CLASS);
    };
  }, [backdrop, backdropStage, motionPreferenceVersion]);

  const base = import.meta.env.BASE_URL ?? '/';
  // Scroll-spy: the HUD target the live scroll position maps to. Derived from the
  // same forward-progress to shader-stage expression the scene uses.
  const scrollHudId: HudTargetId | null = explorationMode
    ? hudIdForStage(resolve(progress).stage)
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
        <ExplorationHud markerFrameRef={markerFrameRef} />
      </div>
    </SceneStateProvider>
  );
}
