// Context consumer that wires the exploration HUD to the scene state, so
// HeroIsland does not prop-drill the HUD's inputs through the render tree.
// HudNavigation keeps its own presentational prop interface.
//
// One value IS prop-drilled: the scene's per-frame marker frame ref. It is a
// frame-cadence ref (never a render trigger), so it does not belong in the
// scene-state context (which publishes render-relevant snapshots); HeroIsland
// owns it and passes it straight through here to the compass.
import HudNavigation from '../HudNavigation';
import type { MarkerFrame } from '../scene/types';
import { useSceneState } from './SceneStateContext';

interface ExplorationHudProps {
  /** The scene's per-frame marker frame, owned by HeroIsland. The compass reads
   *  it to find the on-screen marker nearest the cursor. */
  markerFrameRef: React.RefObject<MarkerFrame | null>;
}

export default function ExplorationHud({ markerFrameRef }: ExplorationHudProps) {
  const { explorationMode, reduced, scrollHudId, base } = useSceneState();
  return (
    <HudNavigation
      visible={explorationMode}
      reduced={reduced}
      currentId={scrollHudId}
      base={base}
      markerFrameRef={markerFrameRef}
    />
  );
}
