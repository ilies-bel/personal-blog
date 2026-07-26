// The finale section — the quiet site index the cinematic resolves to.
// Rendered INSIDE the finale beat (ManifestoOverlay mounts it when
// beat.layout === 'finale'), so it appears/disappears on the exact same scroll
// frame as the finale copy, in BOTH visibility regimes:
//   • live hero: the beat's authored band [inStart, outEnd] (a hard cut);
//   • reduced motion: the beat's gapless still-poster band (inStart → the next
//     beat's inStart). The still version parks the page bottom on the dot
//     poster, which sits inside that band — so the section is present on the
//     settled finale frame, and hidden whenever another beat's band is active.
//
// The center column shows ONLY the punchline headline + whisper (composed in
// ManifestoOverlay with the pale-blue-dot). Below the punchline the directory
// nav lists every primary destination. On desktop cockpit (body.hud-active)
// the nav moves to the right-panel MFD; on compact/no-hud it stays in the
// center column.
//
// Visibility model: .bh-finale-section[data-visible] gates visibility +
// pointer-events for ALL child elements at once. Hrefs resolve through the
// same base-path seam the star markers use (resolveHref + SceneStateContext's
// base) — never a hardcoded site prefix.
import { resolveHref } from '../lib/url';
import { graveyardNote, projectsNote, writingNote } from '../../lib/contentFormat';
import { getMotion } from '../../lib/motion';
import { useSceneState } from './SceneStateContext';

/** Collection-derived counts for the ledger notes. Computed server-side by
 *  getCounts() (src/lib/contentStats.ts) in index.astro and serialized down
 *  through the island props (BlackHole → HeroIsland → ManifestoOverlay → here),
 *  so the numbers can never drift from the actual /projects, /graveyard and
 *  /writing content. */
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
  /** When true the row receives a primary accent treatment — used for GET IN
   *  TOUCH so the contact call-to-action stands out from the directory list. */
  cta?: boolean;
}

const buildRows = (counts: LedgerCounts): readonly LedgerRow[] => [
  { label: 'PROJECTS', note: projectsNote(counts.shipped), href: 'projects' },
  { label: 'GRAVEYARD', note: graveyardNote(counts.dead), href: 'graveyard' },
  { label: 'WRITING', note: writingNote(counts.posts), href: 'writing' },
  { label: 'BEHIND THE BUILD', note: 'how this site is built', href: 'behind-the-build' },
  { label: 'ABOUT', note: 'who I am', href: 'about' },
  { label: 'GET IN TOUCH', note: 'open channel', href: 'contact', cta: true },
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
    <div className="bh-finale-section" data-visible={visible}>
      {/* ── FULL DIRECTORY NAV ───────────────────────────────────────── */}
      {/* The console skin's header strip — only shown on the powered directory-
          screen layout (body.hud-active on desktop); the floating column hides it
          via .bh-finale-ledger-head { display: none }. */}
      <nav className="bh-finale-ledger" aria-label="Site index">
        <span className="bh-finale-ledger-head" aria-hidden="true">
          DIRECTORY
        </span>
        {rows.map((row) => (
          <a
            key={row.href}
            className={
              row.cta
                ? 'bh-finale-ledger-row bh-finale-ledger-row--cta'
                : 'bh-finale-ledger-row'
            }
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
      </nav>

      {/* ── REPLAY ───────────────────────────────────────────────────── */}
      {/* Standalone control below the directory — not a nav row so it reads as
          a page-level action, not a destination. */}
      <button
        type="button"
        className="bh-finale-replay"
        onClick={replay}
        tabIndex={visible ? undefined : -1}
      >
        ↑ REPLAY
      </button>
    </div>
  );
}
