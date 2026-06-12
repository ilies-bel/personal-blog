// Reduced-motion toggle — a corner glyph button that joins the top-right opening
// chrome (the .overlay-blog power/section row). It reads the RESOLVED reduced-motion
// preference from the scene context (the single source of truth that also drives the
// hero's mount decision) and asks the context to change it.
//
// Asymmetric flow (the modal feature): clicking to ENTER reduced motion does NOT flip
// directly — it requests a change and HeroIsland raises a confirmation modal first;
// clicking to leave reduced motion (back to the live hero) flips instantly. Either
// way the single context action `requestReducedMotion` owns the decision, so the
// button stays a dumb trigger.
//
// PLACEMENT: the .overlay-blog row is right-anchored and grows leftward as its labels
// unfurl under hud-active, so a single fixed `right:` offset cannot clear it in both
// states. Instead the button is PORTALED into the .overlay-blog flex row as a child:
// it flows in the same line as the section icons / socials / power button, so it can
// never overlap them at any width. On pages without that nav it falls back to
// rendering in place (fixed-position via .overlay-blog-motion in scene.css).
//
// The glyph mirrors the resolved state: a "waves" mark when motion is ON, paused bars
// when motion is reduced.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSceneActions, useSceneState } from '../SceneStateContext';

export default function ReducedMotionToggle() {
  const { reduced } = useSceneState();
  const { requestReducedMotion } = useSceneActions();

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
    document.addEventListener('astro:page-load', resolveHost);
    return () => document.removeEventListener('astro:page-load', resolveHost);
  }, []);

  // The aria-label names what the CLICK does (the opposite of the current state), so a
  // screen reader announces the action. aria-pressed carries the current reduced state.
  const label = reduced ? 'Enable motion' : 'Reduce motion';

  const button = (
    <button
      type="button"
      className="overlay-blog-power overlay-blog-motion"
      aria-label={label}
      aria-pressed={reduced}
      onClick={() => requestReducedMotion?.(!reduced)}
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

  // Portal into the nav row when the host exists; otherwise render in place.
  return navHost ? createPortal(button, navHost) : button;
}
