// Shared state for the hero island: the scroll-driven snapshot the presentational
// sub-components render from. HeroIsland provides it; ManifestoOverlay /
// HeroIdentity / ExplorationHud consume it. Frame-cadence values
// that must NOT trigger React renders stay as refs inside HeroIsland — only
// render-relevant snapshots live here.
import { createContext, useContext, type ReactNode } from 'react';
import type { ScrollDirection } from '../lib/constants';
import type { HudTargetId } from '../HudNavigation';

export interface SceneState {
  /** 0..1 scroll progress; drives the per-beat opacities. */
  progress: number;
  /** Scroll direction; selects the active big line per beat. */
  direction: ScrollDirection;
  /** prefers-reduced-motion: shows all beats, drops the crossfades. */
  reduced: boolean;
  /** True once the final exploration HUD has taken over. */
  explorationMode: boolean;
  /** HUD target the current scroll position maps to — the last lifecycle stage
   *  scrolled past. Drives the quiet "you are here" marker so the rail tracks
   *  scroll position without expanding. */
  scrollHudId: HudTargetId | null;
  /** import.meta.env.BASE_URL, resolved once. */
  base: string;
}

export interface SceneActions {
  /** Begin the cinematic dive for a marker, then navigate at the bloom apex.
   *  Falls back to a plain navigate if the scene engine hasn't mounted yet.
   *  `targetNdc` is the marker's on-screen point (so the plunge aims at it, not
   *  dead-centre); `state` selects the bloom's per-lifecycle-state tint. */
  beginDive?: (opts: {
    href: string;
    targetNdc?: { x: number; y: number };
    state?: HudTargetId;
  }) => void;
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
