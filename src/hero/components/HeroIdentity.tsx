// Persistent identity — fixed top-left across every beat. The sole top-left mark
// on the bare home (the small wordmark is hidden there). Fades with the opening
// chrome once scroll leaves the top (driven by body.is-scrolled in CSS).
import { useSceneState } from './SceneStateContext';

export default function HeroIdentity() {
  const { base } = useSceneState();
  return (
    <a className="bh-identity" href={base.replace(/\/+$/, '') || '/'}>
      <span className="bh-identity-name">ILIÈS BELDJILALI</span>
      <span className="bh-identity-role">Software Engineer</span>
    </a>
  );
}
