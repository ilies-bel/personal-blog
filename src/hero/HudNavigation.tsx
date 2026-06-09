import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  HUD_NAV_ITEMS,
  MARKER_PLACEMENTS,
  settledIdForStage,
  type HudNavItem,
  type HudTargetId,
  type MarkerPlacement,
} from './sceneTable';
import type { MarkerFrame } from './scene/types';
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
  /** The scene's per-frame marker frame (stage/visible + projected x/y for the
   *  anchored marker), owned by HeroIsland. The compass reads it to find the
   *  on-screen marker nearest the cursor and aim its needle at it. */
  markerFrameRef: React.RefObject<MarkerFrame | null>;
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

// --- Aiming-compass data source --------------------------------------------
// The bottom-centre readout is "a compass embarked in the cursor". Two glyphs:
//   • ▲  — the CURSOR. The FIXED anchor at the gauge's centre. It never moves.
//   • ┼  — the nearest on-screen MARKER (the destination). It is TRANSLATED to a
//     polar position AROUND the ▲ along the BEARING from the live cursor to the
//     marker, so the line ▲→┼ shows the direction the user must move the cursor
//     to reach the marker. NO rotation — both glyphs stay upright; direction is
//     conveyed purely by where the ┼ sits relative to the ▲.
//   • The OFFSET DISTANCE scales with PROXIMITY: the ┼ sits FAR from the ▲ when
//     the cursor is far from the marker and CONVERGES toward the ▲ (offset → 0)
//     as the cursor nears it. Clamped to a sensible min/max pixel offset.
// Priority for the NAME:
//   1. A rail button under hover / keyboard focus (`pointedId`) — a deliberate
//      pointing gesture overrides naming (the ┼ still tracks the nearest marker).
//   2. The on-screen marker nearest the cursor (the dominant behaviour). Each
//      marker carries its own copy (title/subtitle), more specific than the
//      scene HUD label — used so the nebula's three markers stay distinct.
//   3. Idle fallback: no interactive markers AND no rail hover -> NO SIGNAL.
// The ┼ offset + the nearest target are recomputed every rAF off the cursor and
// the scene's marker frame (a frame-cadence value that must NOT live in React
// state); the ┼ DOM transform is mutated directly each frame, and React state
// flips ONLY when the named target / idle flag changes — exactly the cheap
// pattern StarMarker uses (lastVisible/lastLocked).

/** The compass copy: either a specific on-screen marker (use its own title /
 *  subtitle) or a rail-hovered HUD scene (use its label / destination). */
interface CompassCopy {
  /** Top line — the target name. */
  label: string;
  /** Bottom line — the destination. */
  dest: string;
}

/** A marker placement carries its own card copy; prefer it for the compass so
 *  the nebula's three writing markers read distinctly. */
function copyForMarker(placement: MarkerPlacement): CompassCopy {
  return { label: placement.title, dest: placement.subtitle };
}

/** A rail-hovered scene names by its HUD row (label + destination). */
function copyForHudId(id: HudTargetId): CompassCopy {
  const item = HUD_NAV_BY_ID[id];
  return { label: item.label, dest: item.destination };
}

/** The current aiming result, committed to React state only when it changes.
 *  `markerId` is the nearest placement id (null when no markers are in range),
 *  driving the named copy; `idle` is true when there is nothing to aim at and
 *  no rail hover, swapping the readout to the NO SIGNAL placeholder. */
interface AimState {
  markerId: string | null;
  idle: boolean;
}

// The ┼ waypoint's polar offset around the ▲ (in CSS px). The bearing is the
// raw screen-space angle from the cursor to the marker (atan2(dy, dx), with dy
// measured screen-DOWN), so cos/sin map straight back to screen translate units:
// a marker to the RIGHT of the cursor → +X offset, ABOVE → −Y offset. The radius
// scales with the cursor→marker distance and is clamped so the ┼ never overlaps
// the ▲ (MIN) nor leaves the gauge box (MAX): r = clamp(MIN, dist*SCALE, MAX).
// SCALE is tuned so the radius spans MIN→MAX across roughly a viewport-half of
// cursor distance; it SHRINKS toward MIN as the cursor closes on the marker
// (proximity convergence).
const WAYPOINT_MIN_OFFSET = 3; // px — closest the ┼ gets to the ▲ (essentially on it)
const WAYPOINT_MAX_OFFSET = 16; // px — farthest the ┼ rides out from the ▲
const WAYPOINT_OFFSET_SCALE = 0.04; // px of offset per px of cursor→marker distance

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

// --- Target-lock signal (the same global the cursor reads) ------------------
// When the cursor enters a marker's hexagon (or the link is keyboard-focused),
// StarMarker LOCKS and publishes the lock to a sitewide global every frame. That
// IIFE/cursor handshake can't import React, so the shape is a mirror of the one
// StarMarker owns — same contract, just re-declared here so the compass can read
// `active` each rAF and light its readout gold when locked in. `active:false`
// (or null) means nothing is locked. Only `active` is used here, but the full
// shape is typed so it's obviously the same global StarMarker writes.
interface MarkerLock {
  active: boolean;
  x: number;
  y: number;
  hexRadius: number;
  owner: string;
}
type MarkerLockWindow = Window & { __bhMarkerLock?: MarkerLock | null };
function markerLockWindow(): MarkerLockWindow {
  return window as unknown as MarkerLockWindow;
}

export default function HudNavigation({
  visible,
  reduced,
  currentId,
  base,
  markerFrameRef,
}: HudNavigationProps) {
  // The rail item the pointer is hovering / the keyboard has focused. null when
  // nothing on the rail is pointed (then the nearest marker / scroll stage wins).
  const [pointedId, setPointedId] = useState<HudTargetId | null>(null);
  // The aiming result (nearest marker id + idle flag), recomputed each rAF off
  // the cursor + marker frame; committed only when it actually changes.
  const [aim, setAim] = useState<AimState>({ markerId: null, idle: true });
  // Whether the cursor is hard-LOCKED onto a marker (StarMarker's target lock).
  // Read from the sitewide __bhMarkerLock global each rAF; flips at most a handful
  // of times as the cursor crosses a hexagon boundary — never per frame.
  const [locked, setLocked] = useState(false);

  // Live cursor position tracked via a ref (NOT state) so the rAF loop can place
  // the ┼ waypoint every frame without re-rendering — mirrors StarMarker.pointerRef.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  // The ┼ marker waypoint, mutated directly each frame (translate via inline
  // style) — the only thing that moves. The ▲ cursor anchor is fixed in CSS.
  const targetRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const onMove = (event: MouseEvent): void => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    document.addEventListener('mousemove', onMove, { passive: true });
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  // The aiming rAF loop. Each frame: gather the markers currently interactive on
  // screen (frame.visible AND this scene is the settled one), compute each one's
  // screen px (anchored markers ride the projected origin; the rest sit at a
  // viewport fraction — same math as StarMarker), find the one nearest the
  // cursor, OFFSET the ┼ waypoint around the fixed ▲ along the cursor→marker
  // bearing (radius scaled by distance), and commit the named target / idle flag
  // to state ONLY when it flips. Cleans up on unmount.
  useEffect(() => {
    let rafId = 0;
    let lastMarkerId: string | null = null;
    let lastIdle = true;
    let lastLocked = false;

    function tick(): void {
      rafId = requestAnimationFrame(tick);
      const frame = markerFrameRef.current;
      const cursor = pointerRef.current;

      // Candidate markers: those whose state is the settled one on screen RIGHT
      // NOW (same gate StarMarker uses for its own visibility/interactivity).
      let nearest: MarkerPlacement | null = null;
      let nearestX = 0;
      let nearestY = 0;
      if (frame && frame.visible && cursor) {
        const settled = settledIdForStage(frame.stage);
        let bestDistSq = Number.POSITIVE_INFINITY;
        for (const placement of MARKER_PLACEMENTS) {
          if (placement.state !== settled) continue;
          const x = placement.anchored ? frame.x : placement.vx * window.innerWidth;
          const y = placement.anchored ? frame.y : placement.vy * window.innerHeight;
          const dx = cursor.x - x;
          const dy = cursor.y - y;
          const distSq = dx * dx + dy * dy;
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            nearest = placement;
            nearestX = x;
            nearestY = y;
          }
        }
      }

      // Offset the ┼ waypoint around the fixed ▲ along the cursor→marker bearing.
      // The vector is computed from the LIVE CURSOR (not the gauge): dx/dy is the
      // direction the user must move the cursor to reach the marker. We translate
      // the ┼ by (cos·r, sin·r) — screen y is down, atan2(dy,dx) is already in
      // screen space, so no sign flip is needed. The radius scales with distance
      // (clamped MIN..MAX) so the ┼ rides out far when the cursor is far and
      // converges onto the ▲ as the cursor closes in. Mutate the DOM directly —
      // no setState — so the waypoint glides render-free.
      const target = targetRef.current;
      if (target) {
        if (nearest && cursor) {
          const dx = nearestX - cursor.x;
          const dy = nearestY - cursor.y;
          const dist = Math.hypot(dx, dy);
          const r = clamp(dist * WAYPOINT_OFFSET_SCALE, WAYPOINT_MIN_OFFSET, WAYPOINT_MAX_OFFSET);
          const bearing = Math.atan2(dy, dx);
          const ox = Math.cos(bearing) * r;
          const oy = Math.sin(bearing) * r;
          target.style.transform = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px)`;
        } else {
          // No marker to aim at — park the ┼ on the ▲ (the data-idle CSS fades it).
          target.style.transform = 'translate(0px, 0px)';
        }
      }

      // Commit the named target / idle flag only when it flips. Idle = nothing to
      // aim at AND no rail hover (the rail-hover check reads the latest state via
      // the lastIdle compare below; pointedId lives in React state, so we fold it
      // in at render time rather than here — see `idle` derivation in JSX).
      const nextMarkerId = nearest ? nearest.id : null;
      const nextIdle = nearest === null;
      if (nextMarkerId !== lastMarkerId || nextIdle !== lastIdle) {
        lastMarkerId = nextMarkerId;
        lastIdle = nextIdle;
        setAim({ markerId: nextMarkerId, idle: nextIdle });
      }

      // Hard target lock: read the sitewide global StarMarker publishes (the same
      // one the cursor docks to). `active` is the true "locked in" signal — when
      // the cursor is inside a marker's hexagon (or the link is focused). Commit
      // to state only when it flips, same cheap pattern as the named target above.
      const lock = markerLockWindow().__bhMarkerLock;
      const nextLocked = !!(lock && lock.active);
      if (nextLocked !== lastLocked) {
        lastLocked = nextLocked;
        setLocked(nextLocked);
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [markerFrameRef]);

  // Resolve the COMPASS COPY. Naming priority: rail hover/focus (a deliberate
  // pointing gesture) → the nearest on-screen marker → null. The needle aims at
  // the nearest marker regardless; rail hover only overrides the NAME.
  const nearestPlacement = aim.markerId
    ? MARKER_PLACEMENTS.find((m) => m.id === aim.markerId) ?? null
    : null;
  const copy: CompassCopy | null = pointedId
    ? copyForHudId(pointedId)
    : nearestPlacement
      ? copyForMarker(nearestPlacement)
      : null;
  // Idle = nothing to aim at AND no rail hover. The compass then shows NO SIGNAL
  // and the needle is hidden/centred (CSS off the data-idle attribute).
  const idle = copy === null;
  // Whether the ┼ is actively aiming at a real marker (gold) vs. idle (dim).
  const aiming = nearestPlacement !== null;

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

      {/* Aiming compass "embarked in the cursor", anchored bottom-centre. The ▲ is
          the CURSOR — the fixed anchor at the gauge's centre, never moved. The ┼ is
          the nearest on-screen MARKER, TRANSLATED (set every rAF above) to a polar
          position around the ▲ along the cursor→marker bearing, so the line ▲→┼
          shows which way to move the cursor; its offset shrinks as the cursor nears
          the marker. When no marker is on screen / in range and the rail is not
          hovered it falls IDLE (a dim NO SIGNAL placeholder, the ┼ parked & faded).
          aria-hidden because the rail buttons + markers already announce their own
          labels (the old mobile readout had the same rationale — this replaces it,
          now visible on desktop too). The markup is always rendered (its frame
          never pops in/out); data-idle swaps the copy + fades the ┼.

          IMPORTANT: rendered as a SIBLING of .hud-system, not a child. .hud-system
          carries a transform (translate(...,-50%) for vertical centring), and a CSS
          transform on an ancestor makes position:fixed resolve against that ancestor
          instead of the viewport — which trapped the compass mid-rail. As a sibling
          its position:fixed bottom-centre resolves against the viewport correctly. */}
      <div
        className="hud-compass"
        data-visible={visible}
        data-aiming={aiming}
        data-locked={locked}
        data-idle={idle}
        data-reduced={reduced}
        aria-hidden="true"
      >
        {/* The gauge rose. A faint static crosshair sits behind for the instrument
            look; over it the ▲ cursor anchor is pinned dead-centre (upright, never
            moved) and the ┼ marker waypoint is centred then TRANSLATED each rAF to
            its polar offset (upright — no rotation anywhere). */}
        <span className="hud-compass-rose">
          <span className="hud-compass-frame" aria-hidden="true" />
          <span className="hud-compass-ship" aria-hidden="true">▲</span>
          <span ref={targetRef} className="hud-compass-target" aria-hidden="true">
            +
          </span>
        </span>
        {idle ? (
          <>
            <p className="hud-compass-read hud-compass-read--idle">
              <span className="hud-compass-prompt">[ </span>
              <span className="hud-compass-label">NO SIGNAL</span>
              <span className="hud-compass-prompt"> ]</span>
            </p>
            {/* Reserve the second (destination) line's height even when idle so the
                grid block is the SAME height in both states — the rose + first
                readout line never shift vertically when toggling idle↔active. It
                carries the exact .hud-compass-dest metrics but is visibility:hidden
                (a non-breaking space, .is-spacer) so it occupies space without
                showing as filler. */}
            <p className="hud-compass-dest hud-compass-dest--spacer" aria-hidden="true">
              &nbsp;
            </p>
          </>
        ) : (
          <>
            <p className="hud-compass-read">
              <span className="hud-compass-prompt">{aiming ? '[·]' : ' › '}</span>
              <span className="hud-compass-label">{copy.label}</span>
            </p>
            <p className="hud-compass-dest">
              <span className="hud-compass-arrow">→</span>
              <span>{copy.dest}</span>
            </p>
          </>
        )}
      </div>
    </>
  );
}
