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
import { SCROLL_SECTION_COUNT, BUILT_STAGES, legacyStageForProgress, brightZoneFor } from '../timeline';
import { MARKER_PLACEMENTS, type HudTargetId } from '../HudNavigation';
import { dwellForScene, sceneForProgress } from '../sceneTable';
import { PresentationClock, type PresentationState } from '../presentationClock';
import { detectDeviceTier, isTierForced, isSoftwareGl, PHONE_VIEWPORT_WIDTH } from '../lib/config';
import {
  SCROLLED_BODY_CLASS,
  AT_OPENING_BODY_CLASS,
  DIVING_BODY_CLASS,
  AT_FINALE_BODY_CLASS,
  SCROLL_DOWN,
  SCROLL_UP,
  type ScrollDirection,
  DIRECTION_DEADZONE,
  CHROME_HIDE_AT,
  SCROLL_HINT_DISMISS_AT,
  DEBUG_WINDOW_KEYS,
  CURSOR_WINDOW_KEYS,
  SCENE_PAINTED_BODY_DATA_KEY,
  SCENE_READY_BODY_CLASS,
  LOADER_GONE_BODY_CLASS,
  HUD_ACTIVE_BODY_CLASS,
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
// The sitewide 2-context WebGL budget (see glGovernor.ts). BOTH construction
// sites in this island acquire a token BEFORE the engine chunk is imported:
// the live hero at PRIORITY_HERO (never evicted in practice — nothing on the
// site outranks it) and the pinned backdrop branch at PRIORITY_AMBIENT (one
// ambient layer per reading page). Tokens are released on the same cleanup
// paths that dispose the renderer; a lost-then-restored GL context keeps its
// token (the restore path revives the same renderer).
import { glGovernor, PRIORITY_HERO, PRIORITY_AMBIENT } from '../lib/glGovernor';
import { SceneStateProvider } from './SceneStateContext';
import HeroIdentity from './HeroIdentity';
import ManifestoOverlay from './ManifestoOverlay';
import FinaleLedger, { type LedgerCounts } from './FinaleLedger';

/** Typed handle to the HUD power FSM exposed on window.__bhHudFsm by BaseLayout.
 *  Only the fields HeroIsland needs are declared here; the full interface lives in
 *  BaseLayout's bundled script and cannot be imported from this client bundle. */
interface BhHudFsm {
  state: 'idle' | 'ready';
  forceState?: (next: 'idle' | 'ready') => void;
}
import ExplorationHud from './ExplorationHud';
import CockpitFrame from './CockpitFrame';
import StarMarker from './StarMarker';
import {
  PosterSlideshow,
  ReducedMotionToggle,
  ReducedMotionModal,
  type ReducedMotionModalMode,
  mountReducedMotionHero,
  useReducedMotionPreference,
  resolveReducedMotionNow,
} from './reduced-motion';
import MobileHeroVideo from './MobileHeroVideo';

declare global {
  interface Window {
    /** Published by the live hero (this component) so the standalone custom-cursor
     *  IIFE can ask whether a screen point is over either clickable star body (the
     *  red-giant sphere OR the yellow-star photosphere mesh) — the cursor shows its
     *  interactive hexagon there. Absent on pages without the scrollable hero (about,
     *  ...). Key literal = CURSOR_WINDOW_KEYS.hitGiant. */
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
  /** Collection-derived counts for the finale ledger (P6). REQUIRED on the
   *  full-hero mount: index.astro computes getCounts() server-side and passes
   *  it in, so the ledger notes always match the real content collections.
   *  Backdrop mode renders no overlay, so its callers omit it; the default is
   *  a defensive zero so a hypothetical countless full mount reads as obviously
   *  wrong ('0 shipped') rather than plausibly stale. */
  counts?: LedgerCounts;
  /** Home-feature proof (PRD-003) — the ONE shipped project the yellow-star
   *  Projects marker features by name. Validated + derived server-side by
   *  getFeaturedProof() (index.astro) so the marker's facts and its
   *  /projects#<id> destination come from the catalogue, never a scene literal.
   *  null (or absent) leaves the marker's generic Projects copy untouched. */
  featured?: HeroProof | null;
  /** Whether the pre-rendered mobile hero video (public/assets/hero-mobile.mp4)
   *  exists in the build output. Generated by scripts/capture-mobile-hero.mjs
   *  and committed separately. When false on a phone viewport, the island falls
   *  back to the poster slideshow (same path as reduced-motion) so no 404 fires
   *  from a <source> pointing at a missing asset. */
  hasMobileVideo?: boolean;
}

/** The shape of the validated home-feature proof, mirrored structurally from
 *  contentStats.ts's HeroProofData (a type import would drag the server-only
 *  `astro:content` module into this client bundle). index.astro serialises the
 *  real projection into this prop. */
export interface HeroProof {
  id: string;
  name: string;
  summary: string;
  signals: readonly string[];
  npm?: string;
  github?: string;
  /** Base-relative href with the catalogue fragment, e.g. 'projects#fleet'. */
  href: string;
  fragment: string;
}

/** Apply the validated home-feature proof to the single yellow-star Projects
 *  marker, leaving every other placement untouched. This is the ONE seam where
 *  the featured project's real facts enter the scene: sceneTable stays the
 *  geometry/placement source, and the marker's name/summary/signals/href/
 *  accessible copy come from the projection. No proof → the placement's existing
 *  generic Projects copy is used unchanged. */
function withFeaturedProof(
  placement: (typeof MARKER_PLACEMENTS)[number],
  featured: HeroProof | null | undefined,
): typeof placement {
  if (!featured || placement.id !== 'yellow') return placement;
  const signals = featured.signals.join(' · ');
  // The anchor's accessible name is `${headline} ${body}` (StarMarker), so body
  // must name the destination too — the a11y label then reads e.g.
  // "Fleet. Parallel branch environments, locally. Featured project in Projects."
  const body = `${featured.summary} Featured project in Projects.`;
  return {
    ...placement,
    // Land on the catalogue fragment (Projects stays the route identity).
    href: featured.href,
    // Card copy — the featured project's real facts.
    eyebrow: 'FEATURED PROJECT',
    headline: `${featured.name}.`,
    body,
    tags: featured.npm ? [...featured.signals, `npm ${featured.npm}`] : featured.signals,
    cta: `See ${featured.name} in Projects`,
    // Compass fallback copy (used when eyebrow/headline/body are absent — here
    // they are present, so these only feed the compass dest line).
    title: featured.name,
    subtitle: `${signals} — in Projects`,
  };
}

const ZERO_COUNTS: LedgerCounts = { shipped: 0, dead: 0, posts: 0 };

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

// The bright-zone stage geometry (which beats flip the chrome to a dark stroke) now
// lives in the timeline module via brightZoneFor() — see the BRIGHT_STAGE_BANDS block
// there. The React layer asks the timeline rather than holding its own copy of stage
// numbers, so re-timing a beat never silently leaves a stale band here.

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

export default function HeroIsland({ backdrop = false, backdropStage = BUILT_STAGES, counts = ZERO_COUNTS, featured = null, hasMobileVideo = false }: HeroIslandProps = {}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Frame-cadence marker data from the scene (position of the star object in CSS px).
  // Written every rAF by the scene's onMarkerFrame callback; read by StarMarker on
  // its own rAF loop. Never triggers React re-renders — that is the whole point.
  const markerFrameRef = useRef<MarkerFrame | null>(null);
  // The live scene handle, stashed so the dive action can call beginDive() on it
  // outside the mount effect. Null until the engine chunk resolves (and cleared on
  // unmount) — the action falls back to a plain SPA nav while it is null.
  const sceneHandleRef = useRef<SceneHandle | null>(null);
  // Exact RAW scroll progress (0..1) — the presentation clock's TARGET. Only the
  // physical-scroll chrome (opening hold, hint dismiss) reads this directly; the
  // morph and every lifecycle-keyed consumer read the clock's EASED output.
  const progressRef = useRef(0);
  const publishedProgressRef = useRef(0);
  // React receives lower-frequency snapshots of the presentation clock (the SAME
  // eased values the canvas renders) for DOM overlays: `progress` drives the beat
  // bands / gauge, `stage` the instrument readouts + bright-zone chrome flip.
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);
  // Scroll direction is still published for components that support direction-
  // specific copy; the current forward lifecycle uses matching lines both ways.
  const lastProgressRef = useRef(0);
  const [direction, setDirection] = useState<ScrollDirection>(SCROLL_DOWN);
  // The RESOLVED reduced-motion preference (manual override ?? OS preference) and a
  // setter, backed by the sitewide motion module (src/lib/motion.ts → useMotion).
  // This single value is the source of truth for BOTH the mount decision below
  // (live WebGL hero vs the still poster slideshow) AND the corner toggle — it is
  // threaded into the context state/actions so the button and the engine never
  // disagree. Hydration-safe: the hydration render matches the server HTML ('full'
  // branch) and React reconciles to the real client value before paint, so the old
  // React #418-class mismatch for OS-reduced visitors is gone. The module owns the
  // one matchMedia listener, so HeroIsland keeps no motion-preference effect of its
  // own — an OS flip mid-session streams in here, re-runs the mount effect via the
  // `reduced` dependency, and swaps engine <-> poster live, no reload. `fromOsOnly`
  // is true when the reduced state comes purely from the OS (no manual override
  // yet) — it gates the one-time explanatory modal below.
  const { reduced, fromOsOnly, setReduced } = useReducedMotionPreference();
  // Phone detection: start false (matches SSR output and initial hydration render)
  // and flip to true inside the mount effect once window is available. NOT in the
  // main effect's deps — the detection is a one-way door (phones don't become
  // desktops mid-session) and is re-evaluated via isPhoneNow inside the effect.
  const [isPhone, setIsPhone] = useState(false);
  // Software-GL fallback: true when the WebGL probe detected a software rasteriser
  // (SwiftShader / llvmpipe) and no ?tier= override is forcing the live scene.
  // Set by the mount effect; controls the JSX poster path alongside `reduced`.
  const [isSoftwareFallback, setIsSoftwareFallback] = useState(false);
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
  // Whether the finale beat (pale-blue-dot / site index) is the active beat.
  // progress >= 0.9 corresponds to lifecycleProgress <= 0.1 (the finale band).
  // Ref-tracked so the body class only flips on an actual transition.
  const atFinaleRef = useRef(false);
  // React-state mirror of atFinaleRef — published on threshold crossings so the
  // FinaleLedger component's `visible` prop (which controls tabIndex + data-visible)
  // stays in sync with the body class and the left-panel CSS gate.
  const [atFinaleState, setAtFinaleState] = useState(false);
  // Auto-power tracker: null = finale not active / no auto-power in effect;
  // true  = finale active, HUD was already on before auto-power (no-op);
  // false = finale active, HUD was off → we auto-powered it to 'ready'.
  // On leaving the finale, only the `false` case restores the idle state.
  const hudAutoRef = useRef<boolean | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Resolve the reduced-motion preference SYNCHRONOUSLY from the pre-paint
    // <html data-motion> attribute (manual override ?? OS — see src/lib/motion.ts)
    // rather than trusting React's `reduced` state, which under `client:visible` is
    // deliberately 'full'-shaped on the hydration render (it must match the server
    // HTML). Reading the true value here is what guarantees we NEVER import + build
    // a WebGL canvas when the resolved preference is reduced — closing the "canvas
    // mounts then is torn down" gap. `reduced` is still in this effect's dependency
    // list, so a corner-toggle flip OR a live OS preference change re-runs the
    // effect and re-reads the (now updated) value, re-mounting or tearing down the
    // scene as appropriate. The two agree once reconciled.
    const isReduced = resolveReducedMotionNow();
    // Proactive 'high' | 'mid' | 'low' device tier, detected once at mount (memoized
    // inside; GPU classification + fill-rate microprobe). Threaded into createScene so
    // the right rung (mid: half density + 1.5 DPR cap; low: the reduced fallback) is
    // chosen UP FRONT — the device never has to fail first; 'high' is byte-identical.
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
      // One ambient context per page, budgeted. A denied grant simply leaves
      // this layer blank — the page's own CSS backdrop treatment stands, same
      // as the no-WebGL path below.
      const glToken = glGovernor.acquire({
        priority: PRIORITY_AMBIENT,
        onEvict: () => {
          // Bumped by a higher-priority holder: dispose the renderer now (the
          // token is already released by the governor) and cancel any boot
          // still in flight so a late handle can never mount tokenless.
          cancelled = true;
          disposeRef?.();
          disposeRef = null;
        },
      });
      if (!glToken) return;
      const fallback = Math.min(BUILT_STAGES, Math.max(0, backdropStage));
      // window.__bhBackdropStage lets a capture script A/B the pinned frame live
      // (mirrors the home's __bhMorph debug hook). Defaults to the prop.
      const pinnedStage = (): number => {
        const override = readDebugNumber(DEBUG_WINDOW_KEYS.backdropStage);
        const value = typeof override === 'number' ? override : fallback;
        return Math.min(BUILT_STAGES, Math.max(0, value));
      };
      // Deferred one macrotask so the import kickoff + its continuations never ride
      // the hydration/effect flush (same shape as the live path below). createScene
      // is async (sliced boot), so a teardown racing the build disposes the fresh
      // handle the moment it resolves.
      const engineKickoff = window.setTimeout(() => {
        void import('../scene/createScene')
          .then(async ({ createScene }) => {
            if (cancelled) return;
            const dispose = await createScene(host, isReduced, { getStage: pinnedStage }, tier);
            if (cancelled) {
              dispose();
              return;
            }
            disposeRef = dispose;
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
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(engineKickoff);
        disposeRef?.();
        disposeRef = null;
        glGovernor.release(glToken);
      };
    }

    // Drive the opening chrome (name + top-right menu) from a single source of
    // truth: it is shown at the very top OR whenever the HUD is present. Keyed on
    // RAW scroll (progressRef) on purpose — the opening hold and the chrome hide
    // are physical-scroll boundaries, not lifecycle beats, so they must respond
    // to the scrollbar itself, not the eased presentation. Tracked through
    // chromeVisibleRef so the DOM is only touched on an actual transition.
    const syncChrome = (): void => {
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

      // Finale beat: progress >= 0.9 ≡ lifecycleProgress <= 0.1 (the pale-blue-dot
      // band). The body class drives CSS light-cockpit dimming (hud.css) and
      // gates the left-panel MFD directory (body.hud-active.bh-at-finale).
      const atFinale = progressRef.current >= 0.9;
      if (atFinale !== atFinaleRef.current) {
        atFinaleRef.current = atFinale;
        document.body.classList.toggle(AT_FINALE_BODY_CLASS, atFinale);
        setAtFinaleState(atFinale);

        // Auto-power the HUD at the finale so the left-panel directory appears
        // without requiring a manual button press. On leaving the finale restore
        // the previous state so mid-scroll stays bare spectacle.
        // forceState() (added to the FSM in BaseLayout) flips the body class and
        // button ARIA WITHOUT writing to localStorage — the user's stored choice
        // is preserved and re-applied by the FSM on the next page load / swap.
        const fsmWin = window as unknown as { __bhHudFsm?: BhHudFsm };
        const hudFsm = fsmWin.__bhHudFsm;
        if (hudFsm) {
          if (atFinale) {
            hudAutoRef.current = hudFsm.state === 'ready';
            if (hudFsm.state !== 'ready') {
              hudFsm.forceState?.('ready');
            }
          } else {
            if (hudAutoRef.current === false) {
              hudFsm.forceState?.('idle');
            }
            hudAutoRef.current = null;
          }
        }
      }

      const visible = progressRef.current < CHROME_HIDE_AT || explorationModeRef.current;
      if (visible === chromeVisibleRef.current) return;
      chromeVisibleRef.current = visible;
      document.body.classList.toggle(SCROLLED_BODY_CLASS, !visible);
    };
    // Restore the HUD to idle if we auto-powered it at the finale without persisting.
    // Safe to call from any cleanup path that set up the scroll tracker (all non-backdrop
    // paths). No-ops if the HUD was already on before the finale (hudAutoRef = true)
    // or if the finale was never reached (hudAutoRef = null).
    const restoreHudAuto = (): void => {
      if (hudAutoRef.current === false) {
        (window as unknown as { __bhHudFsm?: BhHudFsm }).__bhHudFsm?.forceState?.('idle');
      }
      hudAutoRef.current = null;
    };
    // Publish a presentation-clock snapshot to React (gated so DOM overlays get a
    // perceptual cadence, not every frame of the ease). Both values in a snapshot
    // come from the SAME clock tick, so text bands and stage readouts can never
    // straddle two different frames.
    const publishSnapshot = (next: PresentationState, force = false): void => {
      const previous = publishedProgressRef.current;
      const crossedHint = crossedProgressThreshold(previous, next.progress, SCROLL_HINT_DISMISS_AT);
      // Push a React update the instant the SCENE the presentation is on changes, so
      // the rail's highlighted row (driven by sceneForProgress — see scrollHudId
      // below) updates in lockstep with the scene rather than lagging.
      const hudSceneChanged = explorationModeRef.current
        && sceneForProgress(previous).sceneId !== sceneForProgress(next.progress).sceneId;

      if (
        !force
        && Math.abs(next.progress - previous) < REACT_PROGRESS_MIN_DELTA
        && !crossedHint
        && !hudSceneChanged
        && next.progress !== 0
        && next.progress !== 1
      ) {
        return;
      }

      publishedProgressRef.current = next.progress;
      setProgress(next.progress);
      setStage(next.stage);
    };

    // THE PRESENTATION CLOCK — the single eased lifecycle clock (see
    // presentationClock.ts). Targets: raw scroll progress + its table-mapped stage.
    // The scene engine samples `clock.current` every frame, and the React snapshots
    // below come from the same instance, so the canvas and the DOM chrome always
    // agree on what is on screen. Dwell (sticky beats) damps the ease here — the
    // engine no longer owns any smoothing.
    const clock = new PresentationClock(
      () => ({
        progress: progressRef.current,
        stage: legacyStageForProgress(progressRef.current),
      }),
      {
        reduced: isReduced,
        dwellFor: (raw) => dwellForScene(sceneForProgress(raw).sceneId),
      },
    );
    const unsubClock = clock.subscribe((state) => {
      publishSnapshot(state);
    });

    const tracker = new ScrollTracker(SCROLL_SECTION_COUNT);
    const unsub = tracker.subscribe((scrollState) => {
      progressRef.current = scrollState.progress;
      // New target for the presentation clock; it eases toward it on its own rAF
      // and notifies the subscription above as it moves.
      clock.wake();
      // Direction from the delta, with a deadzone so tiny jitter doesn't flip it.
      const delta = scrollState.progress - lastProgressRef.current;
      if (delta > DIRECTION_DEADZONE) setDirection(SCROLL_DOWN);
      else if (delta < -DIRECTION_DEADZONE) setDirection(SCROLL_UP);
      lastProgressRef.current = scrollState.progress;
      // Cinematic chrome: the name (.bh-identity) and the top-right menu
      // (.overlay-blog, owned by the layout) belong to the opening frame only —
      // physical-scroll boundaries, so they stay keyed on the RAW tracker value.
      syncChrome();
    });
    const initial = tracker.start();
    progressRef.current = initial.progress;
    publishedProgressRef.current = initial.progress;
    lastProgressRef.current = initial.progress;
    setProgress(initial.progress);
    setStage(legacyStageForProgress(initial.progress));
    // Start the clock ON the initial scroll position (its settle-snap window then
    // absorbs any late browser scroll restoration without a glide).
    clock.start();
    // Seed the opening-hold class from the initial scroll position so the page opens
    // in the right state (only the three opening layers) before the first scroll
    // sample — then syncChrome flips it on the transition out of the hold.
    const initialAtOpening = initial.progress <= SCROLL_HINT_DISMISS_AT;
    atOpeningRef.current = initialAtOpening;
    document.body.classList.toggle(AT_OPENING_BODY_CLASS, initialAtOpening);

    // Seed the finale class and auto-power the HUD if the page loads at finale.
    // Mirrors syncChrome's threshold logic — ensures the body class and HUD state
    // are correct even before the first scroll event fires.
    const initialAtFinale = initial.progress >= 0.9;
    atFinaleRef.current = initialAtFinale;
    document.body.classList.toggle(AT_FINALE_BODY_CLASS, initialAtFinale);
    if (initialAtFinale) {
      setAtFinaleState(true);
      const fsmWin = window as unknown as { __bhHudFsm?: BhHudFsm };
      const hudFsm = fsmWin.__bhHudFsm;
      if (hudFsm) {
        hudAutoRef.current = hudFsm.state === 'ready';
        if (hudFsm.state !== 'ready') {
          hudFsm.forceState?.('ready');
        }
      }
    }

    // The engine samples the presentation clock — pre-smoothed, shared with every
    // DOM consumer. One clock, one truth about what is on screen.
    const getStage = (): number => clock.current.stage;
    const getProgress = (): number => clock.current.progress;

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
        restoreHudAuto();
        disposeReduced();
        unsubClock();
        clock.stop();
        unsub();
        tracker.stop();
      };
    }

    // PHONE CONTRACT: on phones (innerWidth < 768, portrait phone-sized viewport) we
    // replace the live WebGL scene with a pre-rendered scroll-scrubbed portrait video
    // (MobileHeroVideo, rendered below). The video is zero-GPU cost and plays well on
    // constrained mobile hardware. Tablets (≥ 768 px) and all desktops — including
    // low-tier ones — keep the live scene and the tier ladder byte-identical. The check
    // is synchronous so createScene is NEVER imported on a phone, closing the "engine
    // starts then tears down" gap. setIsPhone(true) queues a render that mounts
    // MobileHeroVideo, which dispatches 'scene:ready' when its first frame is ready
    // (just like createScene fires that event after its first GPU frame). The inline
    // script in index.astro handles the CSS transition / loader-gone — same flow as
    // the live scene, so the skip-intro button stays keyboard-accessible during the
    // brief load window, and the 8 s safety backstop still guards a missing video.
    //
    // When hasMobileVideo is false (no video in the build — fresh checkout, CI without
    // the capture step), we fall back to the poster slideshow instead. That path mirrors
    // the reduced-motion branch: mountReducedMotionHero() lifts the loader so the page
    // never waits on a 404'd video, and PosterSlideshow (rendered below) carries the
    // visual with no network requests for the missing files.
    const isPhoneNow = typeof window !== 'undefined' && window.innerWidth < PHONE_VIEWPORT_WIDTH;
    if (isPhoneNow) {
      setIsPhone(true);
      if (!hasMobileVideo) {
        // No video in build — use PosterSlideshow (rendered below when isPhone &&
        // !hasMobileVideo). Lift the loader exactly like the reduced-motion path:
        // PosterSlideshow doesn't fire scene:ready, so we do it here.
        const disposeReduced = mountReducedMotionHero();
        return () => {
          cancelled = true;
          restoreHudAuto();
          disposeReduced();
          unsubClock();
          clock.stop();
          unsub();
          tracker.stop();
        };
      }
      // Video exists — MobileHeroVideo fires 'scene:ready' when its first frame loads.
      // No loader manipulation here; the index.astro inline script handles the reveal.
      return () => {
        cancelled = true;
        delete document.body.dataset[SCENE_PAINTED_BODY_DATA_KEY];
        restoreHudAuto();
        unsubClock();
        clock.stop();
        unsub();
        tracker.stop();
      };
    }

    // SOFTWARE-GL FALLBACK: when the WebGL probe detected a software rasteriser
    // (SwiftShader / llvmpipe / Microsoft Basic Render) and no ?tier= override is
    // forcing the live scene for diagnostics, mount the poster-slideshow hero instead
    // of importing the three.js engine. Software rasterisers hold ~6-18fps on the
    // desktop scene even after all other mitigations — the poster is the right
    // product experience for that context. Forced ?tier= keeps the live scene so
    // the bench operator can still measure the live-scene path with SwiftShader.
    // mountReducedMotionHero lifts the loader (SCENE_READY_BODY_CLASS) and sets
    // POSTER_MODE_BODY_CLASS for the bench's booted-path detector.
    if (isSoftwareGl() && !isTierForced()) {
      setIsSoftwareFallback(true);
      const disposeReduced = mountReducedMotionHero();
      return () => {
        cancelled = true;
        restoreHudAuto();
        disposeReduced();
        unsubClock();
        clock.stop();
        unsub();
        tracker.stop();
      };
    }

    // GL BUDGET: the live hero claims its context slot BEFORE the engine chunk
    // is even requested. PRIORITY_HERO outranks every other holder on the site,
    // so this either grants immediately or (when the page is somehow full at
    // equal-or-higher priority — not reachable with today's priority table)
    // falls back exactly like a no-WebGL device: reveal the scroll-driven DOM.
    const glToken = glGovernor.acquire({
      priority: PRIORITY_HERO,
      onEvict: () => {
        // Honour the contract even though nothing outranks the hero today: the
        // governor has already released the token; cancel any in-flight boot,
        // dispose the renderer and reveal the no-canvas fallback so the page
        // stays usable.
        cancelled = true;
        disposeRef?.();
        disposeRef = null;
        sceneHandleRef.current = null;
        revealWithoutWebgl();
      },
    });
    if (!glToken) {
      revealWithoutWebgl();
      return () => {
        cancelled = true;
        restoreHudAuto();
        unsubClock();
        clock.stop();
        unsub();
        tracker.stop();
        document.body.classList.remove(SCROLLED_BODY_CLASS, AT_OPENING_BODY_CLASS, WEBGL_UNAVAILABLE_BODY_CLASS, DIVING_BODY_CLASS, AT_FINALE_BODY_CLASS);
      };
    }

    // Pull in the three.js engine asynchronously, THEN build the scene. The scroll
    // tracker above is pure JS and stays synchronous, so scroll is wired the instant
    // the island hydrates; only the heavy GPU scene waits for its own chunk. The
    // tracker already snapshotted the initial scroll position, so createScene reads
    // the right stage/progress as soon as it arrives.
    //
    // TASK-SHAPING (TBT): three things keep the engine load off the long-task list.
    //  1. The kickoff is deferred ONE macrotask (setTimeout 0) so neither the import
    //     initiation nor any of its promise continuations ride the React hydration /
    //     effect flush — the hydration task stays hydration-sized.
    //  2. three core is pre-evaluated in ITS OWN task (via the warmThree shim — it
    //     statically depends on the three-core manualChunks chunk, see
    //     astro.config.mjs) with a macrotask boundary before the scene code follows,
    //     so the engine's module eval is split into two medium tasks instead of one
    //     ~760 KB monster. The second import's evaluation skips three (already
    //     evaluated) and only runs the addons + scene chunks. (The shim exists
    //     because `import('three')` directly would namespace-import the library and
    //     disable its tree-shaking — see warmThree.ts.)
    //  3. createScene itself is async (sliced boot — see yieldToMain there), so the
    //     rig construction arrives as a series of sub-tasks too.
    // The loader (scene:ready contract, index.astro) covers this whole window, so
    // none of the added task boundaries are visible.
    const engineKickoff = window.setTimeout(() => {
      void (async (): Promise<void> => {
        await import('../scene/warmThree'); // 1st eval task: three core, alone
        await new Promise<void>((resolve) => { window.setTimeout(resolve, 0); }); // task boundary
        const { createScene } = await import('../scene/createScene'); // 2nd: addons + scene code
        if (cancelled) return;
        const dispose = await createScene(host, isReduced, {
          getStage,
          getProgress,
          getFocusTarget: () => null,
          isExplorationMode: () => explorationModeRef.current,
          // The cockpit rig's power bit: the FSM body class, read at frame cadence.
          // The literal lives in lib/constants (HUD_ACTIVE_BODY_CLASS) — the scene
          // itself never touches DOM class names (see SceneHooks.isHudActive).
          isHudActive: () => document.body.classList.contains(HUD_ACTIVE_BODY_CLASS),
          onMarkerFrame: (m) => { markerFrameRef.current = m; },
          // GPU context lost mid-session: the scene has already preventDefault'd and
          // paused its render loop. Reveal the on-brand fallback so the frozen canvas is
          // replaced by the usable scroll-driven DOM (manifesto + nav links), exactly
          // like the no-WebGL-at-mount path below. We do NOT auto-clear it on restore:
          // only the standard rigs recover on the live context, so we keep the note up
          // rather than risk showing a half-restored (GPGPU-less) scene.
          onContextLost: () => revealWithoutWebgl(),
        }, tier);
        // The mount was torn down while the sliced boot was in flight: dispose the
        // fresh handle at once (it was never published anywhere).
        if (cancelled) {
          dispose();
          return;
        }
        disposeRef = dispose;
        // Stash the handle so the dive action (beginDive, below) can reach the live
        // scene outside this effect. Cleared on unmount in the cleanup return.
        sceneHandleRef.current = dispose;
        // Bridge the scene's red-giant hit-test to the standalone custom cursor (which
        // can't import scene/three code). Published on window under the __bh* hook
        // convention; deleted on unmount so other pages never see a stale closure.
        window[CURSOR_WINDOW_KEYS.hitGiant] = dispose.hitTestGiant;
      })().catch((error: unknown) => {
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
    }, 0);

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
      // The readiness latch belongs to this scene instance. Clear it on every
      // teardown so a later ClientRouter return or motion-mode remount must earn
      // readiness from its own first frame.
      delete document.body.dataset[SCENE_PAINTED_BODY_DATA_KEY];
      // A still-pending engine kickoff (the setTimeout 0 above) must not fire into a
      // torn-down mount; the `cancelled` flag already guards every continuation, this
      // just saves the wasted import.
      window.clearTimeout(engineKickoff);
      document.removeEventListener('astro:before-swap', onBeforeSwap);
      unsubClock();
      clock.stop();
      unsub();
      tracker.stop();
      sceneHandleRef.current = null;
      delete window[CURSOR_WINDOW_KEYS.hitGiant];
      // Dispose the scene if it has already been created; if the engine chunk is
      // still in flight, the `cancelled` guard above stops it from ever building.
      // (We dispose via disposeRef, not a `dispose` local, because createScene now
      // resolves inside the dynamic import's .then() and is out of scope here.)
      disposeRef?.();
      disposeRef = null;
      // Return the context slot to the sitewide budget (idempotent — an evicted
      // token was already released by the governor).
      glGovernor.release(glToken);
      // Leave the body in a clean state if the island unmounts mid-scroll. We clear
      // ONLY the island-owned chrome classes. We deliberately do NOT touch hud-active /
      // hud-booting / hud-shutting-down for MANUAL state — those are owned by the boot
      // FSM, mirrored to localStorage, and re-applied on the next astro:page-load.
      // EXCEPTION: if we auto-powered the HUD at the finale (forceState — no
      // localStorage update), we restore the idle state now so the body is consistent
      // for an in-session re-mount (e.g. motion-preference toggle). SPA nav: the FSM
      // re-inits from localStorage on the new page, so this restore is a no-op there.
      restoreHudAuto();
      // Reset the opening-hold edge tracker so a re-mount re-seeds from the live
      // scroll position rather than inheriting a stale "in the opening hold" flag.
      atOpeningRef.current = false;
      atFinaleRef.current = false;
      // Also clear the no-WebGL fallback class so a fresh mount (e.g. a motion-preference
      // re-run, or an SPA return that re-creates the island) re-evaluates WebGL from a
      // clean slate instead of inheriting a stale "unavailable" note. If WebGL is still
      // unavailable the next mount simply re-adds it. (SCENE_READY stays owned by the
      // loader script — we never strip it here.)
      document.body.classList.remove(SCROLLED_BODY_CLASS, AT_OPENING_BODY_CLASS, WEBGL_UNAVAILABLE_BODY_CLASS, DIVING_BODY_CLASS, AT_FINALE_BODY_CLASS);
    };
  }, [backdrop, backdropStage, reduced]);

  // The dive action published to StarMarker via SceneStateProvider. Flies the live
  // camera into the star (the scene owns the geometry + the white-overlay strength),
  // then SPA-navigates to the destination at the bloom apex (onApex). If the engine
  // chunk hasn't resolved yet, it degrades to a plain SPA navigation — the marker is
  // never a dead link. Stable identity (useCallback, no deps) so the context value
  // doesn't churn the marker tree.
  const beginDive = useCallback((opts: { href: string; targetNdc?: { x: number; y: number }; state?: HudTargetId; label?: string }) => {
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
    // Flag the dive on <body> so the HUD chrome that would clutter the plunge fades out
    // — specifically the bottom-left instrument readout (hud.css hides .hud-frame-readout
    // while this class is present). Cleared on the island's unmount (the SPA nav the dive
    // fires at apex), so it never lingers on the destination page.
    document.body.classList.add(DIVING_BODY_CLASS);
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
      // DECORATIVE DESTINATION READOUT (PRD-004): carry the audited transit label
      // through the bloom on the persisted, aria-hidden [data-dive-label] carrier.
      // It rides the overlay from here to the destination's resurface handler
      // (BaseLayout), which clears it — the route <h1> + real SiteNav state own the
      // arrival. Under reduced motion, CSS omits the carrier entirely (no travel);
      // we still set the text so the reduced-motion resurface clears the same node.
      // Absent label (a dive marker without one) → clear any stale text and do not
      // flag the carrier active.
      const carrier = overlay.querySelector<HTMLElement>('[data-dive-label]');
      if (carrier) {
        if (opts.label) {
          carrier.textContent = opts.label;
          overlay.dataset.diveLabel = 'active';
        } else {
          carrier.textContent = '';
          delete overlay.dataset.diveLabel;
        }
      }
    }
    handle.beginDive({
      targetNdc: opts.targetNdc,
      state: opts.state,
      onDiveProgress: (s) => {
        if (!overlay) return;
        overlay.style.opacity = String(s);
        // Mirror visibility so the parked (opacity 0) overlay releases its
        // compositor layer — see .dive-overlay in hero.css.
        overlay.style.visibility = s > 0.001 ? 'visible' : 'hidden';
      },
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
  // The lifecycle scene the PRESENTATION is on — `progress` is the clock's eased
  // snapshot, the same value the canvas renders, so this resolver names the scene
  // that is ACTUALLY on screen (not the one the scrollbar has raced ahead to).
  // Computed up here so the rail's scroll-spy can derive from it (scrollHudId just
  // below); reused for data-scene at the bottom of the component.
  const sceneId = sceneForProgress(progress).sceneId;
  // Scroll-spy: the HUD row the presentation maps to. Driven by the SCENE resolver
  // above — sceneForProgress(...).sceneId is a HudTargetId keyed to the SAME id set
  // as the HUD rows, so the highlighted row always matches the scene you are
  // actually on. Self-consistent by construction.
  const scrollHudId: HudTargetId | null = explorationMode ? sceneId : null;
  // Adaptive dark stroke: is the chrome currently over a BRIGHT lifecycle zone? Two
  // bright beats bleach the canvas behind the warm-bone chrome — the supernova flash
  // (shader stage ~0.5, the breakout) and the bright yellow-star hold (settled gold at
  // stage ~2.88). `stage` is the clock's eased shader stage — the exact value the
  // morph renders — so the chrome flips on the same frame the canvas brightens.
  // Over the dark states (black hole / red giant / nebula / dot) this is false →
  // warm bone. The provider hands it down; the CSS [data-zone] flips the tokens.
  const brightZone = brightZoneFor(stage);
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
      state={{ progress, stage, direction, reduced, explorationMode, scrollHudId, sceneId, dataScene, brightZone, base }}
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
        {(reduced || isSoftwareFallback || (isPhone && !hasMobileVideo)) ? (
          // Poster stand-in for the live hero. Three cases reach this path:
          //   1. Reduced-motion preference (manual or OS): four lifecycle posters
          //      cross-faded by scroll progress (opacity only), no animation.
          //   2. Software-GL fallback: SwiftShader / llvmpipe detected at probe
          //      time — the poster gives a correct, smooth experience on CPU
          //      rasterisers instead of an 6-18fps slideshow.
          //   3. Phone viewport without the pre-rendered video in the build: the
          //      capture script (scripts/capture-mobile-hero.mjs) generates the
          //      video as a separate step; when it is absent (fresh checkout / CI
          //      without the capture), use the poster slideshow so no 404 fires.
          // Reduced motion takes precedence over the phone video path so that a
          // phone user who has enabled reduced motion still gets the still posters.
          <PosterSlideshow progress={progress} base={base} />
        ) : isPhone ? (
          // Phone stand-in for the live hero: pre-rendered scroll-scrubbed portrait
          // video. currentTime is driven by `progress` inside MobileHeroVideo, so the
          // visual matches the live WebGL lifecycle without any GPU cost.
          // Tablets (≥ 768 px) and all desktops stay on the live scene below.
          // Only reached when hasMobileVideo is true (video exists in the build).
          <MobileHeroVideo progress={progress} base={base} />
        ) : (
          <>
            {/* One marker per placement, all mounted at once. Each instance gates its
                own visibility on its state being the settled one (the nebula owns three;
                the others one each) — no mount/unmount thrash, lock ownership is
                per-marker via the placement id. These ride the LIVE scene's per-frame
                marker positions, so they only mount on the live (non-reduced) path. */}
            {MARKER_PLACEMENTS.map((placement) => (
              <StarMarker
                key={placement.id}
                placement={withFeaturedProof(placement, featured)}
                markerFrameRef={markerFrameRef}
              />
            ))}
          </>
        )}
        {/* The cockpit canopy the HUD power-on DE-CLOAKS. Live renders the shared
            structural plate once after the post chain, with a restrained solid
            lifecycle-light response and no bloom. Reduced motion and the
            software-GL poster fallback mount that exact plate as a static image
            over the poster crossfade. */}
        {(reduced || isSoftwareFallback || (isPhone && !hasMobileVideo)) && <CockpitFrame />}
        <HeroIdentity />
        <ManifestoOverlay />
        {/* Finale site-index directory — positioned on the cockpit LEFT panel via CSS
            (body.hud-active.bh-at-finale, desktop-only). Hidden in centre column.
            Rendered here (not inside the beat div) so the beat-column flex context
            and its layout do not influence the panel's fixed positioning. The HUD is
            auto-powered at the finale by syncChrome, so the panel appears without any
            manual button press. */}
        <FinaleLedger visible={atFinaleState} counts={counts} />
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
