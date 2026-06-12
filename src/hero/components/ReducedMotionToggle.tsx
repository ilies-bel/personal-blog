// Reduced-motion toggle — a corner glyph button that joins the top-right opening
// chrome (the .overlay-blog power/section row). It reads the RESOLVED reduced-motion
// preference from the scene context (the single source of truth that ALSO drives the
// hero's mount decision) and flips it via the context action, so one click swaps the
// live WebGL hero for the still poster slideshow (and back) with no reload.
//
// Visually it reuses the sibling power button's class (.overlay-blog-power) so it
// reads as one set; an extra modifier class positions it just left of that button
// (see scene.css). The glyph swaps to mirror the resolved state: a "waves" motion
// mark when motion is ON, a paused/still bars mark when motion is reduced.
import { useSceneActions, useSceneState } from './SceneStateContext';

export default function ReducedMotionToggle() {
  const { reduced } = useSceneState();
  const { toggleReducedMotion } = useSceneActions();

  // The aria-label names what the CLICK does (the opposite of the current state),
  // so a screen reader announces the action, not the status. aria-pressed carries
  // the current reduced state for assistive tech that reads toggle buttons.
  const label = reduced ? 'Enable motion' : 'Reduce motion';

  return (
    <button
      type="button"
      className="overlay-blog-power overlay-blog-motion"
      aria-label={label}
      aria-pressed={reduced}
      onClick={toggleReducedMotion}
    >
      {reduced ? (
        // STILL: two paused vertical bars (motion reduced). Matched to the
        // section-icon weight (1.5 stroke, round caps) so the corner reads as a set.
        <svg className="overlay-blog-icon" viewBox="0 0 32 32" aria-hidden="true">
          <path
            d="M13 9 L13 23 M19 9 L19 23"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        // MOTION: three stacked waves (motion on). Same weight/footprint.
        <svg className="overlay-blog-icon" viewBox="0 0 32 32" aria-hidden="true">
          <path
            d="M7 12 Q11 8 16 12 Q21 16 25 12 M7 16 Q11 12 16 16 Q21 20 25 16 M7 20 Q11 16 16 20 Q21 24 25 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
