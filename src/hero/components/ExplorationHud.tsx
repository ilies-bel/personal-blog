// Context consumer that wires the exploration HUD to the scene state, so
// HeroIsland does not prop-drill the HUD's inputs through the render tree.
// HudNavigation keeps its own presentational prop interface.
import HudNavigation from '../HudNavigation';
import { useSceneState } from './SceneStateContext';

export default function ExplorationHud() {
  const { explorationMode, reduced, scrollHudId, base } = useSceneState();
  return (
    <HudNavigation
      visible={explorationMode}
      reduced={reduced}
      currentId={scrollHudId}
      base={base}
    />
  );
}
