// The manifesto overlay: sparse text beats pinned over the canvas, each shown at
// full bone across its scroll band (no fade, no direction swap, no opening intro).
// Copy + timing live colocated per scene in ../sceneTable (shared with index.astro's SSR fallback).
import { BEATS, SCENES } from '../sceneTable';
import { band } from '../scroll';
import { lifecycleProgress } from '../timeline';
import { resolveHref } from '../lib/url';
import FinaleLedger from './FinaleLedger';
import { useSceneState } from './SceneStateContext';

export default function ManifestoOverlay() {
  const { progress, reduced, explorationMode, base } = useSceneState();

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
        // Declared per-beat layout variant (sceneTable), NOT an index test: the
        // finale beat renders as a centred full-viewport column (copy upper-
        // middle, ledger pinned at the bottom) composed around the anchored dot
        // marker; every other beat keeps the shared bottom-left position.
        const isFinale = beat.layout === 'finale';
        return (
          <div
            className={isFinale ? 'bh-beat bh-beat--finale' : 'bh-beat'}
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

            {/* Reduced-motion edition: a contextual destination link per beat (except
                the finale, which already exposes all sections via FinaleLedger).
                Provides "same destinations" parity with the star markers on the live
                path — each beat's section destination is reachable in-context at the
                matching scroll position, not only via the HUD rail. Inert while
                outside the band (tabIndex -1, aria-hidden) so it never adds stray
                focus stops or invisible hit targets. */}
            {reduced && !isFinale && (
              <a
                href={resolveHref(base, SCENES[i].hud.href)}
                className="bh-beat-destination"
                tabIndex={visible ? 0 : -1}
                aria-hidden={!visible}
              >
                {SCENES[i].hud.destination}
                <span aria-hidden="true"> →</span>
              </a>
            )}
            {/* The finale's payoff: the site index, pinned to the bottom of the
                finale column. Shares this beat's exact visibility band (live
                hard-cut AND the reduced-motion gapless regime) via `visible`;
                the ledger gates its own visibility/pointer-events on it so the
                links are inert whenever the copy is off screen. */}
            {isFinale ? <FinaleLedger visible={visible} /> : null}
          </div>
        );
      })}
    </div>
  );
}
