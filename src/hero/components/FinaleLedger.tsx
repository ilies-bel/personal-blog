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
// The parent .bh-overlay is pointer-events:none and drives opacity; visibility
// + pointer-events are gated HERE via data-visible so the links are real,
// clickable, Tab-reachable navigation while the finale band is active and
// completely inert (no stray focus stops, no invisible hover targets) outside
// it. Hrefs resolve through the same base-path seam the star markers use
// (resolveHref + SceneStateContext's base) — never a hardcoded site prefix.
import { resolveHref } from '../lib/url';
import { useSceneState } from './SceneStateContext';

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

// Counts are REAL: projects.astro ships two entries (fleet, mars); the
// graveyard ledger holds two specimens (KeywordLens, HeyDaniel). If either
// page gains an entry, update the note here.
const ROWS: readonly LedgerRow[] = [
  { label: 'PROJECTS', note: '2 shipped', href: 'projects' },
  { label: 'GRAVEYARD', note: '2 dead, both honest', href: 'graveyard' },
  { label: 'WRITING', note: 'notes & essays', href: 'writing' },
  { label: 'BEHIND THE BUILD', note: 'how this site is built', href: 'behind-the-build' },
  { label: 'ABOUT', note: 'who I am', href: 'about' },
  { label: 'GET IN TOUCH', note: 'say hello', href: 'about#get-in-touch' },
];

interface FinaleLedgerProps {
  /** The finale beat's own visibility (ManifestoOverlay's band result) — drives
   *  the visibility/pointer-events gate so ledger and copy flip together. */
  visible: boolean;
}

export default function FinaleLedger({ visible }: FinaleLedgerProps) {
  const { base } = useSceneState();
  return (
    <nav className="bh-finale-ledger" aria-label="Site index" data-visible={visible}>
      {ROWS.map((row) => (
        <a key={row.href} className="bh-finale-ledger-row" href={resolveHref(base, row.href)}>
          <span className="bh-finale-ledger-label">{row.label}</span>
          <span className="bh-finale-ledger-note">{row.note}</span>
        </a>
      ))}
    </nav>
  );
}
