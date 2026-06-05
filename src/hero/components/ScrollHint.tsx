// A faint affordance shown only at the very top; it fades on first scroll and is
// hidden entirely under reduced motion. The word that earns its place is the
// surprise — this scroll rewinds a stellar lifecycle — not "scroll" itself, so
// the hint is just "rewind".
import { useSceneState } from './SceneStateContext';

export default function ScrollHint() {
  const { reduced, progress } = useSceneState();
  if (reduced || progress >= 0.02) return null;
  return (
    <div className="bh-hint" aria-hidden="true">
      <span className="bh-hint-label">rewind</span>
      <span className="bh-hint-line" />
    </div>
  );
}
