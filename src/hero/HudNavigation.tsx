import { useEffect, useState, type CSSProperties } from 'react';
import {
  HUD_NAV_ITEMS,
  MARKER_PLACEMENTS,
  settledIdForStage,
  type HudNavItem,
  type HudTargetId,
  type MarkerPlacement,
} from './sceneTable';
import { progressForLegacyStage } from './timeline';

// The HUD nav rows, on-screen markers, the settled-window gate and their shared
// types now live in sceneTable.ts (the pure data layer). They are re-exported
// here so the existing import paths ('../HudNavigation') resolve UNCHANGED. The
// duplicated literals + the byte-identical settled-window body that used to sit
// here are gone (the table is the single source).
export { HUD_NAV_ITEMS, MARKER_PLACEMENTS, settledIdForStage };
export type { HudNavItem, HudTargetId, MarkerPlacement };

export const HUD_NAV_BY_ID = HUD_NAV_ITEMS.reduce<Record<HudTargetId, HudNavItem>>((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {} as Record<HudTargetId, HudNavItem>);

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

interface HudNavigationProps {
  visible: boolean;
  /** prefers-reduced-motion: travel jumps instead of smooth-scrolling. */
  reduced: boolean;
  /** The target the current scroll position maps to (scroll-spy "you are here").
   *  Drives a quiet ambient marker so the rail reflects scroll position. */
  currentId: HudTargetId | null;
  base: string;
}

// Resolve a `public/` glyph asset against the deploy base (same base prop the
// links use), so the mask URL is correct whether base is `/` or `/personal-blog/`.
function resolveAsset(base: string, src: string): string {
  return `${base}/${src}`.replace(/\/+/g, '/');
}

/**
 * Travel to a lifecycle stage: map the stage to its scroll progress and scroll the
 * page there. Honours reduced-motion (jumps instead of smooth-scrolling). Used by
 * the HUD rail so clicking a glyph flies the visitor to that star rather than
 * navigating away to a page.
 */
function scrollToStage(stage: number, reduced: boolean): void {
  const progress = progressForLegacyStage(stage);
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  window.scrollTo({ top: progress * max, behavior: reduced ? 'auto' : 'smooth' });
}

// --- ASCII-compass data source --------------------------------------------
// The bottom-of-rail readout names whatever the visitor is currently POINTING
// at, in this priority order:
//   1. A rail button under hover / keyboard focus (`pointedId`, set by the row
//      handlers below).
//   2. An on-canvas StarMarker that has LOCKED — markers publish their lock on
//      window.__bhMarkerLock ({active,x,y,hexRadius,owner}); `owner` is a marker
//      placement id (e.g. 'nebula-02'), which we resolve to its scene/HUD id.
//   3. Idle fallback: the current scroll stage (`currentId`).
// Marker locks are polled on a light interval (the lock is a frame-cadence value
// that must NOT live in React state); we only setState when the resolved id
// actually changes, so the poll is cheap.

/** Shape of the global the StarMarkers publish when locked (mirrors StarMarker.tsx). */
interface MarkerLock {
  active: boolean;
  owner: string;
}
type MarkerLockWindow = Window & { __bhMarkerLock?: MarkerLock | null };

/** A locked marker publishes its PLACEMENT id (e.g. 'nebula-02', 'beginning').
 *  Resolve that to the HUD target id by looking the placement up in the marker
 *  table and reading its `state` (placement.state already equals the HudTargetId
 *  for every scene — the three nebula placements all carry state:'nebula'). */
function hudIdForMarkerOwner(owner: string): HudTargetId | null {
  const placement = MARKER_PLACEMENTS.find((m) => m.id === owner);
  return placement ? placement.state : null;
}

const MARKER_POLL_MS = 120;

export default function HudNavigation({
  visible,
  reduced,
  currentId,
  base,
}: HudNavigationProps) {
  // The rail item the pointer is hovering / the keyboard has focused. null when
  // nothing on the rail is pointed (then the marker lock or scroll stage wins).
  const [pointedId, setPointedId] = useState<HudTargetId | null>(null);
  // The HUD id of a currently-LOCKED on-canvas marker, polled from the global.
  const [markerId, setMarkerId] = useState<HudTargetId | null>(null);

  // Poll window.__bhMarkerLock on a light interval. The lock is written every rAF
  // by StarMarker (a frame-cadence value), so we sample it rather than subscribe;
  // only commit to state when the RESOLVED HUD id changes, keeping renders rare.
  useEffect(() => {
    const w = window as unknown as MarkerLockWindow;
    let lastId: HudTargetId | null = null;
    const id = window.setInterval(() => {
      const lock = w.__bhMarkerLock;
      const next = lock && lock.active ? hudIdForMarkerOwner(lock.owner) : null;
      if (next !== lastId) {
        lastId = next;
        setMarkerId(next);
      }
    }, MARKER_POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  // Resolve the POINTED target with the priority: rail hover/focus → locked
  // marker → scroll stage. Always resolves to something so the readout is never
  // blank (it falls back to "you are here").
  const compassId: HudTargetId | null = pointedId ?? markerId ?? currentId;
  const compassItem = compassId ? HUD_NAV_BY_ID[compassId] : null;
  // Whether the readout is naming a deliberately POINTED target (vs. the idle
  // scroll fallback) — drives a subtly brighter prompt glyph.
  const compassPointed = pointedId !== null || markerId !== null;

  return (
    <>
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
                {/* A HUD glyph TRAVELS to its lifecycle stage rather than navigating
                    away — clicking it smooth-scrolls the page to that star. So it is a
                    real <button>, not a link (keyboard-accessible, no page load). The
                    on-screen StarMarker still owns the page navigation via item.href. */}
                <button
                  type="button"
                  className="hud-nav-button"
                  data-motion={item.motion}
                  data-current={isCurrent}
                  aria-label={`Travel to ${item.label}`}
                  tabIndex={visible ? 0 : -1}
                  aria-current={isCurrent ? 'location' : undefined}
                  onClick={() => scrollToStage(item.stage, reduced)}
                  // Feed the ASCII compass: hovering or focusing a row points at it.
                  onMouseEnter={() => setPointedId(item.id)}
                  onMouseLeave={() => setPointedId((prev) => (prev === item.id ? null : prev))}
                  onFocus={() => setPointedId(item.id)}
                  onBlur={() => setPointedId((prev) => (prev === item.id ? null : prev))}
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
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      </div>

      {/* ASCII compass readout, anchored below the rail. Names whatever is being
          POINTED at (a hovered/focused rail glyph, a locked on-canvas marker) and
          falls back to the current scroll stage when nothing is pointed. Drawn in
          the rail's +/tick ASCII language with literal chars; aria-hidden because
          the rail buttons already announce their own labels (the old mobile readout
          had the same rationale — this replaces it, now visible on desktop too).
          The compass markup is rendered even when no scene resolves so its frame
          never pops in/out.

          IMPORTANT: rendered as a SIBLING of .hud-system, not a child. .hud-system
          carries a transform (translate(...,-50%) for vertical centring), and a CSS
          transform on an ancestor makes position:fixed resolve against that ancestor
          instead of the viewport — which trapped the compass mid-rail. As a sibling
          its position:fixed bottom-centre resolves against the viewport correctly. */}
      {compassItem && (
        <div className="hud-compass" data-visible={visible} data-pointed={compassPointed} aria-hidden="true">
          <pre className="hud-compass-rose">{'     +\n  ───┼───\n     |'}</pre>
          <p className="hud-compass-read">
            <span className="hud-compass-prompt">{compassPointed ? '[·]' : ' › '}</span>
            <span className="hud-compass-label">{compassItem.label}</span>
          </p>
          <p className="hud-compass-dest">
            <span className="hud-compass-arrow">→</span>
            <span>{compassItem.destination}</span>
          </p>
        </div>
      )}
    </>
  );
}
