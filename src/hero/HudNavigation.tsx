import type { CSSProperties } from 'react';

export type HudTargetId = 'beginning' | 'nebula' | 'yellow' | 'red' | 'end';

export interface HudNavItem {
  id: HudTargetId;
  /** Public path to the row's mask glyph SVG (painted with the link's currentColor). */
  glyphSrc: string;
  motion: 'pulse' | 'breathe' | 'drift' | 'flicker' | 'still';
  label: string;
  destination: string;
  stage: number;
  href: string;
}

export const HUD_NAV_ITEMS: readonly HudNavItem[] = [
  {
    id: 'beginning',
    glyphSrc: 'glyphs/glyph-dot.svg',
    motion: 'still',
    label: 'THE BEGINNING',
    destination: 'About',
    stage: 4.7,
    href: 'about',
  },
  {
    id: 'nebula',
    glyphSrc: 'glyphs/glyph-nebula.svg',
    motion: 'breathe',
    label: 'NEBULA',
    destination: 'Writing',
    stage: 3.5,
    href: 'writing',
  },
  {
    id: 'yellow',
    glyphSrc: 'glyphs/glyph-yellow-star.svg',
    motion: 'flicker',
    label: 'YELLOW STAR',
    destination: 'Projects',
    stage: 2.9,
    href: 'projects',
  },
  {
    id: 'red',
    glyphSrc: 'glyphs/glyph-red-giant.svg',
    motion: 'drift',
    label: 'GRAVEYARD',
    destination: 'Graveyard',
    stage: 2.05,
    href: 'graveyard',
  },
  {
    id: 'end',
    glyphSrc: 'glyphs/glyph-black-hole.svg',
    motion: 'pulse',
    label: 'BLACK HOLE',
    destination: 'Inspiration',
    stage: 0,
    href: 'posts/thanks-for-scrolling-to-the-bottom',
  },
];

export const HUD_NAV_BY_ID = HUD_NAV_ITEMS.reduce<Record<HudTargetId, HudNavItem>>((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {} as Record<HudTargetId, HudNavItem>);

// --------------------------------------------------------------------------
// On-screen star markers (the HUD "target locks" rendered over the live scene).
//
// Each entry is ONE marker. A state can own SEVERAL markers (the nebula owns
// three placeholder "recent article" markers; everything else owns one). All
// markers for a state are mounted at once and each gates its own visibility on
// that state being the settled lifecycle state on screen (see StarMarker).
//
// POSITIONING — two modes:
//   • Fixed screen spot (default): `vx`/`vy` are viewport fractions (0..1) of
//     innerWidth/innerHeight. At tick time the marker sits at
//     `x = vx*innerWidth, y = vy*innerHeight`, i.e. a fixed spot on the viewport
//     while its state is on screen. Approximated from the live cloud/star at a
//     typical desktop viewport — TUNE these freely; they are meant to be nudged.
//   • Projection-anchored (`anchored: true`): the marker ignores vx/vy and rides
//     the scene's projected star origin (MarkerFrame x/y). Used ONLY for the pale
//     blue dot so the hexagon stays centred on the speck wherever it projects.
//
// Each marker is a real <a href>, so title/subtitle/href below drive its card and
// navigation. No em dashes in any copy here (plain text only).
export interface MarkerPlacement {
  /** Stable per-marker id (also the lock-ownership token — must be unique). */
  id: string;
  /** Which settled lifecycle state shows this marker. */
  state: HudTargetId;
  /** Viewport-fraction X (0..1 of innerWidth). Ignored when `anchored`. */
  vx: number;
  /** Viewport-fraction Y (0..1 of innerHeight). Ignored when `anchored`. */
  vy: number;
  /** Ride the projected star origin instead of vx/vy (pale blue dot only). */
  anchored?: boolean;
  /** Path appended to BASE_URL for the link + card navigation. */
  href: string;
  /** Card title line (already in the casing it should render). */
  title: string;
  /** Card subtitle line. */
  subtitle: string;
}

export const MARKER_PLACEMENTS: readonly MarkerPlacement[] = [
  // BEGINNING / pale blue dot — ONE marker, projection-anchored so it stays
  // centred on the speck wherever the scene projects it (the createScene
  // dot-centred offset feeds this).
  {
    id: 'beginning',
    state: 'beginning',
    vx: 0.5,
    vy: 0.5,
    anchored: true,
    href: 'about',
    title: 'ABOUT',
    subtitle: 'Who I am',
  },

  // NEBULA / writing — THREE placeholder markers (one per recent article), all
  // linking to /writing for now. Pulled OUT of the dense gas into the sparse / near-
  // empty regions so each hexagon reads against dark background instead of a bright
  // clump: (a) top-right OUTSIDE the cloud, (b) mid-left thin edge, (c) bottom-centre
  // sparse edge. Approximate the user's red boxes — meant to be nudged.
  {
    id: 'nebula-01',
    state: 'nebula',
    vx: 0.82,
    vy: 0.22,
    href: 'writing',
    title: 'WRITING / 01',
    subtitle: 'Notes & essays',
  },
  {
    id: 'nebula-02',
    state: 'nebula',
    vx: 0.19,
    vy: 0.4,
    href: 'writing',
    title: 'WRITING / 02',
    subtitle: 'Notes & essays',
  },
  {
    id: 'nebula-03',
    state: 'nebula',
    vx: 0.58,
    vy: 0.8,
    href: 'writing',
    title: 'WRITING / 03',
    subtitle: 'Notes & essays',
  },

  // YELLOW STAR / projects — ONE marker, moved to the UPPER-LEFT quadrant of the
  // photosphere.
  {
    id: 'yellow',
    state: 'yellow',
    vx: 0.4,
    vy: 0.38,
    href: 'projects',
    title: 'PROJECTS',
    subtitle: 'Things I build',
  },

  // RED GIANT / graveyard — ONE marker, fixed spot over the red limb.
  {
    id: 'red',
    state: 'red',
    vx: 0.5,
    vy: 0.46,
    href: 'graveyard',
    title: 'GRAVEYARD',
    subtitle: 'Things I abandoned',
  },

  // END / black hole — ONE marker, fixed spot near the hero centre.
  {
    id: 'end',
    state: 'end',
    vx: 0.5,
    vy: 0.5,
    href: 'posts/thanks-for-scrolling-to-the-bottom',
    title: 'INSPIRATION',
    subtitle: 'Why this site exists',
  },
];

// Items in ascending `stage` order — the source list happens to already be sorted,
// but the scroll-spy mapping below depends on it, so make that contract explicit
// rather than relying on authoring order.
const HUD_NAV_BY_STAGE: readonly HudNavItem[] = [...HUD_NAV_ITEMS].sort((a, b) => a.stage - b.stage);

/**
 * Scroll-spy: map a lifecycle stage (0..5, the same transition-space `getStage`
 * produces) to the HUD target the visitor is currently "on" — the last stage
 * they have scrolled past. Returns the first item while still above it, so the
 * top of the rail (BLACK HOLE / stage 0) lights up at the very top of the page.
 */
export function hudIdForStage(stage: number): HudTargetId {
  let current = HUD_NAV_BY_STAGE[0];
  for (const item of HUD_NAV_BY_STAGE) {
    if (stage >= item.stage) current = item;
    else break;
  }
  return current.id;
}

// IDLE-hold-only stage thresholds. A marker appears ONLY while the lifecycle is
// holding still on its recognisable beat, NOT during the transitions in or out of
// that hold. Returns the held state's id for `stage`, or null if mid-transition.
// MUST stay byte-identical to the settled gate in createScene.ts (onMarkerFrame) —
// both gate marker visibility on the same stage ranges:
//   dot     4.50 - 4.72  (the dot hold, before it blooms)
//   nebula  3.38 - 3.50  (the grown cloud sitting still, before collapse)
//   yellow  2.84 - 2.92  (the flat yellow-star contemplation hold)
//   red     2.00 - 2.12  (the flat red-giant hold)
//   black   0.00 - 0.12  (the settled black hole at the bottom of the arc)
export function settledIdForStage(stage: number): HudTargetId | null {
  if (stage >= 4.50 && stage <= 4.72) return 'beginning';
  if (stage >= 3.38 && stage <= 3.50) return 'nebula';
  if (stage >= 2.84 && stage <= 2.92) return 'yellow';
  if (stage >= 2.00 && stage <= 2.12) return 'red';
  if (stage >= 0.00 && stage <= 0.12) return 'end';
  return null;
}

interface HudNavigationProps {
  visible: boolean;
  /** The target the current scroll position maps to (scroll-spy "you are here").
   *  Drives a quiet ambient marker so the rail reflects scroll position. */
  currentId: HudTargetId | null;
  base: string;
}

function resolveHref(base: string, href: string): string {
  return `${base}/${href}`.replace(/\/+/g, '/');
}

// Resolve a `public/` glyph asset against the deploy base (same base prop the
// links use), so the mask URL is correct whether base is `/` or `/personal-blog/`.
function resolveAsset(base: string, src: string): string {
  return `${base}/${src}`.replace(/\/+/g, '/');
}

export default function HudNavigation({
  visible,
  currentId,
  base,
}: HudNavigationProps) {
  // The mobile readout names the stage the scroll position is currently on.
  const readoutItem = currentId ? HUD_NAV_BY_ID[currentId] : null;

  return (
    <div className="hud-system" data-visible={visible}>
      <nav
        className="hud-nav"
        aria-label="Explore portfolio stages"
        aria-hidden={!visible}
      >
        <ol className="hud-nav-list">
          {HUD_NAV_ITEMS.map((item) => {
            const isCurrent = currentId === item.id;

            return (
              <li className="hud-nav-row" key={item.id}>
                <a
                  className="hud-nav-button"
                  href={resolveHref(base, item.href)}
                  data-motion={item.motion}
                  data-current={isCurrent}
                  aria-label={`${item.label}. ${item.destination}.`}
                  tabIndex={visible ? 0 : -1}
                  aria-current={isCurrent ? 'location' : undefined}
                >
                  <span
                    className="hud-nav-glyph"
                    aria-hidden="true"
                    style={{ '--glyph-mask': `url(${resolveAsset(base, item.glyphSrc)})` } as CSSProperties}
                  />
                  <span className="hud-nav-copy">
                    <span className="hud-nav-title">{item.label}</span>
                    <span className="hud-nav-destination">{item.destination}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* aria-hidden by design: this readout only re-states the label +
          destination of the currently-focused/active nav button, which the
          screen reader already announces from the button's own aria-label.
          Exposing it too would double-announce the same stage, so it stays
          visual-only (a glanceable readout for the compact mobile layout). */}
      {readoutItem && (
        <p className="hud-nav-mobile-readout" aria-hidden="true">
          <span>{readoutItem.label}</span>
          <span>{readoutItem.destination}</span>
        </p>
      )}
    </div>
  );
}
