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
// The glyph is Lucide Icons' `video-off` (MIT-licensed, https://lucide.dev/icons/video-off):
// a camera struck through by a single diagonal slash. It is STATIC — the same icon in both
// states — so the slashed camera is the constant mark for the control; only aria-pressed and
// the aria-label change as the state flips. A thin-stroke 24-grid line icon matching the
// sibling Power glyph's weight, its slash stays crisp at the ring's ~18px size.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSceneActions, useSceneState } from '../SceneStateContext';

export default function ReducedMotionToggle() {
  const { reduced } = useSceneState();
  const { requestReducedMotion } = useSceneActions();

  // The .overlay-blog nav is server-rendered by BaseLayout, so on a page that HAS the nav
  // the toggle should portal into that row. On a page WITHOUT it, the toggle falls back to
  // a fixed-position corner render (.bh-root > .overlay-blog-motion, scene.css).
  //
  // The host is resolved in a post-mount effect (client-only, SSR-safe, and re-runs on an
  // SPA navigation). The catch: the fixed-position fallback's `right:` offset lands EXACTLY
  // on the X social icon in the nav row, so rendering the fallback even for a single frame
  // on a page that does have the nav flashes the camera glyph on top of the X — a visible
  // ~1s overlap on a slow hydrate (the window a user would notice + screenshot).
  //
  // So the state is TRISTATE, and the fallback is gated on a CONFIRMED absence rather than
  // a not-yet-resolved one:
  //   • undefined — host not resolved yet → render NOTHING (never the flashing fallback).
  //   • HTMLElement — nav found → portal into the row.
  //   • null — resolution ran and found no nav → render the fixed-position fallback.
  // The first paint is `undefined`, so the fallback can only ever appear on a page that
  // genuinely has no nav, never as a transient flash over the X on one that does.
  const [navHost, setNavHost] = useState<HTMLElement | null | undefined>(undefined);
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
  // The visible .overlay-blog-motion-label shows the CURRENT STATE ("STILL" / "MOTION")
  // so sighted users can read the mode without relying on color alone.
  const label = reduced ? 'Enable motion' : 'Reduce motion';

  const button = (
    <button
      type="button"
      className="overlay-blog-power overlay-blog-motion"
      aria-label={label}
      aria-pressed={reduced}
      onClick={() => requestReducedMotion?.(!reduced)}
    >
      {/* Lucide `video-off` — a camera struck through by a single diagonal slash. Static
          across both states; the slashed camera is the constant mark for the control. */}
      <svg
        className="overlay-blog-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196" />
        <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
        <path d="m2 2 20 20" />
      </svg>
      {/* Visible state label — named the CURRENT MODE ("STILL" / "MOTION") so the
          control's state is legible to sighted users without hover or inspection.
          aria-hidden so screen readers hear the action label above, not a duplicate. */}
      <span className="overlay-blog-motion-label" aria-hidden="true">
        {reduced ? 'Still' : 'Motion'}
      </span>
    </button>
  );

  // undefined → not resolved yet: render nothing (avoids the fixed-fallback flash over
  // the X). A found host → portal into the nav row. null → resolution confirmed no nav on
  // this page → render the fixed-position fallback in place.
  if (navHost === undefined) return null;
  return navHost ? createPortal(button, navHost) : button;
}
