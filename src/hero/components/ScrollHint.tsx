import { SCROLL_HINT_DISMISS_AT } from '../lib/constants';
import { useSceneState } from './SceneStateContext';

export default function ScrollHint() {
  const { progress, reduced } = useSceneState();

  if (reduced || progress >= SCROLL_HINT_DISMISS_AT) return null;

  const beginLifecycle = (): void => {
    window.scrollTo({
      top: window.innerHeight * 0.86,
      behavior: reduced ? 'auto' : 'smooth',
    });
  };

  return (
    <div className="bh-hint">
      <button className="bh-hint-start" type="button" onClick={beginLifecycle}>
        <span className="bh-hint-label">Begin lifecycle</span>
        <span className="bh-hint-line" aria-hidden="true"></span>
      </button>
    </div>
  );
}
