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
// context), so it reads scroll from the window `article:progress` event ArticleScene
// dispatches — the same window-event seam the hero uses between its own pieces — and
// its section list from an IntersectionObserver over the article's <h2>s. No props
// threaded across roots.
import { useEffect, useMemo, useState } from 'react';
import { HUD_NAV_BY_ID } from '../HudNavigation';
import { settledIdForStage, type HudTargetId } from '../sceneTable';
import { brightZoneFor } from '../timeline';
import { ARTICLE_PROGRESS_EVENT, type ArticleProgressDetail } from './ArticleScene';

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

const pad2 = (n: number): string => String(n).padStart(2, '0');

export default function ArticleHud({ sections }: ArticleHudProps) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);
  // Index of the section currently in view (scroll-spy via IntersectionObserver).
  const [activeIndex, setActiveIndex] = useState(0);

  // Listen to the scene's scroll broadcasts (cross-root). One window listener; the
  // scene throttles the event, so this stays cheap.
  useEffect(() => {
    const onProgress = (e: Event): void => {
      const detail = (e as CustomEvent<ArticleProgressDetail>).detail;
      if (!detail) return;
      setProgress(detail.progress);
      setStage(detail.stage);
    };
    window.addEventListener(ARTICLE_PROGRESS_EVENT, onProgress as EventListener);
    return () => window.removeEventListener(ARTICLE_PROGRESS_EVENT, onProgress as EventListener);
  }, []);

  // Section scroll-spy: observe the real heading elements the layout marked with the
  // section ids. The active section is the last heading whose top has passed the
  // upper third of the viewport — the same "you are here" feel as the hero rail.
  useEffect(() => {
    if (sections.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const headings = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      () => {
        // Recompute the active section from the FULL heading set on every callback
        // (rather than trusting the single entry that fired), so fast scrolls that
        // skip several headings still land on the right one.
        setActiveIndex(activeIndexFromHeadings(headings));
      },
      // Spy line at the top third: a heading "becomes active" as it rises into the
      // top of the reading zone, matching where the eye is on a tall column.
      { rootMargin: '-33% 0px -67% 0px', threshold: 0 },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [sections]);

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
          --article-progress custom property drives the fill height in article.css. */}
      <div
        className="article-hud-rail"
        aria-hidden="true"
        style={{ '--article-progress': progress } as React.CSSProperties}
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

/** The active section index = the last heading whose top has crossed the spy line
 *  (top third of the viewport). Pure read of live layout — no React state. */
function activeIndexFromHeadings(headings: readonly HTMLElement[]): number {
  const spyLine = window.innerHeight / 3;
  let index = 0;
  for (let i = 0; i < headings.length; i += 1) {
    if (headings[i].getBoundingClientRect().top <= spyLine) index = i;
    else break;
  }
  return index;
}
