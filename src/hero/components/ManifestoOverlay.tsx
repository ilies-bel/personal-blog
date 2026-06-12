// The manifesto overlay: sparse text beats pinned over the canvas, each shown at
// full bone across its scroll band (no fade, no direction swap, no opening intro).
// Copy + timing live in ../beats (shared with index.astro's SSR fallback).
import { BEATS } from '../beats';
import { band, fadeInOut } from '../scroll';
import { lifecycleProgress } from '../timeline';
import { useSceneState } from './SceneStateContext';

// The closing pale-blue-dot beat is the ONE line that does NOT hard-cut: it fades
// out at the very end so the lone speck is alone in black (see its text band in
// sceneTable). Identified by state so re-ordering the table never breaks the gate.
const DOT_BEAT_STATE = 'pale blue dot';

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
        // REDUCED MOTION shows STILL posters, so each line pairs with its poster via
        // the authored band [inStart, outEnd] — a hard 0/1 step (no fade), which is the
        // no-cross-fade reduced-motion intent. (A later commit makes this gapless so a
        // line is always on screen; here it is the plain band.)
        //
        // The LIVE (non-reduced) hero keeps the authored bands too, EXCEPT the closing
        // pale-blue-dot line, which FADES rather than hard-cuts so it dims toward near-
        // nothing in the final frame (lifecycleProgress ≈ 0.0) and the lone speck is
        // alone in black. For that beat we honour the authored in/out ramp via
        // fadeInOut; every other beat keeps the hard rectangle.
        const opacity = reduced
          ? band(lifecycleP, beat.text.inStart, beat.text.outEnd)
          : beat.state === DOT_BEAT_STATE
            ? fadeInOut(
                lifecycleP,
                beat.text.inStart,
                beat.text.inEnd,
                beat.text.outStart,
                beat.text.outEnd,
              )
            : band(lifecycleP, beat.text.inStart, beat.text.outEnd);
        const visible = opacity > 0.05;
        return (
          <div
            className="bh-beat"
            key={i}
            style={{ opacity }}
            // VISUALLY both paths now show exactly the one beat whose band the
            // scroll is in (opacity hard-cuts 0/1). For A11Y the reduced-motion path
            // keeps EVERY beat in the accessibility tree (aria-hidden never set, since
            // !reduced is false) so a screen reader can reach ALL the manifesto copy —
            // the posters are aria-hidden, so this text is the page's only a11y
            // narrative. The live (non-reduced) hero hides the visually-hidden beats
            // from a11y as before (the canvas conveys the state visually).
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
