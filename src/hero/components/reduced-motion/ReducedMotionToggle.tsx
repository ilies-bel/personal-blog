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
// The glyph mirrors the resolved state: a film strip with a play triangle when motion is ON,
// the same film strip struck through by a diagonal slash when motion is reduced (animation off).
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
        // STILL: a film strip struck through by a slash (animation stopped).
        // Rounded-rect body, two columns of sprocket holes on the left/right edges,
        // and a corner-to-corner diagonal slash as the universal 'disabled' overlay.
        <svg className="overlay-blog-icon" viewBox="0 0 32 32" aria-hidden="true">
          {/* Film strip outer body */}
          <rect x="8" y="4" width="16" height="24" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
          {/* Sprocket column dividers */}
          <line x1="12" y1="4" x2="12" y2="28" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="20" y1="4" x2="20" y2="28" stroke="currentColor" strokeWidth="1.5"/>
          {/* Sprocket holes — left column */}
          <rect x="9.25" y="7" width="1.5" height="1.5" fill="currentColor"/>
          <rect x="9.25" y="12" width="1.5" height="1.5" fill="currentColor"/>
          <rect x="9.25" y="17" width="1.5" height="1.5" fill="currentColor"/>
          <rect x="9.25" y="22" width="1.5" height="1.5" fill="currentColor"/>
          {/* Sprocket holes — right column */}
          <rect x="21.25" y="7" width="1.5" height="1.5" fill="currentColor"/>
          <rect x="21.25" y="12" width="1.5" height="1.5" fill="currentColor"/>
          <rect x="21.25" y="17" width="1.5" height="1.5" fill="currentColor"/>
          <rect x="21.25" y="22" width="1.5" height="1.5" fill="currentColor"/>
          {/* Diagonal slash — top-right to bottom-left across the whole glyph */}
          <line x1="25" y1="3" x2="7" y2="29" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ) : (
        // MOTION: a running film strip with a play triangle (animation on).
        // Same rounded-rect body and sprocket holes; a filled right-pointing triangle
        // in the center window reads as 'film rolling'.
        <svg className="overlay-blog-icon" viewBox="0 0 32 32" aria-hidden="true">
          {/* Film strip outer body */}
          <rect x="8" y="4" width="16" height="24" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
          {/* Sprocket column dividers */}
          <line x1="12" y1="4" x2="12" y2="28" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="20" y1="4" x2="20" y2="28" stroke="currentColor" strokeWidth="1.5"/>
          {/* Sprocket holes — left column */}
          <rect x="9.25" y="7" width="1.5" height="1.5" fill="currentColor"/>
          <rect x="9.25" y="12" width="1.5" height="1.5" fill="currentColor"/>
          <rect x="9.25" y="17" width="1.5" height="1.5" fill="currentColor"/>
          <rect x="9.25" y="22" width="1.5" height="1.5" fill="currentColor"/>
          {/* Sprocket holes — right column */}
          <rect x="21.25" y="7" width="1.5" height="1.5" fill="currentColor"/>
          <rect x="21.25" y="12" width="1.5" height="1.5" fill="currentColor"/>
          <rect x="21.25" y="17" width="1.5" height="1.5" fill="currentColor"/>
          <rect x="21.25" y="22" width="1.5" height="1.5" fill="currentColor"/>
          {/* Play triangle in the center window */}
          <path d="M13.5 12 L13.5 20 L20 16 Z" fill="currentColor"/>
        </svg>
      )}
    </button>
  );

  // Portal into the nav row when the host exists; otherwise render in place.
  return navHost ? createPortal(button, navHost) : button;
}
