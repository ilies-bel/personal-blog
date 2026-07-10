// The manifesto overlay: sparse text beats pinned over the canvas, each shown at
// full bone across its scroll band (no fade, no direction swap, no opening intro).
// Copy + timing live colocated per scene in ../sceneTable (shared with index.astro's SSR fallback).
//
// A11Y-003 — SEMANTIC LIFECYCLE NARRATIVE:
// The visual beats below are aria-hidden (instrument dressing — the canvas already
// conveys the visual state). A static sr-only section at the top of this overlay
// carries the full ordered narrative for screen readers in a single, never-scroll-
// gated document pass (black hole → pale blue dot, matching the physical top-to-
// bottom page order). This removes the former dynamic aria-hidden toggling that
// caused continuous AT chatter on every scroll tick.
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
      {/* ── Sequential semantic narrative (A11Y-003) ─────────────────────
          An ordered, never-scroll-gated text equivalent of the reverse
          lifecycle. Always in the accessibility tree; never toggled by
          aria-hidden so screen readers get the full story in one pass,
          without any scroll-driven AT chatter.

          Physical scroll order: BLACK HOLE at the top (BEATS reversed),
          PALE BLUE DOT at the bottom — identical to the document order a
          sighted visitor experiences. Each beat gets its own <h2> (under
          the page's single <h1> in index.astro) so keyboard and AT users
          can navigate the arc chapter-by-chapter via heading navigation.

          `aria-label` on the <section> identifies this block in the
          landmark tree without adding an extra heading level. */}
      <section className="sr-only" aria-label="Stellar lifecycle narrative">
        {BEATS.slice().reverse().map((beat, i) => (
          <div key={i}>
            <h2>{beat.down}</h2>
            <p>{beat.state}. {beat.whisper}</p>
          </div>
        ))}
      </section>

      {BEATS.map((beat, i) => {
        // The fade bands are authored in LIFECYCLE space (each glued to its star
        // state), so route the raw scroll value through lifecycleProgress() — the
        // single direction seam — before reading them. This keeps every manifesto
        // line pinned to its state while it appears at the correct PHYSICAL scroll
        // position under the reverse arc.
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
            // A11Y-003: the sr-only section above is the AT narrative source.
            // Non-finale beats are aria-hidden entirely — pure visual dressing.
            // The finale beat is NOT aria-hidden because it hosts FinaleLedger,
            // the live site-index <nav>; its h2/p are aria-hidden individually
            // below. FinaleLedger gates its own AT presence via CSS
            // visibility:hidden (data-visible=false) so inert links are never
            // reachable by keyboard or AT when the beat is off-screen.
            aria-hidden={isFinale ? undefined : true}
          >
            {/* Big line: aria-hidden — sr-only section carries this copy. */}
            <h2 className="bh-beat-big" aria-hidden="true">
              <span className="bh-beat-line">{beat.down}</span>
            </h2>

            {/* Whisper: aria-hidden — sr-only section carries this copy. */}
            <p className="bh-beat-whisper" aria-hidden="true">
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
                links are inert whenever the copy is off screen. The nav uses
                CSS visibility:hidden (data-visible=false) to stay inert and
                out of the AT until the finale frame is the active beat. */}
            {isFinale ? <FinaleLedger visible={visible} /> : null}
          </div>
        );
      })}
    </div>
  );
}
