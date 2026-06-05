// Context consumer that wires the exploration HUD to the scene state + actions, so
// HeroIsland doesn't prop-drill the HUD's eight inputs through the render tree.
// HudNavigation keeps its own presentational prop interface.
import HudNavigation from '../HudNavigation';
import { useSceneState, useSceneActions } from './SceneStateContext';

export default function ExplorationHud() {
  const { explorationMode, activeHudId, selectedHudId, scrollHudId, base } = useSceneState();
  const { onHudPreview, onHudPreviewEnd, onHudActivate, onHudClearSelection } = useSceneActions();
  return (
    <HudNavigation
      visible={explorationMode}
      activeId={activeHudId}
      selectedId={selectedHudId}
      currentId={scrollHudId}
      base={base}
      onPreview={onHudPreview}
      onPreviewEnd={onHudPreviewEnd}
      onActivate={onHudActivate}
      onClearSelection={onHudClearSelection}
    />
  );
}
