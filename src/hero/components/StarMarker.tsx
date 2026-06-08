// StarMarker — anchors a single clickable HTML link over the on-screen star object.
// One marker per settled lifecycle state. Position is updated every rAF from a ref
// written by the scene's onMarkerFrame callback, avoiding per-frame React re-renders.
//
// Interaction model — a HUD "target lock":
//   1. RESTING  — a dotted-outline hexagon + centre dot, quiet/off-white.
//   2. LOCKED   — the pointer comes within a proximity radius (or the link is
//      keyboard-focused): the hexagon becomes a solid outline with tick marks on
//      each edge midpoint, a slowly rotating/breathing gold inner hexagon appears,
//      and a tethered terminal-style info card pops up beside the marker.
//   3. The whole thing is a real <a href>, so a click (on the marker OR the card's
//      OPEN affordance) navigates to the destination.
//
// The position AND the lock state are both computed inside the rAF loop, comparing
// the live pointer position (tracked via a ref, not state) to the marker's current
// frame x/y. React only re-renders when the visible/active-item/locked state flips
// — never per frame (mirrors how lastVisible/lastItemId are handled).
import { useEffect, useRef, useState } from 'react';
import { HUD_NAV_ITEMS, type HudNavItem, type HudTargetId } from '../HudNavigation';
import type { MarkerFrame } from '../scene/types';
import { useSceneState } from './SceneStateContext';

interface StarMarkerProps {
  /** Ref written by the scene frame loop. StarMarker reads it on rAF. */
  markerFrameRef: React.RefObject<MarkerFrame | null>;
}

// Handshake with the sitewide custom cursor (CustomCursor.astro). When a marker
// LOCKS, the cursor "docks": it snaps to the marker centre and renders the gold
// inner hexagon STATICALLY (the marker's own animated gold hex is hidden so there
// is exactly one gold hex on screen). The cursor IIFE can't import React/three.js,
// so — mirroring the window.__bhHitGiant hook — the marker publishes its lock here
// and the cursor reads it each frame. `x`/`y` are the marker centre in CSS px
// (the live frame x/y); `hexRadius` is the marker-box half-size in CSS px so the
// cursor can size its gold inner hex relative to the white outer hex. `active:false`
// (or null) means no marker is locked → the cursor returns to normal pointer tracking.
interface MarkerLock {
  active: boolean;
  x: number;
  y: number;
  hexRadius: number;
}
// Local, typed access to the shared global (no `any`; matches the file's
// `window as unknown as {...}` style used elsewhere for debug hooks).
type MarkerLockWindow = Window & { __bhMarkerLock?: MarkerLock | null };
function markerLockWindow(): MarkerLockWindow {
  return window as unknown as MarkerLockWindow;
}

// The lock hitbox is a circle that touches the hexagon's PEAKS (vertices). The
// hexagon is a regular flat-top hexagon spanning 100 units (HEX_POINTS) inside a
// 116-unit viewBox, so its circumradius (centre→vertex) is 50 of those 116 units.
// On screen the marker box width maps to the full 116 units, so the peak radius in
// CSS px is boxWidth * (50 / 116). HEX_PEAK_RATIO is that factor; the engage radius
// is computed per-frame from the marker's measured width (below).
const HEX_PEAK_RATIO = 50 / 116;
// Hysteresis: release a touch farther than engage so the lock never flickers at the
// boundary. RELEASE_MARGIN is added to the geometry-derived engage radius.
const LOCK_RELEASE_MARGIN = 14; // px past the peak before the lock drops

// Card-flip threshold: when the marker sits in the right ~30% of the viewport the
// card + connector flip to the LEFT so the card stays on-screen.
const CARD_FLIP_FRACTION = 0.7;

// One short subtitle line per target. Title derives from the nav item itself (its
// `destination`, uppercased); this small typed map only owns the subtitle copy.
// No em dashes anywhere (plain text only).
const MARKER_SUBTITLES: Record<HudTargetId, string> = {
  beginning: 'Who I am',
  nebula: 'Notes & essays',
  yellow: 'Things I build',
  red: 'Things I abandoned',
  end: 'Why this site exists',
};

// Settled-window stage thresholds (MUST stay byte-identical to the settled
// check in createScene.ts onMarkerFrame block — both files gate marker
// visibility on the same stage ranges). Widened so each state dwells across
// ≈2-3 consecutive 5% scroll samples.
// Returns the HudNavItem whose stage window contains `stage`, or null if mid-transition.
function settledItemForStage(stage: number): HudNavItem | null {
  // dot: stage 4.40 - 4.72  (p≈0.00-0.06)
  if (stage >= 4.40 && stage <= 4.72) {
    return HUD_NAV_ITEMS.find((i) => i.id === 'beginning') ?? null;
  }
  // nebula: stage 3.28 - 3.68  (p≈0.15-0.27)
  if (stage >= 3.28 && stage <= 3.68) {
    return HUD_NAV_ITEMS.find((i) => i.id === 'nebula') ?? null;
  }
  // yellow star: stage 2.82 - 3.05  (p≈0.30-0.42)
  if (stage >= 2.82 && stage <= 3.05) {
    return HUD_NAV_ITEMS.find((i) => i.id === 'yellow') ?? null;
  }
  // red giant: stage 1.98 - 2.40  (p≈0.46-0.68)
  if (stage >= 1.98 && stage <= 2.40) {
    return HUD_NAV_ITEMS.find((i) => i.id === 'red') ?? null;
  }
  // black hole: stage 0.00 - 0.35  (p≈0.82-1.00, post-supernova only)
  if (stage >= 0.0 && stage <= 0.35) {
    return HUD_NAV_ITEMS.find((i) => i.id === 'end') ?? null;
  }
  return null;
}

function resolveHref(base: string, href: string): string {
  return `${base}/${href}`.replace(/\/+/g, '/');
}

// Flat-top regular hexagon points for a 100x100 viewBox (the SVG scales to the
// CSS box). Matches the cursor's flat-top orientation: vertices left/right are
// the pointy sides, top/bottom are flat edges.
const HEX_POINTS = '25,6.7 75,6.7 100,50 75,93.3 25,93.3 0,50';

// Outward-pointing tick marks centred on each of the 6 edge midpoints. Each is a
// short stroke whose inner end sits on the edge midpoint and whose outer end sticks
// out radially. Computed for the same 100x100 hexagon. Top + bottom + the four
// slanted sides — the cardinal-ish ticks read strongest (top/bottom/left-ish).
const HEX_TICKS: ReadonlyArray<{ x1: number; y1: number; x2: number; y2: number }> = [
  // top edge midpoint (50, 6.7) -> straight up
  { x1: 50, y1: 6.7, x2: 50, y2: -7 },
  // bottom edge midpoint (50, 93.3) -> straight down
  { x1: 50, y1: 93.3, x2: 50, y2: 107 },
  // upper-right edge midpoint (87.5, 28.35) -> out along the edge normal (60deg)
  { x1: 87.5, y1: 28.35, x2: 99.4, y2: 21.48 },
  // lower-right edge midpoint (87.5, 71.65) -> out along the edge normal
  { x1: 87.5, y1: 71.65, x2: 99.4, y2: 78.52 },
  // upper-left edge midpoint (12.5, 28.35) -> out along the edge normal
  { x1: 12.5, y1: 28.35, x2: 0.6, y2: 21.48 },
  // lower-left edge midpoint (12.5, 71.65) -> out along the edge normal
  { x1: 12.5, y1: 71.65, x2: 0.6, y2: 78.52 },
];

export default function StarMarker({ markerFrameRef }: StarMarkerProps) {
  const { reduced, base } = useSceneState();

  // The DOM element that receives inline left/top updates every rAF. Mutated
  // directly (no React state) to avoid per-frame re-renders.
  const elRef = useRef<HTMLAnchorElement>(null);

  // Live pointer position, tracked via a ref (NOT state) so the rAF loop can
  // measure distance to the marker every frame without re-rendering.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  // Whether the link currently holds keyboard focus — also forces the lock so
  // non-mouse users get the card. Ref so the rAF loop reads it without a render.
  const focusedRef = useRef(false);

  // Snapshot of the currently active nav item (React state, updated only when
  // the settled state changes — typically 0-5 times per page view).
  const [activeItem, setActiveItem] = useState<HudNavItem | null>(null);
  // Whether the marker is currently in the visible window (gates opacity CSS class).
  const [visible, setVisible] = useState(false);
  // Whether the marker is locked (pointer near / focused). Flips at most a handful
  // of times as the pointer crosses the proximity boundary — never per frame.
  const [locked, setLocked] = useState(false);
  // Side the card tethers to ('right' default, 'left' when the marker is near the
  // right edge). Recomputed only when the lock engages so it stays stable while held.
  const [cardSide, setCardSide] = useState<'right' | 'left'>('right');

  useEffect(() => {
    const onMove = (event: MouseEvent): void => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    document.addEventListener('mousemove', onMove, { passive: true });
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
    let rafId = 0;
    let lastVisible = false;
    let lastItemId: string | null = null;
    let lastLocked = false;
    let lastSide: 'right' | 'left' = 'right';

    function tick() {
      rafId = requestAnimationFrame(tick);
      const frame = markerFrameRef.current;
      if (!frame) return;

      // Update position directly on the DOM element (no setState, no re-render).
      const el = elRef.current;
      if (el) {
        el.style.left = `${frame.x.toFixed(1)}px`;
        el.style.top = `${frame.y.toFixed(1)}px`;
      }

      // Determine the settled item from stage.
      const item = frame.visible ? settledItemForStage(frame.stage) : null;
      const nextVisible = frame.visible && item !== null;
      const nextItemId = item?.id ?? null;

      // Proximity / focus lock. Computed against the marker's CURRENT frame x/y,
      // with hysteresis so it doesn't chatter at the boundary. Keyboard focus
      // forces the lock so non-pointer users still get the card.
      let nextLocked = lastLocked;
      if (!nextVisible) {
        nextLocked = false;
      } else if (focusedRef.current) {
        nextLocked = true;
      } else {
        const p = pointerRef.current;
        if (p) {
          const dx = p.x - frame.x;
          const dy = p.y - frame.y;
          const distSq = dx * dx + dy * dy;
          // Engage radius = the hexagon's on-screen peak (circumradius), so the lock
          // circle touches each vertex. Derived from the marker's measured width.
          const boxWidth = el ? el.getBoundingClientRect().width : 0;
          const engageRadius = boxWidth * HEX_PEAK_RATIO;
          const releaseRadius = engageRadius + LOCK_RELEASE_MARGIN;
          const engageSq = engageRadius * engageRadius;
          const releaseSq = releaseRadius * releaseRadius;
          if (!lastLocked && distSq <= engageSq) nextLocked = true;
          else if (lastLocked && distSq > releaseSq) nextLocked = false;
        } else if (!focusedRef.current) {
          nextLocked = false;
        }
      }

      // Card side: pin to the left when the marker is in the right ~30% of the
      // viewport so the card stays on-screen. Recompute only at the moment the
      // lock engages so the card never jitters sides while held.
      let nextSide = lastSide;
      if (nextLocked && !lastLocked) {
        nextSide = frame.x > window.innerWidth * CARD_FLIP_FRACTION ? 'left' : 'right';
      }

      // Publish the lock to the sitewide cursor every frame it's locked so the
      // cursor docks to the CURRENT marker centre (and follows it if the marker
      // drifts while held). Half the marker box (its on-screen width) is the
      // hexRadius the cursor uses to size its gold inner hex inside the white one.
      // Cleared to inactive the frame the lock releases (and on unmount below).
      const w = markerLockWindow();
      if (nextLocked) {
        const hexRadius = el ? el.getBoundingClientRect().width / 2 : frame.x; // px
        w.__bhMarkerLock = { active: true, x: frame.x, y: frame.y, hexRadius };
      } else if (lastLocked) {
        // Only clear when WE were the locked marker (avoid stomping another
        // marker's lock — though only one is ever mounted, this stays correct).
        w.__bhMarkerLock = { active: false, x: frame.x, y: frame.y, hexRadius: 0 };
      }

      // Only trigger React re-renders when a render-relevant value actually flips.
      if (nextVisible !== lastVisible) {
        lastVisible = nextVisible;
        setVisible(nextVisible);
      }
      if (nextItemId !== lastItemId) {
        lastItemId = nextItemId;
        setActiveItem(item);
      }
      if (nextSide !== lastSide) {
        lastSide = nextSide;
        setCardSide(nextSide);
      }
      if (nextLocked !== lastLocked) {
        lastLocked = nextLocked;
        setLocked(nextLocked);
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      // Undock the cursor if this marker unmounts while locked.
      markerLockWindow().__bhMarkerLock = null;
    };
  }, [markerFrameRef]);

  if (!activeItem) return null;

  const title = activeItem.destination.toUpperCase();
  const subtitle = MARKER_SUBTITLES[activeItem.id];

  return (
    <a
      ref={elRef}
      className="star-marker"
      href={resolveHref(base, activeItem.href)}
      aria-label={`${activeItem.label}. Go to ${activeItem.destination}.`}
      data-visible={visible}
      data-reduced={reduced}
      data-locked={locked}
      data-side={cardSide}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
      }}
    >
      {/* The target reticle: resting dotted hex + locked solid hex + ticks + the
          animated gold inner hex. All in one SVG so they scale crisply together. */}
      <svg
        className="star-marker-reticle"
        viewBox="-8 -8 116 116"
        aria-hidden="true"
      >
        {/* Resting state: dotted-outline hexagon. */}
        <polygon
          className="star-marker-hex-dotted"
          points={HEX_POINTS}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 4"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Locked state: solid thin outline hexagon. */}
        <polygon
          className="star-marker-hex-solid"
          points={HEX_POINTS}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {/* Locked state: tick marks on each edge midpoint. */}
        <g className="star-marker-ticks">
          {HEX_TICKS.map((t, i) => (
            <line
              key={i}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        {/* Locked state: gold inner hexagon — rotates + breathes (CSS). */}
        <polygon
          className="star-marker-hex-gold"
          points={HEX_POINTS}
          fill="none"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* The constant centre dot — present in both states. */}
      <span className="star-marker-dot" aria-hidden="true" />

      {/* The tethered terminal-style card — revealed with the locked state. */}
      <span className="star-marker-card" aria-hidden="true">
        <span className="star-marker-connector" />
        <span className="star-marker-card-body">
          <span className="star-marker-card-title">{title}</span>
          <span className="star-marker-card-subtitle">{subtitle}</span>
          <span className="star-marker-card-open">[ OPEN ]</span>
        </span>
      </span>
    </a>
  );
}
