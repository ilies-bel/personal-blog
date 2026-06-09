import { useEffect, useReducer } from 'react';
import {
  HUD_ACTIVE_BODY_CLASS,
  HUD_BOOTING_BODY_CLASS,
  SCROLL_HINT_DISMISS_AT,
} from '../lib/constants';
import { useSceneState } from './SceneStateContext';

export default function ScrollHint() {
  const { progress, reduced } = useSceneState();

  // The corner power button can light the HUD WITHOUT any scroll (it toggles the
  // boot FSM in place at progress 0 — exactly the moment "Begin lifecycle" is on
  // screen). Scrolling re-renders this component via useSceneState's `progress`,
  // but a no-scroll power-on does not — so observe <body>'s class attribute (the
  // FSM owns hud-booting / hud-active there) and force a re-render whenever it
  // changes, so the body-class hide below stays live in BOTH paths. Cheap: one
  // attribute observer, torn down on unmount.
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(forceRender);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  if (reduced || progress >= SCROLL_HINT_DISMISS_AT) return null;

  // Also stand down while the HUD is powering up or already lit — "Begin
  // lifecycle" must not overlap the booting/active HUD. The boot FSM owns these
  // <body> classes; we re-read them at render time (re-evaluated on scroll via
  // useSceneState's `progress` AND on a no-scroll power toggle via the body-class
  // observer above, so the hide stays live). SSR-guard the document access.
  if (
    typeof document !== 'undefined' &&
    (document.body.classList.contains(HUD_ACTIVE_BODY_CLASS) ||
      document.body.classList.contains(HUD_BOOTING_BODY_CLASS))
  ) {
    return null;
  }

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
