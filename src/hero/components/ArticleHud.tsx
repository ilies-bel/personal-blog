// ArticleHud — the reading-frame cockpit, in the hero's mono-gold HUD language.
//
// It brings the hero's instrument grammar across the index→article threshold so the
// reading frame feels like the SAME cockpit, not a blog. It is a PASSIVE readout, not
// a navigator (the hero rail dives between celestial scenes; here you are reading one
// article, top to bottom) — so it shows:
//   • a thin left PROGRESS RAIL that fills with article scroll (mirrors the hero
//     nav-rail geometry / tokens in hud.css);
//   • a SECTION READOUT — `02 / 04 · ISLANDS: HYDRATE WHAT MOVES` — the current
//     heading index over count, plus the active section title, in the mono caps
//     readout style;
//   • the active CELESTIAL BEAT name, resolved from the scene stage the article is
//     scrubbing through using the SAME labels the hero rail uses (HUD_NAV_BY_ID), so
//     the chrome and the backdrop never disagree about which beat you're on.
//
// CROSS-ROOT WIRING: this is its own island (Astro islands don't share React
// context), so it reads scroll from the window `scene:progress` event ArticleScene
// dispatches — the same window-event seam the hero uses between its own pieces — and
// its section list from an IntersectionObserver over the article's <h2>s. Both the
// listener and the spy live in the shared useSceneProgress hook (GraveyardHud uses
// the same), so the two reading HUDs can't drift. No props threaded across roots.
import { useMemo } from 'react';
import { HUD_NAV_BY_ID } from '../HudNavigation';
import { settledIdForStage, type HudTargetId } from '../sceneTable';
import { brightZoneFor } from '../timeline';
import { pad2, useScrollSpy, useSceneProgress } from './useSceneProgress';

interface ArticleSection {
  /** Heading element id (set by the layout) so the readout can deep-link / spy. */
  id: string;
  /** The heading's text — shown in the readout. */
  title: string;
}

interface ArticleHudProps {
  /** The article's section headings, in document order. Provided by the layout
   *  (extracted from the rendered MDX h2s) so the readout shows N / total + title. */
  sections: readonly ArticleSection[];
}

// The five lifecycle scene ids, ordered black-hole → nebula by stage, for naming the
// active beat when the article's exact stage falls mid-transition (settledIdForStage
// returns null between settled holds). We pick the nearest settled id by HUD stage.
const BEAT_LABEL_FALLBACK = 'IN TRANSIT';

/** Name the celestial beat for a getStage value using the hero's OWN row labels.
 *  Prefer the settled-window id; otherwise the nearest HUD row by stage. Reusing
 *  HUD_NAV_BY_ID guarantees the article chrome and the hero rail speak identically. */
function beatLabelForStage(stage: number): string {
  const settled = settledIdForStage(stage);
  if (settled) return HUD_NAV_BY_ID[settled]?.label ?? BEAT_LABEL_FALLBACK;
  // Mid-transition: choose the HUD row whose authored stage is closest.
  let nearest: HudTargetId | null = null;
  let best = Infinity;
  for (const item of Object.values(HUD_NAV_BY_ID)) {
    const d = Math.abs(item.stage - stage);
    if (d < best) {
      best = d;
      nearest = item.id;
    }
  }
  return nearest ? (HUD_NAV_BY_ID[nearest]?.label ?? BEAT_LABEL_FALLBACK) : BEAT_LABEL_FALLBACK;
}

export default function ArticleHud({ sections }: ArticleHudProps) {
  const { progress, stage } = useSceneProgress();
  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const activeIndex = useScrollSpy(sectionIds);

  const total = sections.length;
  const activeTitle = sections[activeIndex]?.title ?? '';
  const beat = useMemo(() => beatLabelForStage(stage), [stage]);
  // Reuse the hero's bright-zone test so the chrome flips to a dark stroke when the
  // article's scene window scrubs through a bright beat (supernova flash / yellow
  // star) — identical [data-zone] swap as the hero, no new colour logic.
  const zone = brightZoneFor(stage) ? 'bright' : 'dark';
  const pct = Math.round(progress * 100);

  return (
    <aside
      className="article-hud"
      data-zone={zone}
      aria-label="Reading progress"
    >
      {/* PROGRESS RAIL — the hero nav-rail geometry, repurposed as a fill gauge. The
          --scene-progress custom property drives the fill height in article.css. */}
      <div
        className="article-hud-rail"
        aria-hidden="true"
        style={{ '--scene-progress': progress } as React.CSSProperties}
      >
        <span className="article-hud-rail-fill" />
      </div>

      {/* SECTION READOUT — `02 / 04` + the active section title, mono caps. The beat
          name (the celestial scene the backdrop is on) sits beneath as the quiet
          second line, so the chrome and the live scene agree on where you are. */}
      <div className="article-hud-readout">
        <span className="article-hud-index" aria-hidden="true">
          {total > 0 ? `${pad2(activeIndex + 1)} / ${pad2(total)}` : `${pct}%`}
        </span>
        {activeTitle && <span className="article-hud-section">{activeTitle}</span>}
        <span className="article-hud-beat" aria-hidden="true">
          {beat}
        </span>
      </div>
    </aside>
  );
}
