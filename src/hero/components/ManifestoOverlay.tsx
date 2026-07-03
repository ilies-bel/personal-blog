// The manifesto overlay: sparse text beats pinned over the canvas, each shown at
// full bone across its scroll band (no fade, no direction swap, no opening intro).
// Copy + timing live colocated per scene in ../sceneTable (shared with index.astro's SSR fallback).
import { BEATS } from '../sceneTable';
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
        // Two visibility regimes, by path:
        //
        // 1) REDUCED MOTION shows STILL posters. The authored bands have GAPS between
        //    them; on the live hero those are filled by the morphing canvas, but with
        //    still posters they become dead, text-less, dim frames ("stuck on a dim
        //    image"). So each reduced line holds GAPLESSLY from its own inStart until
        //    the NEXT beat's inStart (minus a hair, so the inclusive band()'s handoff
        //    shows exactly one line at the boundary, never two). The final beat holds to
        //    1 (bottom of page). Exactly one headline is always on screen.
        //
        // 2) LIVE hero: the authored narrow band [inStart, outEnd] — a hard cut, the
        //    deliberate gaps filled by the morphing canvas. This includes the closing
        //    pale-blue-dot line: it used to fade toward nothing at the very bottom
        //    ("the lone speck alone in black"), but readers experienced that as the
        //    finale statement DISAPPEARING when they scrolled all the way down — so it
        //    now holds at full bone through the bottom frame like every other beat.
        const nextInStart = BEATS[i + 1]?.text.inStart;
        const opacity = reduced
          ? band(lifecycleP, beat.text.inStart, nextInStart !== undefined ? nextInStart - 1e-4 : 1)
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
