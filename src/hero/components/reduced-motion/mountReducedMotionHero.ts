// Reduced-motion mount path — the side-effects HeroIsland runs INSTEAD of building
// the WebGL scene when the resolved preference is reduced. Extracted here so the
// reduced path is self-contained and HeroIsland's mount effect stays readable.
//
// Under reduced motion we never import createScene (no rAF loop); the still poster
// slideshow stands in for the hero while the ScrollTracker (owned by HeroIsland)
// keeps the manifesto + posters scroll-driven. The one thing the reduced path still
// must do on mount:
//
//   • Lift the intro loader ourselves. createScene never fires its scene:ready
//     event here, so without this the page would sit trapped behind the loader
//     until the 8s safety backstop — but WITHOUT the "needs WebGL" note, since
//     this is a deliberate preference, not a failure.
//
// The HUD needs no explicit power-on here: it is ON BY DEFAULT (the boot FSM in
// BaseLayout lands a first-time visitor straight in `ready`), so the still-slideshow
// path gets the lit HUD for free — no HUD_POWER_EVENT dispatch, no boot animation.
import { SCENE_READY_BODY_CLASS, LOADER_GONE_BODY_CLASS } from '../../lib/constants';

/**
 * Apply the reduced-motion mount side-effects and return a cleanup. Call this from
 * HeroIsland's mount effect when the synchronously-resolved preference is reduced;
 * because `reduced` is in that effect's dependency list, toggling the corner control
 * re-runs the effect and this cleanup tears the reduced path down cleanly.
 */
export function mountReducedMotionHero(): () => void {
  if (typeof document !== 'undefined') {
    document.body.classList.add(SCENE_READY_BODY_CLASS, LOADER_GONE_BODY_CLASS);
  }
  // The loader-lift classes are persistent by design (the page has revealed), so
  // there is nothing to undo on cleanup — the HUD's power state is the FSM's alone.
  return () => {};
}
