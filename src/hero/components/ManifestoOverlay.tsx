// The manifesto overlay: sparse text beats pinned over the canvas and cross-faded
// by normalized scroll progress. Copy + timing live in ../beats (shared with
// index.astro's SSR fallback).
import { useEffect, useState } from 'react';
import { BEATS } from '../beats';
import { SCROLL_DOWN, SCROLL_UP } from '../lib/constants';
import { fadeInOut, segment } from '../scroll';
import { lifecycleProgress } from '../timeline';
import { useSceneState } from './SceneStateContext';

export default function ManifestoOverlay() {
  const { progress, direction, reduced, explorationMode } = useSceneState();
  const [openingStarted, setOpeningStarted] = useState(false);

  useEffect(() => {
    if (reduced) {
      setOpeningStarted(true);
      return;
    }

    let secondFrame = 0;
    let timer = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        timer = window.setTimeout(() => setOpeningStarted(true), 180);
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.clearTimeout(timer);
    };
  }, [reduced]);

  return (
    <div
      className="bh-overlay"
      data-exploring={explorationMode}
    >
      {BEATS.map((beat, i) => {
        // The fade bands are authored in LIFECYCLE space (each glued to its star
        // state), so route the raw scroll value through lifecycleProgress() — the
        // single direction seam — before reading them. This keeps every manifesto
        // line pinned to its state ("Explore the projects." on the black hole, "I
        // build software that stays understandable." on the dot) while it now
        // appears at the correct PHYSICAL scroll position under the reverse arc.
        const lifecycleP = lifecycleProgress(progress);
        // Under reduced motion every beat is shown (so all copy is reachable).
        // Otherwise each line owns a non-overlapping explicit band: fade in, hold,
        // fade out, then leave visual-only space before the next headline arrives.
        const opacity = reduced
          ? 1
          : fadeInOut(lifecycleP, beat.text.inStart, beat.text.inEnd, beat.text.outStart, beat.text.outEnd);
        const enter = reduced ? 1 : segment(lifecycleP, beat.text.inStart, beat.text.inEnd);
        const exit = reduced ? 0 : segment(lifecycleP, beat.text.outStart, beat.text.outEnd);
        const y = (1 - enter) * 12 - exit * 16;
        const visible = opacity > 0.05;
        return (
          <div
            className="bh-beat"
            key={i}
            data-opening={i === 0 && !reduced ? (openingStarted ? 'run' : 'pending') : undefined}
            style={reduced ? { opacity } : { opacity, transform: `translate3d(0, ${y}px, 0)` }}
            aria-hidden={!reduced && !visible}
          >
            {/* Big line: each beat keeps separate down/up copy slots (the same line
                today) so a scroll-direction-specific phrasing can be reintroduced
                without touching the fade machinery above. */}
            <h2 className="bh-beat-big">
              <span
                className="bh-beat-line bh-beat-line--down"
                data-active={reduced || direction === SCROLL_DOWN}
              >
                {beat.down}
              </span>
              <span
                className="bh-beat-line bh-beat-line--up"
                data-active={reduced || direction === SCROLL_UP}
                aria-hidden={!reduced && direction !== SCROLL_UP}
              >
                {beat.up}
              </span>
            </h2>

            {/* The lifecycle state names what's on screen — the canvas already
                shows it, so it isn't rendered as visible chrome. Kept in the
                a11y tree so a screen reader still gets the state per beat. */}
            <p className="bh-beat-whisper">
              <span className="sr-only">{beat.state}. </span>
              {beat.whisper}
            </p>
          </div>
        );
      })}
    </div>
  );
}
