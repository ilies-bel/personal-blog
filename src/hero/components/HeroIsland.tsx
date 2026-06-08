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
import { SCROLL_SECTION_COUNT, BUILT_STAGES } from '../beats';
import { legacyStageForProgress, progressForLegacyStage } from '../timeline';
import { HUD_NAV_BY_ID, hudIdForStage, type HudTargetId } from '../HudNavigation';
import { sampleHudLuminance } from '../lib/hudLuminance';
import { prefersReducedMotion } from '../lib/config';
import {
  SCROLLED_BODY_CLASS,
  HUD_SELECTED_STORAGE_KEY,
  SCROLL_DOWN,
  SCROLL_UP,
  type ScrollDirection,
  DIRECTION_DEADZONE,
  CHROME_HIDE_AT,
  SCROLL_HINT_DISMISS_AT,
  EXPLORATION_TRIGGER_AT,
  EXPLORATION_REVEAL_DELAY_MS,
  DEBUG_WINDOW_KEYS,
  CURSOR_WINDOW_KEYS,
  readDebugNumber,
} from '../lib/constants';
import { createScene } from '../scene/createScene';
import { SceneStateProvider } from './SceneStateContext';
import HeroIdentity from './HeroIdentity';
import ManifestoOverlay from './ManifestoOverlay';
import ExplorationHud from './ExplorationHud';
import ScrollHint from './ScrollHint';

declare global {
  interface Window {
    /** Published by the live hero (this component) so the standalone custom-cursor
     *  IIFE can ask whether a screen point is over the red giant's surface — the
     *  cursor shows its interactive hexagon there. Absent on pages without the
     *  scrollable hero (about, …). Key literal = CURSOR_WINDOW_KEYS.hitGiant. */
    __bhHitGiant?: (clientX: number, clientY: number) => boolean;
  }
}

interface HeroIslandProps {
  /** Backdrop mode: render only the scene canvas (no manifesto beats, no chrome,
   *  no scroll subscription) pinned to a fixed lifecycle frame. Used by reading
   *  pages (about, …) that want the signature object as a dimmed, static backdrop
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

// --- adaptive HUD contrast sampler tuning ----------------------------------
// The rail's color/opacity/scale adapt to a SYNTHETIC estimate of the scene
// luminance behind the left rail (sampleHudLuminance, keyed off the lifecycle
// stage). These constants + the applyVars() response curves below (plus the
// HUD_LUMINANCE_TABLE in hudLuminance.ts) are the whole tuning surface.
/** Sampler cadence: only recompute when this many ms have passed (~12fps). */
const HUD_SAMPLE_INTERVAL_MS = 80;
/** Exponential low-pass factor (per tick) on luma/noise. High enough to TRACK a
 *  scroll in ~1s (at 0.12 it took ~8s to cross the range and read as "no change"),
 *  low enough to stay flicker-free. ~3-tick (≈0.25s) time-constant. */
const HUD_SMOOTHING_K = 0.35;
/** Hysteresis: dark→bright only once smoothed luma climbs above this. */
const HUD_LUME_BRIGHT_ENTER = 0.6;
/** Hysteresis: bright→dark only once smoothed luma falls below this. */
const HUD_LUME_BRIGHT_EXIT = 0.45;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Clamp then round to 3 decimals so CSS writes stay short and only change on
 *  a meaningful delta (avoids per-frame string churn / layout thrash). */
const round3 = (x: number): number => Math.round(x * 1000) / 1000;

export default function HeroIsland({ backdrop = false, backdropStage = BUILT_STAGES }: HeroIslandProps = {}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // The .bh-root element. The adaptive HUD contrast sampler writes its CSS
  // variables (and the discrete data-lume mode) here so they cascade down to the
  // .hud-system rail.
  const rootRef = useRef<HTMLDivElement>(null);
  // Optional debug readout element (mounted only when __bhHudLume is set). The
  // sampler writes live values into it via textContent to avoid React re-renders.
  const hudLumeReadoutRef = useRef<HTMLDivElement>(null);
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

    const clearExplorationTimer = (): void => {
      if (explorationTimerRef.current == null) return;
      window.clearTimeout(explorationTimerRef.current);
      explorationTimerRef.current = null;
    };
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
    const openExploration = (): void => {
      explorationModeRef.current = true;
      setExplorationMode(true);
      publishProgress(progressRef.current, true);
      // The HUD just appeared — bring the name + menu back immediately rather
      // than waiting for the next scroll event.
      syncChrome();
    };

    const tracker = new ScrollTracker(SCROLL_SECTION_COUNT);
    const unsub = tracker.subscribe((scrollState) => {
      progressRef.current = scrollState.progress;
      publishProgress(scrollState.progress);
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
      // uninterrupted; they return at the top — and again once the HUD is present at
      // the bottom (syncChrome reuses the exploration status). A class on <body>
      // drives both (the menu lives outside this island).
      syncChrome();

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
    publishedProgressRef.current = initial.progress;
    lastProgressRef.current = initial.progress;
    setProgress(initial.progress);

    // One normalized forward progress value owns the public choreography. The
    // shader stage is a legacy implementation coordinate derived from it.
    const getStage = (): number => {
      const activeItem = explorationModeRef.current && !isReduced && activeHudRef.current
        ? HUD_NAV_BY_ID[activeHudRef.current]
        : null;
      return activeItem?.stage ?? legacyStageForProgress(progressRef.current);
    };
    const getProgress = (): number => {
      const activeItem = explorationModeRef.current && !isReduced && activeHudRef.current
        ? HUD_NAV_BY_ID[activeHudRef.current]
        : null;
      return activeItem ? activeItem.progress ?? progressForLegacyStage(activeItem.stage) : progressRef.current;
    };

    const dispose = createScene(host, isReduced, {
      getStage,
      getProgress,
      getFocusTarget: () => activeHudRef.current,
      isExplorationMode: () => explorationModeRef.current,
    });
    // Bridge the scene's red-giant hit-test to the standalone custom cursor (which
    // can't import scene/three code). Published on window under the __bh* hook
    // convention; deleted on unmount so other pages never see a stale closure.
    window[CURSOR_WINDOW_KEYS.hitGiant] = dispose.hitTestGiant;
    return () => {
      clearExplorationTimer();
      unsub();
      tracker.stop();
      delete window[CURSOR_WINDOW_KEYS.hitGiant];
      dispose();
      // Leave the body in a clean state if the island unmounts mid-scroll.
      document.body.classList.remove(SCROLLED_BODY_CLASS);
    };
  }, [backdrop, backdropStage, motionPreferenceVersion]);

  // --- adaptive HUD contrast sampler -----------------------------------------
  // Drives the rail's color/opacity/scale from a SYNTHETIC estimate of the scene
  // luminance behind the left rail (no GPU readback — the renderer has no
  // preserveDrawingBuffer, so canvas pixels read back black; see hudLuminance.ts).
  // A throttled (~12fps) rAF loop samples the lifecycle stage, low-pass-filters
  // luma/noise, derives the --hud-* CSS variables, and writes them on .bh-root so
  // they cascade to .hud-system. It never runs in backdrop mode (no HUD there).
  useEffect(() => {
    if (backdrop) return;
    if (typeof window === 'undefined' || typeof performance === 'undefined') return;
    const root = rootRef.current;
    if (!root) return;

    // Smoothed (low-passed) luma/noise — seeded to the CURRENT frame's value (not
    // a hardcoded dark guess) so the rail starts correct and the filter only has
    // to TRACK changes, never climb the whole range from black on every mount.
    const seed = sampleHudLuminance(legacyStageForProgress(progressRef.current));
    const sm = { luma: seed.luma, noise: seed.noise };
    // Discrete brightness mode (hysteresis-gated), seeded from the current luma.
    let lume: 'dark' | 'bright' = seed.luma >= HUD_LUME_BRIGHT_ENTER ? 'bright' : 'dark';
    // Last-written rounded values, so setProperty only fires on a real change.
    const written: Record<string, number> = {};
    let last = 0;
    let rafId = 0;

    const setVar = (name: string, value: number): void => {
      if (written[name] === value) return;
      written[name] = value;
      root.style.setProperty(name, String(value));
    };

    // Map smoothed luma (L) + noise (N) → the rail's CSS variables. This is the
    // response-curve surface: tweak a formula here to retune how the HUD reacts.
    const applyVars = (L: number, N: number): void => {
      // Tonal inversion: ink lightness is the OPPOSITE of the background luminance.
      // Full-range crossover (smoothstep around mid-grey) so the ink flips light↔dark
      // continuously and never lingers as low-contrast mid-grey over a mid-grey field.
      const invert = L * L * (3 - 2 * L); // smoothstep(0,1,L)
      setVar('--hud-ink-dark-weight', round3(invert * 100));
      // Warm glow: strong on dark frames, gone on bright ones.
      setVar('--hud-glow-opacity', round3(clamp01(1 - L) * 0.55));
      // Opposite-tone outline halo: rises with brightness AND noise, capped ~0.9.
      setVar('--hud-outline-opacity', round3(Math.min(0.9, clamp01(L * 0.7 + N * 0.4))));
      // Rail line: modest, lifts slightly with noise, kept in ~[0.30, 0.5].
      setVar('--hud-line-opacity', round3(clamp01(Math.min(0.5, Math.max(0.3, 0.34 + N * 0.12)))));
      // Soft scrim: low baseline, rises with L + N, capped LOW (a lane, not a card).
      setVar('--hud-backdrop-opacity', round3(Math.min(0.32, Math.max(0.1, 0.1 + L * 0.14 + N * 0.1))));
      // Active node stays clearest on messy frames.
      setVar('--hud-active-scale', round3(Math.min(1.06, 1 + N * 0.05)));
      setVar('--hud-active-opacity', round3(Math.min(1, Math.max(0.94, 0.94 + L * 0.06))));
      // Inactive nodes drop back as the field gets noisier.
      setVar('--hud-inactive-opacity', round3(Math.min(0.7, Math.max(0.5, 0.7 - N * 0.2))));
    };

    const tick = (): void => {
      rafId = window.requestAnimationFrame(tick);
      const now = performance.now();
      if (now - last < HUD_SAMPLE_INTERVAL_MS) return;
      last = now;

      const stage = legacyStageForProgress(progressRef.current);
      const { luma, noise } = sampleHudLuminance(stage);

      // Exponential smoothing (low-pass) — kills flicker; NOT an oscillation.
      sm.luma += (luma - sm.luma) * HUD_SMOOTHING_K;
      sm.noise += (noise - sm.noise) * HUD_SMOOTHING_K;

      // Hysteresis on the discrete brightness mode so it doesn't chatter at the
      // boundary. Only flip on the entry/exit thresholds, write only on change.
      const wasBright = lume === 'bright';
      if (!wasBright && sm.luma > HUD_LUME_BRIGHT_ENTER) lume = 'bright';
      else if (wasBright && sm.luma < HUD_LUME_BRIGHT_EXIT) lume = 'dark';
      if (root.dataset.lume !== lume) root.dataset.lume = lume;

      applyVars(sm.luma, sm.noise);

      // Debug readout (only mounted when __bhHudLume is set). Re-read the key per
      // tick so toggling it live still updates / pauses the text cheaply.
      const readout = hudLumeReadoutRef.current;
      if (readout && readDebugNumber(DEBUG_WINDOW_KEYS.hudLume)) {
        readout.textContent =
          `stage ${stage.toFixed(2)}  ` +
          `L ${luma.toFixed(2)}/${sm.luma.toFixed(2)}  ` +
          `N ${noise.toFixed(2)}/${sm.noise.toFixed(2)}  ` +
          `lume ${lume}`;
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
    // Intentionally NOT keyed on explorationMode: the loop runs from mount so the
    // smoothing state persists across the whole session (no re-seed / re-darken
    // when the HUD reveals). It's cheap (~12fps, writes only on a rounded delta).
  }, [backdrop]);

  const base = import.meta.env.BASE_URL ?? '/';
  // Debug: mount the adaptive-contrast readout panel only when __bhHudLume is set
  // (read once at render; the sampler then re-reads per tick to drive the text).
  const hudLumeDebug = !backdrop && Boolean(readDebugNumber(DEBUG_WINDOW_KEYS.hudLume));
  // Scroll-spy: the HUD target the live scroll position maps to. Derived from the
  // same forward-progress → shader-stage expression the scene uses.
  const scrollHudId = explorationMode ? hudIdForStage(legacyStageForProgress(progress)) : null;
  // The loud "active" treatment (rail expands, label revealed) is reserved for a
  // deliberate hover/focus preview or a committed selection — NOT scroll. Scroll
  // gets the quiet `scrollHudId` marker below, so the rail never expands/collapses
  // just from scrolling past a stage.
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
      state={{ progress, direction, reduced, explorationMode, activeHudId, selectedHudId, scrollHudId, base }}
      actions={{
        onHudPreview: handleHudPreview,
        onHudPreviewEnd: handleHudPreviewEnd,
        onHudActivate: handleHudActivate,
        onHudClearSelection: handleHudClearSelection,
      }}
    >
      <div className="bh-root" data-exploring={explorationMode} ref={rootRef}>
        <div className="bh-stage" ref={hostRef} aria-hidden="true" />
        <HeroIdentity />
        <ManifestoOverlay />
        <ExplorationHud />
        <ScrollHint />
        {hudLumeDebug && (
          <div
            ref={hudLumeReadoutRef}
            aria-hidden="true"
            style={{
              position: 'fixed',
              left: '0.75rem',
              bottom: '0.75rem',
              zIndex: 9999,
              padding: '0.3rem 0.45rem',
              font: '11px/1.3 ui-monospace, "SF Mono", Menlo, monospace',
              color: '#9fe',
              background: 'rgba(0, 0, 0, 0.72)',
              border: '1px solid rgba(159, 238, 255, 0.4)',
              borderRadius: '4px',
              whiteSpace: 'pre',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </SceneStateProvider>
  );
}
