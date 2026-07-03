// GraveyardHud — the graveyard-page cockpit, written in the hero's mono-gold HUD
// language. A SIBLING of ArticleHud (the article version), wired the same way:
// it is its own island, so it reads scroll from the same window seam
// `scene:progress` that ArticleScene dispatches — the SAME engine driver, just a
// different chrome consumer. The page never has more than one of (ArticleHud,
// GraveyardHud) mounted, so the shared event channel can never collide.
//
// What the HUD reads like:
//   • a thin left PROGRESS RAIL that fills with page scroll (mirrors hud.css);
//   • a SPECIMEN READOUT — `SPECIMEN 02 / 02 · HEYDANIEL · INTERRED 2024` — the
//     active entry index over total, the active entry's NAME in mono caps, and the
//     real interment year from the specimen record. Each readout is a JUMP-LINK to
//     its entry, so the rail navigates the ledger rather than just narrating it.
//
// HERO-PARITY: like ArticleHud, this reads the live getStage `stage` off the same
// event and flips the readout's [data-zone] to a dark stroke over bright lifecycle
// beats — so the cockpit COOLS toward the black hole as you descend the list, the
// same instrument behaviour as the hero. No graveyard-private colour logic.
//
// CROSS-ROOT WIRING: the scroll listener + scroll-spy live in the shared
// useSceneProgress hook (ArticleHud uses the same), so the two HUDs can't drift.
import { useMemo } from 'react';
import { brightZoneFor } from '../timeline';
import { pad2, useScrollSpy, useSceneProgress } from './useSceneProgress';

interface GraveyardEntry {
  /** DOM id of the `.graveyard-entry` element (so the spy can observe + link it). */
  id: string;
  /** Mono-caps display name (e.g. `KEYWORDLENS`). */
  name: string;
  /** Year the project was interred (e.g. `2024`) — shown as `INTERRED 2024`. */
  interred: string;
}

interface GraveyardHudProps {
  /** The interred entries, in document order. The HUD shows `N / total · NAME`. */
  entries: readonly GraveyardEntry[];
}

export default function GraveyardHud({ entries }: GraveyardHudProps) {
  const { progress, stage } = useSceneProgress();
  const targetIds = useMemo(() => entries.map((e) => e.id), [entries]);
  const activeIndex = useScrollSpy(targetIds);

  const total = entries.length;
  const active = entries[activeIndex];
  const pct = Math.round(progress * 100);
  // The readout narrates the LEDGER, not the page header — at the top of the page
  // its fixed-left column sits straight on the intro dek (the graveyard's content
  // starts at the left gutter, unlike the centered article column). Keep it dark
  // until the visitor has actually descended toward the first specimen.
  const engaged = progress > 0.08;
  // Reuse the hero's bright-zone test so the readout flips to a dark stroke when the
  // descent scrubs through a bright beat (supernova flash / yellow star) — identical
  // [data-zone] swap as the hero and ArticleHud, no new colour logic.
  const zone = brightZoneFor(stage) ? 'bright' : 'dark';

  return (
    <aside
      className="article-hud graveyard-hud"
      data-zone={zone}
      data-engaged={engaged ? 'true' : 'false'}
      aria-label="Graveyard ledger position"
    >
      {/* PROGRESS RAIL — reuses the article HUD geometry/tokens. The
          --scene-progress custom property drives the fill height in article.css. */}
      <div
        className="article-hud-rail"
        aria-hidden="true"
        style={{ '--scene-progress': progress } as React.CSSProperties}
      >
        <span className="article-hud-rail-fill" />
      </div>

      {/* SPECIMEN READOUT — `SPECIMEN 02 / 02` + the active entry name + the real
          interment year, mono caps. The whole readout is a jump-link to the active
          entry, so the rail navigates the ledger (pointer-events re-enabled on the
          link itself; the surrounding chrome stays transparent). */}
      <a
        className="article-hud-readout graveyard-hud-readout"
        href={active ? `#${active.id}` : undefined}
        aria-label={active ? `Jump to specimen ${activeIndex + 1}: ${active.name}` : undefined}
      >
        <span className="article-hud-index" aria-hidden="true">
          {total > 0 ? `SPECIMEN ${pad2(activeIndex + 1)} / ${pad2(total)}` : `${pct}%`}
        </span>
        {active?.name && (
          <span className="article-hud-section" data-decode>
            {active.name}
          </span>
        )}
        <span className="article-hud-beat" aria-hidden="true">
          {active?.interred ? `INTERRED ${active.interred}` : 'INTERRED'}
        </span>
      </a>
    </aside>
  );
}
