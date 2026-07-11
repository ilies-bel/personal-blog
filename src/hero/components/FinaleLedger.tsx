// The finale ledger — the quiet site index the cinematic resolves to. Rendered
// INSIDE the finale beat (ManifestoOverlay mounts it when beat.layout ===
// 'finale'), so it appears/disappears on the exact same scroll frame as the
// finale copy, in BOTH visibility regimes:
//   • live hero: the beat's authored band [inStart, outEnd] (a hard cut);
//   • reduced motion: the beat's gapless still-poster band (inStart → the next
//     beat's inStart). The still version parks the page bottom on the dot
//     poster, which sits inside that band — so the ledger is present on the
//     settled finale frame, and hidden whenever another beat's band is active.
//
// P7 makes it a real DECISION SURFACE, not just an index: every primary
// destination with a truthful derived note (shipped/dead/article counts), a
// direct GET IN TOUCH row to the dedicated /contact route, and a REPLAY
// control that runs the lifecycle again (scroll back to the top — smooth on
// the full-motion hero, an instant jump under reduced motion).
//
// The parent .bh-overlay is pointer-events:none and drives opacity; visibility
// + pointer-events are gated HERE via data-visible so the links are real,
// clickable, Tab-reachable navigation while the finale band is active and
// completely inert (no stray focus stops, no invisible hover targets) outside
// it. Hrefs resolve through the same base-path seam the star markers use
// (resolveHref + SceneStateContext's base) — never a hardcoded site prefix.
import { resolveHref } from '../lib/url';
import { graveyardNote, projectsNote, writingNote } from '../../lib/contentFormat';
import { getMotion } from '../../lib/motion';
import { useSceneState } from './SceneStateContext';

/** Collection-derived counts for the ledger notes. Computed server-side by
 *  getCounts() (src/lib/contentStats.ts) in index.astro and serialized down
 *  through the island props (BlackHole → HeroIsland → ManifestoOverlay → here),
 *  so the numbers can never drift from the actual /projects, /graveyard and
 *  /writing content — the old hand-synced literals ('2 shipped', '2 dead,
 *  both honest') are gone. */
export interface LedgerCounts {
  shipped: number;
  dead: number;
  /** Published articles (drafts + the site-meta Inspiration essay excluded —
   *  the same filter /writing's Articles shelf applies). */
  posts: number;
}

interface LedgerRow {
  /** Mono-caps row label — the destination's name (uppercased by CSS-free
   *  authoring, matching the marker eyebrows). */
  label: string;
  /** Small lowercase elaboration, in the whispers' voice. Hidden on the
   *  compact (narrow-viewport) two-column layout. */
  note: string;
  /** Path appended to BASE_URL — same shape as MarkerPlacement.href. */
  href: string;
}

const buildRows = (counts: LedgerCounts): readonly LedgerRow[] => [
  { label: 'PROJECTS', note: projectsNote(counts.shipped), href: 'projects' },
  { label: 'GRAVEYARD', note: graveyardNote(counts.dead), href: 'graveyard' },
  { label: 'WRITING', note: writingNote(counts.posts), href: 'writing' },
  { label: 'BEHIND THE BUILD', note: 'how this site is built', href: 'behind-the-build' },
  { label: 'ABOUT', note: 'who I am', href: 'about' },
  { label: 'GET IN TOUCH', note: 'open channel', href: 'contact' },
];

/** REPLAY — run the lifecycle again. A <button> (not an <a href="#top">): it
 *  performs an action on THIS page, and a button never triggers the SPA
 *  router / adds a history entry the way a fragment link can. Smooth scroll on
 *  the full-motion hero; under the RESOLVED reduced-motion preference (manual
 *  override ?? OS — the sitewide motion module) it is an instant jump, exactly
 *  like every other motion surface on the site. */
const replay = (): void => {
  window.scrollTo({ top: 0, behavior: getMotion() === 'reduced' ? 'auto' : 'smooth' });
};

interface FinaleLedgerProps {
  /** The finale beat's own visibility (ManifestoOverlay's band result) — drives
   *  the visibility/pointer-events gate so ledger and copy flip together. */
  visible: boolean;
  counts: LedgerCounts;
}

export default function FinaleLedger({ visible, counts }: FinaleLedgerProps) {
  const { base } = useSceneState();
  const rows = buildRows(counts);
  return (
    <nav className="bh-finale-ledger" aria-label="Site index" data-visible={visible}>
      {/* The console skin's header strip (hero.css shows it only on the powered
          directory-screen layout; the floating centre column hides it). */}
      <span className="bh-finale-ledger-head" aria-hidden="true">
        DIRECTORY
      </span>
      {rows.map((row) => (
        <a
          key={row.href}
          className="bh-finale-ledger-row"
          href={resolveHref(base, row.href)}
          // Belt-and-braces with the visibility gate: while the finale band is
          // inactive the row must also be un-Tab-able in the STATIC HTML (the
          // beat above carries aria-hidden, and a focusable element inside an
          // aria-hidden ancestor is an a11y defect until CSS loads).
          tabIndex={visible ? undefined : -1}
        >
          <span className="bh-finale-ledger-label">{row.label}</span>
          <span className="bh-finale-ledger-note">{row.note}</span>
        </a>
      ))}
      {/* The one non-navigation row: same visual grammar, same visibility/tab
          gating as the links above. */}
      <button
        type="button"
        className="bh-finale-ledger-row bh-finale-ledger-replay"
        onClick={replay}
        tabIndex={visible ? undefined : -1}
      >
        <span className="bh-finale-ledger-label">REPLAY</span>
        <span className="bh-finale-ledger-note">run the lifecycle again</span>
      </button>
    </nav>
  );
}
