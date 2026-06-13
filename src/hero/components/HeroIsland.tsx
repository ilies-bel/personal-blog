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
import { resolve } from '../lifecycleMachine';
import { MARKER_PLACEMENTS, type HudTargetId } from '../HudNavigation';
import { sceneForProgress } from '../sceneTable';
import { detectDeviceTier } from '../lib/config';
import {
  SCROLLED_BODY_CLASS,
  AT_OPENING_BODY_CLASS,
  HUD_BOOTING_BODY_CLASS,
  HUD_POWER_EVENT,
  type HudPowerEventDetail,
  HUD_DOT_SOLO_HOLD_MS,
  SCROLL_DOWN,
  SCROLL_UP,
  type ScrollDirection,
  DIRECTION_DEADZONE,
  CHROME_HIDE_AT,
  SCROLL_HINT_DISMISS_AT,
  DEBUG_WINDOW_KEYS,
  CURSOR_WINDOW_KEYS,
  SCENE_READY_BODY_CLASS,
  LOADER_GONE_BODY_CLASS,
  WEBGL_UNAVAILABLE_BODY_CLASS,
  REDUCED_MOTION_EXPLAINED_STORAGE_KEY,
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
import YellowStarRing from './YellowStarRing';
import {
  PosterSlideshow,
  ReducedMotionToggle,
  ReducedMotionModal,
  type ReducedMotionModalMode,
  mountReducedMotionHero,
  useReducedMotionPreference,
  resolveReducedMotionNow,
} from './reduced-motion';

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
 * Graceful no-WebGL / context-lost reveal. Three body classes, all idempotent:
 *   - SCENE_READY_BODY_CLASS STARTS the instant intro loader's dissolve RIGHT AWAY
 *     (when WebGL is detectably unavailable we know immediately, so we don't make the
 *     visitor wait out the 8s safety backstop in index.astro — that backstop still
 *     stands as the ultimate guarantee, this just fires faster). Without it the page
 *     would sit trapped behind the loader over a canvas that will never paint.
 *   - LOADER_GONE_BODY_CLASS is the LATER gate the in-scene star markers + nav gate
 *     their interactivity on (StarMarker watches it; hud.css keys pointer-events off
 *     `body:not(.loader-gone)`). On the normal path index.astro's inline script sets
 *     it only after the dark loader layer's opacity fade COMPLETES — but on the
 *     no-WebGL path there is no scene/loader fade to wait on, so we set it HERE too.
 *     WITHOUT this the markers + conventional nav would stay INERT behind the gate,
 *     i.e. the no-canvas fallback content would be revealed but not usable. This is
 *     the critical bit that keeps the manifesto + section links clickable with no GL.
 *   - WEBGL_UNAVAILABLE_BODY_CLASS reveals the on-brand themed note (scene.css) and
 *     marks the page as the no-canvas variant. The manifesto copy + the section nav
 *     links are real, scroll-driven DOM that keep working with no canvas, so the
 *     conventional path stays fully usable; this just adds a short themed explanation.
 * SSR-safe: only ever called from the mount effect / a runtime event, never at module
 * load, but it still guards `document` defensively.
 */
function revealWithoutWebgl(): void {
  if (typeof document === 'undefined') return;
  document.body.classList.add(
    SCENE_READY_BODY_CLASS,
    LOADER_GONE_BODY_CLASS,
    WEBGL_UNAVAILABLE_BODY_CLASS,
  );
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
  // The RESOLVED reduced-motion preference (manual override ?? OS preference) and a
  // setter. This single value is the source of truth for BOTH the mount decision
  // below (live WebGL hero vs the still poster slideshow) AND the corner toggle — it
  // is threaded into the context state/actions so the button and the engine never
  // disagree. The hook owns the matchMedia listener, so HeroIsland keeps no
  // motion-preference effect of its own. `fromOsOnly` is true when the reduced state
  // comes purely from the OS (no manual override yet) — it gates the one-time
  // explanatory modal below.
  const { reduced, fromOsOnly, setReduced } = useReducedMotionPreference();
  // The reduced-motion modal: which copy to show, or null when closed.
  //   'confirm' — opened by a corner-toggle click that turns reduced motion ON.
  //   'explain' — opened once when reduced motion is active purely from the OS.
  const [rmModalMode, setRmModalMode] = useState<ReducedMotionModalMode | null>(null);
  // The star-navigation rail is always visible (no scroll gate). Initialised on
  // so the HUD shows from the top of the page through to the bottom.
  const [explorationMode] = useState(true);
  const explorationModeRef = useRef(true);
  // Whether the opening chrome (name + menu) is currently shown. Tracked in a ref
  // so the scroll callback only touches the DOM on an actual transition.
  const chromeVisibleRef = useRef(true);
  // Whether scroll is still in the opening hold (progress <= SCROLL_HINT_DISMISS_AT).
  // Ref-tracked so the body class only flips on an actual transition, not every sample.
  const atOpeningRef = useRef(true);
  // Whether real scroll progress has reached the black hole (bottom hero). When
  // this flips, the island REQUESTS a HUD power change (dispatches HUD_POWER_EVENT)
  // rather than owning body.hud-active itself — the boot FSM in BaseLayout is the
  // single owner of the HUD body classes now. Ref-tracked so the request fires only
  // on the actual at-end transition, not every scroll sample. The FSM honours the
  // forced override + the once-booted-stays-powered rule, so the island can dispatch
  // freely and let the machine decide.
  const hudAtEndRef = useRef(false);
  // "Brief solo, then HUD arms": the pending power-on timer. When scroll first reaches
  // the bottom we DELAY the HUD_POWER_EVENT{on:true} by HUD_DOT_SOLO_HOLD_MS so the
  // lone pale-blue dot lands alone for a beat before the rail/compass boot in. Held in
  // a ref (0 = none) so a scroll back UP off the bottom — or an unmount — can cancel a
  // still-pending power-on cleanly.
  const hudPowerOnTimerRef = useRef(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Resolve the reduced-motion preference SYNCHRONOUSLY from the live client
    // environment (manual override ?? OS media query) rather than trusting React's
    // `reduced` state, which under `client:visible` can be a stale `false` on the very
    // first client render (the island is SSR'd with window undefined, so the hook
    // seeds false and only reconciles true in a post-mount effect). Reading the true
    // value here is what guarantees we NEVER import + build a WebGL canvas when the
    // resolved preference is reduced — closing the "canvas mounts then is torn down"
    // gap. `reduced` is still in this effect's dependency list, so flipping the corner
    // toggle re-runs the effect and re-reads the (now updated) value, re-mounting or
    // tearing down the scene as appropriate. The two agree once reconciled.
    const isReduced = resolveReducedMotionNow();
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
      void import('../scene/createScene')
        .then(({ createScene }) => {
          if (cancelled) return;
          disposeRef = createScene(host, isReduced, { getStage: pinnedStage }, tier);
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
      // rail's scroll-spy below now reads the SAME sceneForProgress resolver, so the
      // at-end gate and the highlighted row stay consistent.
      const atEnd = sceneForProgress(progressRef.current).sceneId === 'beginning';
      if (atEnd !== hudAtEndRef.current) {
        hudAtEndRef.current = atEnd;
        if (atEnd) {
          // BRIEF SOLO, THEN HUD ARMS: do NOT power the HUD on the instant the dot
          // lands — let the lone speck hold ALONE for HUD_DOT_SOLO_HOLD_MS first, so
          // the closing beat reads as a quiet arrival before the chrome boots in. The
          // delayed dispatch is the SAME power-on request as before, just deferred.
          // (Guard against stacking: clear any prior pending timer first.)
          if (hudPowerOnTimerRef.current) window.clearTimeout(hudPowerOnTimerRef.current);
          hudPowerOnTimerRef.current = window.setTimeout(() => {
            hudPowerOnTimerRef.current = 0;
            window.dispatchEvent(
              new CustomEvent<HudPowerEventDetail>(HUD_POWER_EVENT, {
                detail: { on: true, source: 'scroll' },
              }),
            );
          }, HUD_DOT_SOLO_HOLD_MS);
        } else {
          // Left the bottom before the solo hold elapsed → the dot was only glanced,
          // not arrived at: cancel the still-pending power-on so the HUD never boots
          // from a fly-by. (If it had already fired, this is a no-op and the FSM keeps
          // the HUD lit per the once-booted-stays-powered rule; the explicit {on:false}
          // dispatch below remains a deliberate FSM no-op, preserved for symmetry.)
          if (hudPowerOnTimerRef.current) {
            window.clearTimeout(hudPowerOnTimerRef.current);
            hudPowerOnTimerRef.current = 0;
          }
          window.dispatchEvent(
            new CustomEvent<HudPowerEventDetail>(HUD_POWER_EVENT, {
              detail: { on: false, source: 'scroll' },
            }),
          );
        }
      }

      // Opening hold: while scroll is still on the black-hole opening frame (at/under
      // SCROLL_HINT_DISMISS_AT) the page shows only the three opening layers (brand,
      // bottom-centre status, the central focus dot); the full section nav + left HUD
      // rail are held hidden via body.at-opening and fade in once the visitor scrolls
      // past. Ref-guarded so the DOM is only touched on the actual transition. Placed
      // BEFORE the chrome-visibility block below (which early-returns) so this toggle
      // always runs on every syncChrome call.
      const atOpening = progressRef.current <= SCROLL_HINT_DISMISS_AT;
      if (atOpening !== atOpeningRef.current) {
        atOpeningRef.current = atOpening;
        document.body.classList.toggle(AT_OPENING_BODY_CLASS, atOpening);
      }

      const visible = progressRef.current < CHROME_HIDE_AT || explorationModeRef.current;
      if (visible === chromeVisibleRef.current) return;
      chromeVisibleRef.current = visible;
      document.body.classList.toggle(SCROLLED_BODY_CLASS, !visible);
    };
    const publishProgress = (nextProgress: number, force = false): void => {
      const previous = publishedProgressRef.current;
      const crossedHint = crossedProgressThreshold(previous, nextProgress, SCROLL_HINT_DISMISS_AT);
      // Push a React update the instant the SCENE the visitor is on changes, so the
      // rail's highlighted row (now driven by sceneForProgress — see scrollHudId
      // below) updates in lockstep with the scene rather than lagging. This MUST use
      // the SAME scene resolver as scrollHudId, not the old hudIdForStage stage-spy,
      // or the correct row would update late/jumpily (the stage thresholds sit above
      // the scenes' settled holds, so a stage-spy fires the publish on the wrong frame).
      const hudSceneChanged = explorationModeRef.current
        && sceneForProgress(previous).sceneId !== sceneForProgress(nextProgress).sceneId;

      if (
        !force
        && Math.abs(nextProgress - previous) < REACT_PROGRESS_MIN_DELTA
        && !crossedHint
        && !hudSceneChanged
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
    // Seed the opening-hold class from the initial scroll position so the page opens
    // in the right state (only the three opening layers) before the first scroll
    // sample — then syncChrome flips it on the transition out of the hold.
    const initialAtOpening = initial.progress <= SCROLL_HINT_DISMISS_AT;
    atOpeningRef.current = initialAtOpening;
    document.body.classList.toggle(AT_OPENING_BODY_CLASS, initialAtOpening);

    // One normalized forward progress value owns the public choreography. The
    // shader stage is a legacy implementation coordinate derived from it.
    const getStage = (): number => legacyStageForProgress(progressRef.current);
    const getProgress = (): number => progressRef.current;
    // The active scene's dwell strength (0..1) for the live scroll position, read
    // from the same pure resolver everything else uses. createScene damps its morph
    // follow-ease by this so dwelling beats (red giant, black hole) feel stickier —
    // mirrors how getStage/getProgress flow into the scene. No scrollbar is touched.
    const getDwell = (): number => resolve(progressRef.current).dwell;

    // REDUCED-MOTION CONTRACT: under the resolved reduced-motion preference we do NOT
    // mount the WebGL engine at all — no createScene import, no rAF loop. The still
    // poster slideshow (rendered below) stands in for the live hero while the
    // ScrollTracker above keeps running, so the manifesto copy + posters stay
    // scroll-driven. The mount side-effects (lift the loader, light the HUD) and their
    // cleanup live in mountReducedMotionHero — see that module for the WHY. `reduced`
    // is in this effect's dependency list, so flipping the corner toggle re-runs it:
    // this cleanup tears the reduced path down and flipping back re-mounts the scene,
    // no reload. NOTE we branch on `isReduced` (the SYNCHRONOUS resolve above), not the
    // React `reduced` state, so a first-render stale `false` can never slip through to
    // the createScene import below: no WebGL scene is ever created under reduced motion.
    if (isReduced) {
      const disposeReduced = mountReducedMotionHero();
      return () => {
        cancelled = true;
        disposeReduced();
        unsub();
        tracker.stop();
        hudAtEndRef.current = false;
      };
    }

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
        }, tier);
        disposeRef = dispose;
        // Stash the handle so the dive action (beginDive, below) can reach the live
        // scene outside this effect. Cleared on unmount in the cleanup return.
        sceneHandleRef.current = dispose;
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
      // Cancel a still-pending "brief solo" power-on so it can't fire after the island
      // (and the page it belonged to) is gone — the boot FSM would otherwise light a
      // HUD for a torn-down hero.
      if (hudPowerOnTimerRef.current) {
        window.clearTimeout(hudPowerOnTimerRef.current);
        hudPowerOnTimerRef.current = 0;
      }
      // Reset the opening-hold edge tracker too, so a re-mount re-seeds from the live
      // scroll position rather than inheriting a stale "in the opening hold" flag.
      atOpeningRef.current = false;
      // Also clear the no-WebGL fallback class so a fresh mount (e.g. a motion-preference
      // re-run, or an SPA return that re-creates the island) re-evaluates WebGL from a
      // clean slate instead of inheriting a stale "unavailable" note. If WebGL is still
      // unavailable the next mount simply re-adds it. (SCENE_READY stays owned by the
      // loader script — we never strip it here.)
      document.body.classList.remove(SCROLLED_BODY_CLASS, AT_OPENING_BODY_CLASS, HUD_BOOTING_BODY_CLASS, WEBGL_UNAVAILABLE_BODY_CLASS);
    };
  }, [backdrop, backdropStage, reduced]);

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

  // Corner-toggle requests, routed through the confirmation modal. Asymmetric by
  // design: turning reduced motion ON raises the 'confirm' modal first (the live
  // animation is about to switch off — give the visitor a beat); turning it back OFF
  // (return to the live hero) applies instantly. Stable identity (no deps that change)
  // so the context value doesn't churn the toggle.
  const requestReducedMotion = useCallback((next: boolean): void => {
    if (next) setRmModalMode('confirm');
    else setReduced(false);
  }, [setReduced]);

  // Modal primary action: 'confirm' → enter reduced motion; 'explain' → leave the
  // OS-default still version for the full live hero. Both close the modal.
  const onModalConfirm = useCallback((): void => {
    setReduced(rmModalMode === 'explain' ? false : true);
    setRmModalMode(null);
  }, [rmModalMode, setReduced]);

  // Modal dismiss (Cancel / Keep it simple / Escape / backdrop): no change to the
  // resolved preference, just close. For the OS-driven 'explain' modal the visitor
  // stays in the still version (the safe default); the explained flag set on open
  // keeps it from re-appearing on the next load.
  const onModalCancel = useCallback((): void => {
    setRmModalMode(null);
  }, []);

  // One-time OS-driven explanation: when reduced motion is active PURELY from the OS
  // (no manual override) and we have not explained it before, show the 'explain' modal
  // once. We persist the explained flag immediately on open (not on dismiss) so any
  // exit path — confirm, cancel, Escape, reload mid-modal — counts as "already
  // explained" and the modal never nags on a later load. Guarded for private mode.
  useEffect(() => {
    if (backdrop || !fromOsOnly) return;
    let explained = false;
    try {
      explained = window.localStorage?.getItem(REDUCED_MOTION_EXPLAINED_STORAGE_KEY) === 'true';
    } catch { /* private mode — treat as not yet explained */ }
    if (explained) return;
    try {
      window.localStorage?.setItem(REDUCED_MOTION_EXPLAINED_STORAGE_KEY, 'true');
    } catch { /* private mode — the modal still shows this session, just not persisted */ }
    setRmModalMode('explain');
  }, [backdrop, fromOsOnly]);

  const base = import.meta.env.BASE_URL ?? '/';
  // The lifecycle scene the live scroll position is ON (same segment-boundary
  // resolver the morph, camera, beats and data-scene all use). Computed up here so
  // the rail's scroll-spy can derive from it (see scrollHudId just below); reused for
  // data-scene at the bottom of the component.
  const sceneId = sceneForProgress(progress).sceneId;
  // Scroll-spy: the HUD row the live scroll position maps to. Driven by the SCENE
  // resolver above — NOT the old hudIdForStage stage-threshold spy. Those per-row
  // stage thresholds sit ABOVE the scenes' settled holds (yellow row stage 2.9 vs the
  // yellow hold at shader-stage 2.88; nebula row 3.5 vs the nebula hold at 3.42), so
  // hudIdForStage(settledStage) returned the row BELOW the one you were on — yellow lit
  // red, nebula lit yellow. sceneForProgress(...).sceneId is a HudTargetId keyed to the
  // SAME id set as the HUD rows, so the highlighted row always matches the scene you
  // are actually on. Self-consistent by construction.
  const scrollHudId: HudTargetId | null = explorationMode ? sceneId : null;
  // Shader stage (0..5) for the bright-zone test below; still the resolver's stage,
  // just no longer fed through hudIdForStage for the rail's "current" row.
  const lifecycleStage = resolve(progress).stage;
  // Adaptive dark stroke: is the chrome currently over a BRIGHT lifecycle zone? Two
  // bright beats bleach the canvas behind the warm-bone chrome — the supernova flash
  // (shader stage ~0.5, the breakout) and the bright yellow-star hold (settled gold at
  // stage ~2.88). Derived purely from the shader stage already tracked here (no extra
  // scroll read). Over the dark states (black hole / red giant / nebula / dot) this is
  // false → warm bone. The provider hands it down; the CSS [data-zone] flips the tokens.
  const brightZone = isBrightZoneStage(lifecycleStage);
  // sceneId (the lifecycle scene the live scroll position is ON) is computed once
  // above — it now feeds BOTH the rail scroll-spy and these per-scene HUD colour
  // tokens (data-scene) + the yellow-star designed-ring overlay, from the one resolver.
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
      actions={{ beginDive, requestReducedMotion }}
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
        {/* The canvas host. Under reduced motion the mount effect never imports
            createScene, so this stays an empty fixed layer and the still poster
            slideshow below paints the backdrop instead — opacity-only cross-fade, no
            WebGL, no rAF loop. */}
        <div className="bh-stage" ref={hostRef} aria-hidden="true" />
        {reduced ? (
          // Reduced-motion stand-in for the live hero: four lifecycle posters
          // cross-faded by scroll progress (opacity only). Sits at the canvas's
          // z-layer, behind the manifesto overlay copy — same room, no motion.
          <PosterSlideshow progress={progress} base={base} />
        ) : (
          <>
            <YellowStarRing />
            {/* One marker per placement, all mounted at once. Each instance gates its
                own visibility on its state being the settled one (the nebula owns three;
                the others one each) — no mount/unmount thrash, lock ownership is
                per-marker via the placement id. These ride the LIVE scene's per-frame
                marker positions, so they only mount on the live (non-reduced) path. */}
            {MARKER_PLACEMENTS.map((placement) => (
              <StarMarker key={placement.id} placement={placement} markerFrameRef={markerFrameRef} />
            ))}
          </>
        )}
        <HeroIdentity />
        <ManifestoOverlay />
        {/* Opening-only central focus dot: one soft luminous speck dead-centre on the
            black hole. Shown only while body.at-opening (the opening hold); fades out
            once the visitor scrolls past. aria-hidden — pure decoration. (Under reduced
            motion body.at-opening is never set, so it simply stays hidden.) */}
        <div className="bh-focus-dot" aria-hidden="true" />
        {/* The corner reduced-motion toggle joins the top-right opening-chrome glyph
            row (styled to match the sibling power button). Reads the resolved
            preference via the scene context and REQUESTS a change — turning reduced
            motion on opens the modal below; turning it off applies instantly. */}
        <ReducedMotionToggle />
        {/* Reduced-motion confirmation / explanation modal. Mounted only while open;
            'confirm' guards the manual switch INTO reduced motion, 'explain' tells an
            OS reduced-motion visitor why they see the still version (once). */}
        {rmModalMode && (
          <ReducedMotionModal
            mode={rmModalMode}
            onConfirm={onModalConfirm}
            onCancel={onModalCancel}
          />
        )}
        <ExplorationHud markerFrameRef={markerFrameRef} />
      </div>
    </SceneStateProvider>
  );
}
