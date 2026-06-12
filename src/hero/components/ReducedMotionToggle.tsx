// Reduced-motion toggle — a corner glyph button that joins the top-right opening
// chrome (the .overlay-blog power/section row). It reads the RESOLVED reduced-motion
// preference from the scene context (the single source of truth that ALSO drives the
// hero's mount decision) and flips it via the context action, so one click swaps the
// live WebGL hero for the still poster slideshow (and back) with no reload.
//
// PLACEMENT (BUG 4 fix): the .overlay-blog row is RIGHT-anchored and grows LEFTWARD as
// its labels unfurl under hud-active (its left edge swings hundreds of px between the
// resting + hud-active states). A single fixed `right:` offset therefore cannot clear
// the row in BOTH states at once — the earlier `position: fixed; right: <power+gap>`
// landed the toggle ON TOP of the socials/links. So instead of a brittle fixed offset,
// the button is PORTALED into the .overlay-blog flex row as its LEFTMOST child: it now
// flows in the same flex line as the section icons / socials / power button, so it can
// never overlap them at any width or breakpoint, and it reads as one set by
// construction. It still lives in the React island (keeping its scene-context wiring) —
// only its DOM node is relocated into the existing nav. On pages without that nav (or
// before it exists) it falls back to rendering in place.
//
// Visually it reuses the sibling power button's class (.overlay-blog-power) so it
// reads as one set; the .overlay-blog-motion modifier only carries the (now flow-based)
// placement tweaks. The glyph swaps to mirror the resolved state: a "waves" motion mark
// when motion is ON, a paused/still bars mark when motion is reduced.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSceneActions, useSceneState } from './SceneStateContext';

export default function ReducedMotionToggle() {
  const { reduced } = useSceneState();
  const { toggleReducedMotion } = useSceneActions();

  // The .overlay-blog nav is server-rendered by BaseLayout, so it is in the DOM by the
  // time this island hydrates — but resolve it in an effect (after mount) so the lookup
  // is client-only and SSR-safe, and re-resolve on an SPA navigation. Null until found
  // (or on pages with no nav) → the button renders in place as a graceful fallback.
  const [navHost, setNavHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const resolveHost = (): void => {
      setNavHost(document.querySelector<HTMLElement>('.overlay-blog'));
    };
    resolveHost();
    // ClientRouter swaps the DOM on navigation; re-resolve the host after a swap so the
    // portal target is never a detached, stale node.
    document.addEventListener('astro:page-load', resolveHost);
    return () => document.removeEventListener('astro:page-load', resolveHost);
  }, []);

  // The aria-label names what the CLICK does (the opposite of the current state),
  // so a screen reader announces the action, not the status. aria-pressed carries
  // the current reduced state for assistive tech that reads toggle buttons.
  const label = reduced ? 'Enable motion' : 'Reduce motion';

  const button = (
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

  // Portal into the nav row as its leftmost child when the host exists; otherwise
  // render in place (fixed-position fallback via .overlay-blog-motion in scene.css).
  return navHost ? createPortal(button, navHost) : button;
}
