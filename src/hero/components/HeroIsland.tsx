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
import { useCallback, useEffect, useRef, useState } from 'react';
// Astro's SPA navigation (ClientRouter). Used by the dive action to swap to the
// destination article at the bloom apex with no reload flash. The import is from
// the virtual 'astro:transitions/client' module — present because BaseLayout now
// mounts <ClientRouter />.
import { navigate } from 'astro:transitions/client';
import { ScrollTracker } from '../scroll';
import { SCROLL_SECTION_COUNT, BUILT_STAGES } from '../beats';
import { legacyStageForProgress } from '../timeline';
import { hudIdForStage, resolve } from '../lifecycleMachine';
import { MARKER_PLACEMENTS, type HudTargetId } from '../HudNavigation';
import { sceneForProgress } from '../sceneTable';
import { prefersReducedMotion, detectDeviceTier } from '../lib/config';
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
  readDebugNumber,
} from '../lib/constants';
// createScene (and, transitively, three.js + GPUComputationRenderer + UnrealBloom
// + every rig + the ~1800-line shader) is imported DYNAMICALLY inside the mount
// effect below — not statically here — so the ~200 KB-gzip engine lands in its own
// async chunk that is fetched only after the page shell + the instant intro loader
// have painted. A static import would fold the whole engine into this island's
// initial bundle and block first paint. Only the TYPE is imported eagerly (types
// are erased at build time, so this costs nothing at runtime). See the effect.
import type { SceneHandle, MarkerFrame } from '../scene/types';
import { SceneStateProvider } from './SceneStateContext';
import HeroIdentity from './HeroIdentity';
import ManifestoOverlay from './ManifestoOverlay';
import ExplorationHud from './ExplorationHud';
import StarMarker from './StarMarker';
import YellowStarRing from './YellowStarRing';

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

// BRIGHT-ZONE bands in shader-stage space (the same 0..5 coordinate `resolve().stage`
// returns). The hero chrome reads warm bone over the dark states and flips to a dark
// graphite stroke over these two bright beats so it stays legible against the bleached
// canvas:
//   • SUPERNOVA whiteout flash — the breakout sits at stage ~0.5 (segments 8/9 sweep
//     1.05 → 0.32 through it); a band around it covers the blinding frames.
//   • YELLOW STAR — the settled gold holds flat at stage 2.88 (segments 4/5); a band
//     around it covers the bright photosphere beat.
// Defined as data, so the two beats and their soft edges read in one place.
const BRIGHT_STAGE_BANDS: ReadonlyArray<readonly [number, number]> = [
  [0.35, 0.78], // supernova whiteout flash
  [2.6, 3.02], // bright yellow-star beat (settled gold + ignition into it)
];

function isBrightZoneStage(stage: number): boolean {
  return BRIGHT_STAGE_BANDS.some(([lo, hi]) => stage >= lo && stage <= hi);
}

// Internal lifecycle scene id -> the public art-direction data-scene name. The CSS
// per-scene HUD token blocks + the yellow-star designed-ring overlay key off these
// public names so the celestial chapters read clearly in the markup.
const DATA_SCENE_BY_ID: Record<HudTargetId, 'blackhole' | 'red-giant' | 'yellow-star' | 'nebula' | 'final'> = {
  end: 'blackhole',
  red: 'red-giant',
  yellow: 'yellow-star',
  nebula: 'nebula',
  beginning: 'final',
};

export default function HeroIsland({ backdrop = false, backdropStage = BUILT_STAGES }: HeroIslandProps = {}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Frame-cadence marker data from the scene (position of the star object in CSS px).
  // Written every rAF by the scene's onMarkerFrame callback; read by StarMarker on
  // its own rAF loop. Never triggers React re-renders — that is the whole point.
  const markerFrameRef = useRef<MarkerFrame | null>(null);
  // The live scene handle, stashed so the dive action can call beginDive() on it
  // outside the mount effect. Null until the engine chunk resolves (and cleared on
  // unmount) — the action falls back to a plain SPA nav while it is null.
  const sceneHandleRef = useRef<SceneHandle | null>(null);
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
    // Coarse 'high' | 'low' device tier, detected once at mount (memoized inside).
    // Threaded into createScene so the low-end fallback (fewer particles, capped DPR,
    // no bloom, no gravity bake) is chosen up front; 'high' is byte-identical to today.
    const tier = detectDeviceTier();

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
      void import('../scene/createScene').then(({ createScene }) => {
        if (cancelled) return;
        disposeRef = createScene(host, isReduced, { getStage: pinnedStage }, tier);
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
      // HUD activation REQUEST: once the REAL scroll position reaches the PHYSICAL
      // BOTTOM of the page (under the reverse arc that is the lonely pale-blue-dot /
      // 'beginning' scene), the island asks the boot FSM to power the HUD on (and asks
      // it to power off again when scroll leaves) — preserving the "you've reached the
      // end, here's the menu" feel. It does NOT touch body.hud-active itself — the FSM
      // owns that class so the loader → ignite sequence is sequenced in exactly one
      // place. We dispatch only on the at-bottom EDGE (ref-tracked) so the request fires
      // once per transition, never every scroll sample. The FSM decides what to honour:
      // it suppresses the scroll power-off while the corner override (body.hud-forced)
      // is engaged and keeps the HUD lit once booted, so the island can dispatch freely.
      // CONTENT UNLOCK (raw 88-100%): arm the HUD across the whole pale-dot/content
      // band, not just the last frame. The 'beginning' SCENE owns lifecycle 0.00-0.12
      // = raw 88-100% exactly (segment 1 in the RE-TIMED table), so gate on the SCENE
      // id rather than the stage>=4.7 threshold (which only fired at raw=1.0). The
      // stage-threshold hudIdForStage stays the scroll-spy source for the rail below.
      const atEnd = sceneForProgress(progressRef.current).sceneId === 'beginning';
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
    void import('../scene/createScene').then(({ createScene }) => {
      if (cancelled) return;
      const dispose = createScene(host, isReduced, {
        getStage,
        getProgress,
        getDwell,
        getFocusTarget: () => null,
        isExplorationMode: () => explorationModeRef.current,
        onMarkerFrame: (m) => { markerFrameRef.current = m; },
      }, tier);
      disposeRef = dispose;
      // Stash the handle so the dive action (beginDive, below) can reach the live
      // scene outside this effect. Cleared on unmount in the cleanup return.
      sceneHandleRef.current = dispose;
      // Bridge the scene's red-giant hit-test to the standalone custom cursor (which
      // can't import scene/three code). Published on window under the __bh* hook
      // convention; deleted on unmount so other pages never see a stale closure.
      window[CURSOR_WINDOW_KEYS.hitGiant] = dispose.hitTestGiant;
    });

    // ROOT-CAUSE FIX for the occasional ClientRouter SPA stall on this page. The hero
    // runs a heavy ~1.2M-point GPU render loop; ClientRouter swaps the DOM on a
    // navigation (the dive marker OR any plain nav-pill link), and the destination
    // article immediately mounts a SECOND client:only WebGL backdrop scene. Left
    // running, the home loop renders straight through the swap prep and starves the
    // view-transition on the main thread — the swap can stall for seconds. Pausing the
    // render loop the instant ClientRouter begins the swap (`astro:before-swap`, which
    // fires before the DOM is replaced) hands the main thread to the transition, so it
    // completes promptly. We pause (not dispose) here: GL teardown still happens on the
    // React unmount the swap triggers. Registered for EVERY navigation away from the
    // hero, so it fixes plain header nav too, not just the dive. Removed on unmount.
    const onBeforeSwap = (): void => {
      sceneHandleRef.current?.pauseRendering?.();
    };
    document.addEventListener('astro:before-swap', onBeforeSwap);
    return () => {
      cancelled = true;
      document.removeEventListener('astro:before-swap', onBeforeSwap);
      unsub();
      tracker.stop();
      sceneHandleRef.current = null;
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
      document.body.classList.remove(SCROLLED_BODY_CLASS, HUD_BOOTING_BODY_CLASS);
    };
  }, [backdrop, backdropStage, motionPreferenceVersion]);

  // The dive action published to StarMarker via SceneStateProvider. Flies the live
  // camera into the star (the scene owns the geometry + the white-overlay strength),
  // then SPA-navigates to the destination at the bloom apex (onApex). If the engine
  // chunk hasn't resolved yet, it degrades to a plain SPA navigation — the marker is
  // never a dead link. Stable identity (useCallback, no deps) so the context value
  // doesn't churn the marker tree.
  const beginDive = useCallback((opts: { href: string; targetNdc?: { x: number; y: number }; state?: HudTargetId }) => {
    const handle = sceneHandleRef.current;
    // PURE SPA navigation — no hard-reload fallback. The former 700ms
    // `window.location.assign` band-aid papered over a real stall: the heavy ~1.2M-point
    // render loop kept rendering while ClientRouter prepared the view-transition swap
    // (and the destination immediately spins up a SECOND client:only WebGL backdrop),
    // starving the swap on the main thread. That is now fixed at the ROOT — the mount
    // effect pauses this scene's render loop on `astro:before-swap` (see the effect
    // above) so the swap runs unobstructed — so navigation is a clean `navigate()` with
    // NO full page reload and no white-flash gap. This is also the path when the engine
    // never mounted (still SPA via navigate, just without the geometric plunge).
    const goTo = (href: string): void => {
      void navigate(href);
    };
    if (!handle || typeof handle.beginDive !== 'function') {
      goTo(opts.href);                          // engine not ready → straight nav
      return;
    }
    // The persisted soft-veil bloom overlay (in BaseLayout — a radial bloom, not a
    // full-white sheet). The scene ramps its opacity per frame via onDiveProgress (and
    // caps the peak well under 1, so this is the single mirror — no extra scaling here);
    // on the destination page a page-load handler eases it back out for the "resurface".
    // A sessionStorage flag tells that handler we arrived via a dive (so a normal nav
    // doesn't get the resurface animation).
    const overlay = document.querySelector<HTMLElement>('[data-dive-overlay]');
    try { sessionStorage.setItem('bh:dive', '1'); } catch { /* private mode — skip */ }
    if (overlay) {
      // PER-STATE BLOOM TINT: the colour is owned by CSS — hero.css maps
      // [data-bloom-state="…"] to a per-state --bloom-* token (nebula→cool, yellow→gold,
      // red→ember, beginning→pale-cool, end→warm bone). Set it BEFORE the opacity ramps
      // so the very first frame already wears the right hue (the overlay is
      // transition:persist'ed, so the resurface handler clears it on arrival to keep a
      // later normal nav from inheriting a stale tint). Absent state → default tint.
      if (opts.state) overlay.dataset.bloomState = opts.state;
      else delete overlay.dataset.bloomState;
      // BLOOM ORIGIN: glow from where the marker WAS, not always screen-centre. Convert
      // the marker NDC to viewport % for the radial-gradient centre (hero.css reads
      // --bloom-x/--bloom-y, defaulting to 50% 50% when unset). Mirrors the camera aim
      // so the veil radiates from the clicked speck.
      if (opts.targetNdc) {
        const px = (opts.targetNdc.x * 0.5 + 0.5) * 100;
        const py = (1 - (opts.targetNdc.y * 0.5 + 0.5)) * 100;
        overlay.style.setProperty('--bloom-x', `${px}%`);
        overlay.style.setProperty('--bloom-y', `${py}%`);
      }
    }
    handle.beginDive({
      targetNdc: opts.targetNdc,
      state: opts.state,
      onDiveProgress: (s) => { if (overlay) overlay.style.opacity = String(s); },
      onApex: () => { goTo(opts.href); },
    });
  }, []);

  const base = import.meta.env.BASE_URL ?? '/';
  // Scroll-spy: the HUD target the live scroll position maps to. Derived from the
  // same forward-progress to shader-stage expression the scene uses.
  const lifecycleStage = resolve(progress).stage;
  const scrollHudId: HudTargetId | null = explorationMode
    ? hudIdForStage(lifecycleStage)
    : null;
  // Adaptive dark stroke: is the chrome currently over a BRIGHT lifecycle zone? Two
  // bright beats bleach the canvas behind the warm-bone chrome — the supernova flash
  // (shader stage ~0.5, the breakout) and the bright yellow-star hold (settled gold at
  // stage ~2.88). Derived purely from the shader stage already tracked here (no extra
  // scroll read). Over the dark states (black hole / red giant / nebula / dot) this is
  // false → warm bone. The provider hands it down; the CSS [data-zone] flips the tokens.
  const brightZone = isBrightZoneStage(lifecycleStage);
  // The lifecycle scene the live scroll position is ON (same pure resolver the HUD /
  // beats use). Drives the per-scene HUD colour tokens (data-scene below) and the
  // yellow-star designed-ring overlay.
  const sceneId = sceneForProgress(progress).sceneId;
  const dataScene = DATA_SCENE_BY_ID[sceneId];

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
      state={{ progress, direction, reduced, explorationMode, scrollHudId, sceneId, dataScene, brightZone, base }}
      actions={{ beginDive }}
    >
      {/* data-zone="bright" over the supernova flash + yellow-star beat flips the
          chrome tokens to a dark graphite stroke (see hud.css [data-zone]); warm bone
          everywhere else. data-scene names the active celestial chapter so the per-scene
          HUD colour tokens (hero.css [data-scene]) give each chapter its own emotional
          temperature. Both swaps are CSS-transitioned so they ease, never pop. */}
      <div
        className="bh-root"
        data-exploring={explorationMode}
        data-zone={brightZone ? 'bright' : 'dark'}
        data-scene={dataScene}
      >
        <div className="bh-stage" ref={hostRef} aria-hidden="true" />
        <YellowStarRing />
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
