// Persistent identity — fixed top-left across every beat. The sole top-left mark
// on the bare home (the small wordmark is hidden there). Fades with the opening
// chrome once scroll leaves the top (driven by body.is-scrolled in CSS).
import { useSceneState } from './SceneStateContext';
import { BRAND_NAME, BRAND_ROLE } from '../../consts';

export default function HeroIdentity() {
  const { base } = useSceneState();
  return (
    <a
      className="bh-identity"
      href={base.replace(/\/+$/, '') || '/'}
      aria-label={`Home — ${BRAND_NAME}, ${BRAND_ROLE}`}
    >
      <span className="bh-identity-name">{BRAND_NAME}</span>
      <span className="bh-identity-role">{BRAND_ROLE}</span>
    </a>
  );
}
