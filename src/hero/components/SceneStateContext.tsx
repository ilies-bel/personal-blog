// Shared state for the hero island: the scroll-driven snapshot the presentational
// sub-components render from, plus the HUD action callbacks. HeroIsland provides
// it; ManifestoOverlay / HeroIdentity / ScrollHint consume it. Frame-cadence
// values that must NOT trigger React renders stay as refs inside HeroIsland — only
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
  /** HUD target under a deliberate hover/focus preview, or the committed
   *  selection (preview wins). Drives the loud active treatment (rail expands,
   *  label revealed). Scroll does NOT feed this — see scrollHudId. */
  activeHudId: HudTargetId | null;
  /** HUD target the visitor has committed to (click). Owns the inline route link. */
  selectedHudId: HudTargetId | null;
  /** HUD target the current scroll position maps to — the last lifecycle stage
   *  scrolled past. Drives the quiet "you are here" marker so the rail tracks
   *  scroll even when nothing is hovered or selected, without expanding. */
  scrollHudId: HudTargetId | null;
  /** import.meta.env.BASE_URL, resolved once. */
  base: string;
}

export interface SceneActions {
  onHudPreview: (id: HudTargetId) => void;
  onHudPreviewEnd: () => void;
  onHudActivate: (id: HudTargetId) => void;
  onHudClearSelection: () => void;
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
