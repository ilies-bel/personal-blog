// The finale section — the quiet site index the cinematic resolves to, now a
// SECOND DECISION POINT with three concrete proof paths, a full directory nav,
// and a Replay control. Rendered INSIDE the finale beat (ManifestoOverlay mounts
// it when beat.layout === 'finale'). Appears/disappears on the exact same scroll
// frame as the finale copy via the `data-visible` gate on the outer wrapper.
//
// Visibility model: .bh-finale-section[data-visible] gates visibility +
// pointer-events for ALL child elements at once — proof paths, nav rows, and
// the replay button are all inert outside the finale band and fully interactive
// inside it. This mirrors the old per-element gate on .bh-finale-ledger but
// applies it to the whole section so new elements never need to re-implement it.
//
// Counts (projectCount, articleCount, specimenCount) come from SceneStateContext,
// populated by index.astro at build time from the data modules and the posts
// content collection. Zero hardcoded count literals appear anywhere in this file.
import { resolveHref } from '../lib/url';
import { useSceneState } from './SceneStateContext';

interface LedgerRow {
  label: string;
  note: string;
  href: string;
}

interface FinaleLedgerProps {
  /** The finale beat's visibility (ManifestoOverlay's band result). */
  visible: boolean;
}

export default function FinaleLedger({ visible }: FinaleLedgerProps) {
  const { base, finaleCounts } = useSceneState();
  const { projectCount, articleCount, specimenCount } = finaleCounts;

  // Directory rows — notes derived from counts, never hardcoded.
  const rows: readonly LedgerRow[] = [
    { label: 'PROJECTS',        note: `${projectCount} shipped`,     href: 'projects' },
    { label: 'GRAVEYARD',       note: `${specimenCount} dead, honest`, href: 'graveyard' },
    { label: 'WRITING',         note: `${articleCount} posts`,       href: 'writing' },
    { label: 'BEHIND THE BUILD', note: 'how this site is built',     href: 'behind-the-build' },
    { label: 'ABOUT',           note: 'who I am',                    href: 'about' },
    { label: 'GET IN TOUCH',    note: 'say hello',                   href: 'about#get-in-touch' },
  ];

  // Scroll to top and move focus to the first meaningful landmark — no reload.
  function handleReplay(): void {
    window.scrollTo({ top: 0, behavior: 'instant' });
    // Focus the visually-hidden h1 (always first in DOM, present before any JS).
    // preventScroll: the scrollTo above already handles position.
    const target = document.querySelector<HTMLElement>('h1.sr-only, .skip-experience');
    target?.focus({ preventScroll: true });
  }

  return (
    <div className="bh-finale-section" data-visible={visible}>
      {/* ── PROOF PATHS ──────────────────────────────────────────── */}
      {/* Three concrete evidence links — the second decision point. Each card
          exposes a kicker (category + derived count), a destination label, and a
          one-line evidence hook. The kickers carry the dynamic counts so judges
          can read Fleet / Investigation / Graveyard at a glance without opening
          the full directory. */}
      <div className="bh-finale-proof" aria-label="Proof paths">
        <a
          className="bh-finale-proof-card"
          href={resolveHref(base, 'projects')}
          tabIndex={visible ? 0 : -1}
          aria-hidden={!visible}
        >
          <span className="bh-finale-proof-kicker">
            Flagship · {projectCount} shipped
          </span>
          <span className="bh-finale-proof-label">Fleet</span>
          <span className="bh-finale-proof-hook">
            Parallel branch preview for parallel QA. Open-source and live.
          </span>
        </a>
        <a
          className="bh-finale-proof-card"
          href={resolveHref(base, 'posts/memory-leak-search-and-destroy')}
          tabIndex={visible ? 0 : -1}
          aria-hidden={!visible}
        >
          <span className="bh-finale-proof-kicker">Investigation</span>
          <span className="bh-finale-proof-label">Memory leak: search and destroy</span>
          <span className="bh-finale-proof-hook">
            Finding a 150 MB phantom. The full hunt, with evidence.
          </span>
        </a>
        <a
          className="bh-finale-proof-card"
          href={resolveHref(base, 'graveyard')}
          tabIndex={visible ? 0 : -1}
          aria-hidden={!visible}
        >
          <span className="bh-finale-proof-kicker">
            Graveyard · {specimenCount} specimens
          </span>
          <span className="bh-finale-proof-label">What didn't survive</span>
          <span className="bh-finale-proof-hook">
            What I abandoned, and what it taught me.
          </span>
        </a>
      </div>

      {/* ── FULL DIRECTORY NAV ───────────────────────────────────── */}
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
            className="bh-finale-ledger-row"
            href={resolveHref(base, row.href)}
            tabIndex={visible ? 0 : -1}
            aria-hidden={!visible}
          >
            <span className="bh-finale-ledger-label">{row.label}</span>
            <span className="bh-finale-ledger-note">{row.note}</span>
          </a>
        ))}
      </nav>

      {/* ── REPLAY ───────────────────────────────────────────────── */}
      {/* Restarts the lifecycle cleanly — scroll to top + focus reset, no reload.
          Placed after the nav so it sits at the very bottom of the section. */}
      <button
        type="button"
        className="bh-finale-replay"
        onClick={handleReplay}
        tabIndex={visible ? 0 : -1}
        aria-hidden={!visible}
        aria-label="Replay the stellar lifecycle from the beginning"
        data-replay
      >
        <span aria-hidden="true">↑</span>{' '}Replay
      </button>
    </div>
  );
}
