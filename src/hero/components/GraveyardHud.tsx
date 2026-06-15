// GraveyardHud — the graveyard-page cockpit, written in the hero's mono-gold HUD
// language. A SIBLING of ArticleHud (the article version), wired the same way:
// it is its own island, so it reads scroll from the same window seam
// `article:progress` that ArticleScene dispatches — the SAME engine driver, just a
// different chrome consumer. The page never has more than one of (ArticleHud,
// GraveyardHud) mounted, so the shared event channel can never collide.
//
// What the HUD reads like:
//   • a thin left PROGRESS RAIL that fills with page scroll (mirrors hud.css);
//   • a SPECIMEN READOUT — `SPECIMEN 02 / 02 · HEYDANIEL` — the active entry index
//     over total and the active entry's NAME in mono caps (no celestial-beat line —
//     the graveyard is not a navigator across beats, it is a logged ledger);
//   • a quiet `INTERRED` label so the readout reads as a specimen drawer, not a
//     reading gauge.
//
// CROSS-ROOT WIRING: same window-event seam as ArticleHud — ArticleScene throttles
// the event, this island listens once, the IntersectionObserver tracks which
// `.graveyard-entry` is in the upper third of the viewport (the "you are here"
// position) and updates the readout.
import { useEffect, useState } from 'react';
import { ARTICLE_PROGRESS_EVENT, type ArticleProgressDetail } from './ArticleScene';

interface GraveyardEntry {
  /** DOM id of the `.graveyard-entry` element (so the spy can observe it). */
  id: string;
  /** Mono-caps display name (e.g. `KEYWORDLENS`). */
  name: string;
}

interface GraveyardHudProps {
  /** The interred entries, in document order. The HUD shows `N / total · NAME`. */
  entries: readonly GraveyardEntry[];
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

export default function GraveyardHud({ entries }: GraveyardHudProps) {
  const [progress, setProgress] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  // Listen to ArticleScene's progress broadcasts. One window listener; the scene
  // throttles the event so this stays cheap.
  useEffect(() => {
    const onProgress = (e: Event): void => {
      const detail = (e as CustomEvent<ArticleProgressDetail>).detail;
      if (!detail) return;
      setProgress(detail.progress);
    };
    window.addEventListener(ARTICLE_PROGRESS_EVENT, onProgress as EventListener);
    return () => window.removeEventListener(ARTICLE_PROGRESS_EVENT, onProgress as EventListener);
  }, []);

  // Entry scroll-spy: observe the real entry elements (each `<article>` carries the
  // id the layout assigned, e.g. `keywordlens`). The active entry is the last one
  // whose top has passed the upper third of the viewport — same "you are here" feel
  // as the hero rail / ArticleHud.
  useEffect(() => {
    if (entries.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const nodes = entries
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      () => {
        setActiveIndex(activeIndexFromNodes(nodes));
      },
      { rootMargin: '-33% 0px -67% 0px', threshold: 0 },
    );
    nodes.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [entries]);

  const total = entries.length;
  const activeName = entries[activeIndex]?.name ?? '';
  const pct = Math.round(progress * 100);

  return (
    <aside
      className="article-hud graveyard-hud"
      aria-label="Graveyard ledger position"
    >
      {/* PROGRESS RAIL — reuses the article HUD geometry/tokens. The
          --article-progress custom property drives the fill height in article.css. */}
      <div
        className="article-hud-rail"
        aria-hidden="true"
        style={{ '--article-progress': progress } as React.CSSProperties}
      >
        <span className="article-hud-rail-fill" />
      </div>

      {/* SPECIMEN READOUT — `SPECIMEN 02 / 02` + the active entry name, mono caps.
          A quiet `INTERRED` label below so the readout reads as a drawer label, not
          a reading gauge. */}
      <div className="article-hud-readout">
        <span className="article-hud-index" aria-hidden="true">
          {total > 0 ? `SPECIMEN ${pad2(activeIndex + 1)} / ${pad2(total)}` : `${pct}%`}
        </span>
        {activeName && <span className="article-hud-section">{activeName}</span>}
        <span className="article-hud-beat" aria-hidden="true">
          INTERRED
        </span>
      </div>
    </aside>
  );
}

/** The active entry index = the last entry whose top has crossed the spy line
 *  (top third of the viewport). Pure read of live layout — no React state. */
function activeIndexFromNodes(nodes: readonly HTMLElement[]): number {
  const spyLine = window.innerHeight / 3;
  let index = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    if (nodes[i].getBoundingClientRect().top <= spyLine) index = i;
    else break;
  }
  return index;
}
