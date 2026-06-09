// The manifesto overlay: sparse text beats pinned over the canvas and cross-faded
// by normalized scroll progress. Copy + timing live in ../beats (shared with
// index.astro's SSR fallback).
import { useEffect, useState } from 'react';
import { BEATS } from '../beats';
import { SCROLL_DOWN, SCROLL_UP } from '../lib/constants';
import { band } from '../scroll';
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
        // Under reduced motion every beat is shown (so all copy is reachable).
        // Otherwise each beat owns a non-overlapping band [inStart, outEnd]: the
        // line is shown at FULL opacity across its whole band (no fade) so the big
        // headline always reads at the same bright bone as the identity name and
        // the active HUD labels, then hard-cuts out when the next band begins.
        const opacity = reduced
          ? 1
          : band(progress, beat.text.inStart, beat.text.outEnd);
        const y = 0;
        const visible = opacity > 0.05;
        return (
          <div
            className="bh-beat"
            key={i}
            data-opening={i === 0 && !reduced ? (openingStarted ? 'run' : 'pending') : undefined}
            style={reduced ? { opacity } : { opacity, transform: `translate3d(0, ${y}px, 0)` }}
            aria-hidden={!reduced && !visible}
          >
            {/* Big line: direction-specific copy lets the same visual state read as
                a forward lifecycle on scroll down and a reverse arc on scroll up. */}
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
