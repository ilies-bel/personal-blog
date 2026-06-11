// The manifesto overlay: sparse text beats pinned over the canvas, each shown at
// full bone across its scroll band (no fade, no direction swap, no opening intro).
// Copy + timing live in ../beats (shared with index.astro's SSR fallback).
import { BEATS } from '../beats';
import { band } from '../scroll';
import { lifecycleProgress } from '../timeline';
import { useSceneState } from './SceneStateContext';

export default function ManifestoOverlay() {
  const { progress, reduced, explorationMode } = useSceneState();

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
        // Otherwise each beat owns a non-overlapping band [inStart, outEnd]: the
        // line is shown at FULL opacity across its whole band (no fade) so the big
        // headline always reads at the same bright bone as the identity name and
        // the active HUD labels, then hard-cuts out when the next band begins.
        const opacity = reduced
          ? 1
          : band(lifecycleP, beat.text.inStart, beat.text.outEnd);
        const visible = opacity > 0.05;
        return (
          <div
            className="bh-beat"
            key={i}
            style={{ opacity }}
            aria-hidden={!reduced && !visible}
          >
            {/* Big line: one line per beat, always shown at full bone. No
                direction-based swap — the copy is the same in both directions. */}
            <h2 className="bh-beat-big">
              <span className="bh-beat-line">{beat.down}</span>
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
