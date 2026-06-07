import { useEffect, useState } from 'react';
import { SCROLL_HINT_DISMISS_AT } from '../lib/constants';
import { useSceneState } from './SceneStateContext';

export default function ScrollHint() {
  const { progress, reduced, base } = useSceneState();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed || progress < SCROLL_HINT_DISMISS_AT) return;
    setDismissed(true);
  }, [dismissed, progress]);

  if (reduced || dismissed || progress >= SCROLL_HINT_DISMISS_AT) return null;

  const beginLifecycle = (): void => {
    setDismissed(true);
    window.scrollTo({
      top: window.innerHeight * 0.86,
      behavior: reduced ? 'auto' : 'smooth',
    });
  };

  const writingHref = `${base}/writing`.replace(/\/+/g, '/');

  return (
    <div className="bh-hint" role="group" aria-label="First visit options">
      <button className="bh-hint-start" type="button" onClick={beginLifecycle}>
        <span className="bh-hint-label">Begin lifecycle</span>
        <span className="bh-hint-line" aria-hidden="true"></span>
      </button>
      <a className="bh-hint-skip" href={writingHref} onClick={() => setDismissed(true)}>
        Read writing
      </a>
    </div>
  );
}
