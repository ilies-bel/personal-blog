// Reduced-motion mount path — the side-effects HeroIsland runs INSTEAD of building
// the WebGL scene when the resolved preference is reduced. Extracted here so the
// reduced path is self-contained and HeroIsland's mount effect stays readable.
//
// Under reduced motion we never import createScene (no rAF loop); the still poster
// slideshow stands in for the hero while the ScrollTracker (owned by HeroIsland)
// keeps the manifesto + posters scroll-driven. This helper covers the two things
// the reduced path still must do on mount, and returns a cleanup for both:
//
//   1. Lift the intro loader ourselves. createScene never fires its scene:ready
//      event here, so without this the page would sit trapped behind the loader
//      until the 8s safety backstop — but WITHOUT the "needs WebGL" note, since
//      this is a deliberate preference, not a failure.
//   2. Power the HUD on immediately. The live hero only lights the HUD once scroll
//      reaches the bottom (the "you've reached the end, here's the menu" beat), but
//      the reduced path is a quiet still slideshow with no such arrival moment — so
//      we ask the boot FSM (BaseLayout owns body.hud-active) to power on at once.
import {
  SCENE_READY_BODY_CLASS,
  LOADER_GONE_BODY_CLASS,
  SCROLLED_BODY_CLASS,
  HUD_BOOTING_BODY_CLASS,
  HUD_POWER_EVENT,
  type HudPowerEventDetail,
} from '../../lib/constants';

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

  // We request a NO-BOOT power-on (detail.on:true) so the rail/menu appear without
  // the ignition animation. requestAnimationFrame defers one tick so the FSM's
  // page-load listener is guaranteed attached before the event fires (hydration can
  // run either side of it). Re-dispatched on every reduced re-entry — the FSM keeps
  // the HUD lit once on, so a repeat request is a harmless no-op.
  const lightHud = (): void => {
    window.dispatchEvent(
      new CustomEvent<HudPowerEventDetail>(HUD_POWER_EVENT, {
        detail: { on: true, source: 'scroll' },
      }),
    );
  };
  const hudRaf = requestAnimationFrame(lightHud);

  return () => {
    cancelAnimationFrame(hudRaf);
    if (typeof document !== 'undefined') {
      document.body.classList.remove(SCROLLED_BODY_CLASS, HUD_BOOTING_BODY_CLASS);
    }
  };
}
