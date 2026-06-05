// A faint scroll hint shown only at the very top; it fades on first scroll and is
// hidden entirely under reduced motion.
import { useSceneState } from './SceneStateContext';

export default function ScrollHint() {
  const { reduced, progress } = useSceneState();
  if (reduced || progress >= 0.02) return null;
  return <p className="bh-hint">scroll to rewind ↓</p>;
}
