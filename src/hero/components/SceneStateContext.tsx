// Shared state for the hero island: the scroll-driven snapshot the presentational
// sub-components render from. HeroIsland provides it; ManifestoOverlay /
// HeroIdentity / ExplorationHud consume it. Frame-cadence values
// that must NOT trigger React renders stay as refs inside HeroIsland — only
// render-relevant snapshots live here.
import { createContext, useContext, type ReactNode } from 'react';
import type { ScrollDirection } from '../lib/constants';
import type { HudTargetId } from '../HudNavigation';

export interface SceneState {
  /** 0..1 presentation progress — the EASED output of the island's
   *  PresentationClock, i.e. the same value the canvas renders (NOT the raw
   *  scrollbar position). Drives the per-beat opacities and the HUD gauge, so
   *  text/chrome flip on the same lifecycle frame as the pixels behind them. */
  progress: number;
  /** The eased shader stage (0..5) from the same clock tick as `progress`.
   *  Drives the instrument readouts (station / lifecycle-time) and the
   *  bright-zone chrome flip. */
  stage: number;
  /** Scroll direction; selects the active big line per beat. */
  direction: ScrollDirection;
  /** Resolved reduced-motion preference (manual override ?? OS). When true the hero
   *  shows the still poster slideshow and the beats hard-cut (one line per band). */
  reduced: boolean;
  /** True once the final exploration HUD has taken over. */
  explorationMode: boolean;
  /** HUD target the current scroll position maps to — the last lifecycle stage
   *  scrolled past. Drives the quiet "you are here" marker so the rail tracks
   *  scroll position without expanding. */
  scrollHudId: HudTargetId | null;
  /** The lifecycle scene the live scroll position is ON (from sceneForProgress).
   *  Internal ids: beginning | nebula | yellow | red | end. Drives the per-scene HUD
   *  colour tokens + the yellow-star designed-ring overlay. */
  sceneId: HudTargetId;
  /** The scene id mapped to the public art-direction data-scene name
   *  (blackhole | red-giant | yellow-star | nebula | final), set as data-scene on the
   *  hero root so the CSS per-scene HUD token blocks can key off it. */
  dataScene: 'blackhole' | 'red-giant' | 'yellow-star' | 'nebula' | 'final';
  /** True when the hero chrome currently overlaps a BRIGHT lifecycle zone — the
   *  supernova whiteout flash and the bright yellow-star beat. Drives the adaptive
   *  dark-stroke UI: when true the overlay flips chrome text/strokes to a dark
   *  graphite for legibility against the bright canvas; false over the dark states
   *  (black hole / red giant / nebula / dot), where warm bone reads cleanly. */
  brightZone: boolean;
  /** import.meta.env.BASE_URL, resolved once. */
  base: string;
}

export interface SceneActions {
  /** Begin the cinematic dive for a marker, then navigate at the bloom apex.
   *  Falls back to a plain navigate if the scene engine hasn't mounted yet.
   *  `targetNdc` is the marker's on-screen point (so the plunge aims at it, not
   *  dead-centre); `state` selects the bloom's per-lifecycle-state tint; `label`
   *  is the audited decorative destination readout (PRD-004) carried through the
   *  bloom by the persisted overlay, then cleared on resurface (aria-hidden). */
  beginDive?: (opts: {
    href: string;
    targetNdc?: { x: number; y: number };
    state?: HudTargetId;
    label?: string;
  }) => void;
  /** Request a change to the RESOLVED reduced-motion preference (state.reduced).
   *  Drives the corner toggle button; the SAME resolved value feeds the hero's mount
   *  decision (live WebGL vs the still poster slideshow). Asymmetric: requesting
   *  reduced=true raises a confirmation modal first; requesting reduced=false (back to
   *  the live hero) applies instantly. HeroIsland owns that decision + the modal. */
  requestReducedMotion?: (next: boolean) => void;
}

const SceneStateCtx = createContext<SceneState | null>(null);
const SceneActionsCtx = createContext<SceneActions | null>(null);

interface SceneStateProviderProps {
  state: SceneState;
  actions: SceneActions;
  children: ReactNode;
}

export function SceneStateProvider({ state, actions, children }: SceneStateProviderProps) {
  return (
    <SceneStateCtx.Provider value={state}>
      <SceneActionsCtx.Provider value={actions}>{children}</SceneActionsCtx.Provider>
    </SceneStateCtx.Provider>
  );
}

export function useSceneState(): SceneState {
  const value = useContext(SceneStateCtx);
  if (value === null) throw new Error('useSceneState must be used within a SceneStateProvider');
  return value;
}

export function useSceneActions(): SceneActions {
  const value = useContext(SceneActionsCtx);
  if (value === null) throw new Error('useSceneActions must be used within a SceneStateProvider');
  return value;
}
