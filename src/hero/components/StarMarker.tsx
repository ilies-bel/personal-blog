// StarMarker — anchors ONE clickable HTML link over the on-screen star object.
//
// A state can own several markers (the nebula owns three; everything else owns
// one). HeroIsland mounts one StarMarker per MARKER_PLACEMENTS entry; each
// instance owns its own placement and gates its own visibility on its state
// being the settled lifecycle state. This avoids mount/unmount thrash (N is
// small, ~7 total) and keeps the lock/card/cursor handshake fully per-marker.
//
// POSITION — two modes (per the placement):
//   • Fixed screen spot (default): the marker sits at `vx*innerWidth,
//     vy*innerHeight` while its state is on screen, recomputed each rAF (so it
//     tracks viewport resizes) but IGNORING the scene's projected x/y.
//   • Projection-anchored (`placement.anchored`, the pale blue dot only): the
//     marker rides the scene's projected star origin (frame.x/frame.y) so the
//     hexagon stays centred on the speck wherever it projects.
// Either way the stage/visible SIGNAL still comes from markerFrameRef.
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
// screen x/y. React only re-renders when the visible/locked/side state flips —
// never per frame (mirrors how lastVisible/lastLocked are handled).
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  settledIdForStage,
  type MarkerPlacement,
} from '../HudNavigation';
import type { MarkerFrame } from '../scene/types';
import { useSceneState, useSceneActions } from './SceneStateContext';

interface StarMarkerProps {
  /** This marker's placement (which state it belongs to, where it sits, its copy). */
  placement: MarkerPlacement;
  /** Ref written by the scene frame loop. StarMarker reads it on rAF for the
   *  stage/visible signal (and, when anchored, the projected x/y). */
  markerFrameRef: React.RefObject<MarkerFrame | null>;
}

// Handshake with the sitewide custom cursor (CustomCursor.astro). When a marker
// LOCKS, the cursor "docks": it snaps to the marker centre and renders the gold
// inner hexagon STATICALLY (the marker's own animated gold hex is hidden so there
// is exactly one gold hex on screen). The cursor IIFE can't import React/three.js,
// so — mirroring the window.__bhHitGiant hook — the marker publishes its lock here
// and the cursor reads it each frame. `x`/`y` are the marker centre in CSS px;
// `hexRadius` is the marker-box half-size in CSS px so the cursor can size its gold
// inner hex relative to the white outer hex. `active:false` (or null) means no
// marker is locked → the cursor returns to normal pointer tracking. `owner` is the
// id of the marker that set the lock, so an unlocking marker only clears the global
// when it still owns it (one global, many markers — never stomp another's lock).
interface MarkerLock {
  active: boolean;
  x: number;
  y: number;
  hexRadius: number;
  owner: string;
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

function resolveHref(base: string, href: string): string {
  return `${base}/${href}`.replace(/\/+/g, '/');
}

// Flat-top regular hexagon points for a 100x100 viewBox (the SVG scales to the
// CSS box). Matches the cursor's flat-top orientation: vertices left/right are
// the pointy sides, top/bottom are flat edges.
const HEX_POINTS = '25,6.7 75,6.7 100,50 75,93.3 25,93.3 0,50';

// Outward-pointing tick marks for a 3-point reticle: top edge + the two lower
// slanted edges. Each is a short stroke whose inner end sits on an edge midpoint
// and whose outer end sticks out radially. Computed for the same 100x100 hexagon.
// One tick points up and two splay down — a triangular "tripod" lock.
const HEX_TICKS: ReadonlyArray<{ x1: number; y1: number; x2: number; y2: number }> = [
  // top edge midpoint (50, 6.7) -> straight up
  { x1: 50, y1: 6.7, x2: 50, y2: -7 },
  // lower-right edge midpoint (87.5, 71.65) -> out along the edge normal
  { x1: 87.5, y1: 71.65, x2: 99.4, y2: 78.52 },
  // lower-left edge midpoint (12.5, 71.65) -> out along the edge normal
  { x1: 12.5, y1: 71.65, x2: 0.6, y2: 78.52 },
];

export default function StarMarker({ placement, markerFrameRef }: StarMarkerProps) {
  const { reduced, base } = useSceneState();
  // The dive action (published by HeroIsland). Present only on the home page; a
  // `dive` marker uses it on a plain left click, every other marker / page leaves
  // the <a> to navigate normally.
  const actions = useSceneActions();

  // Static per placement: does this marker sit over a bright scene surface? Drives
  // the resting dot's colour (dark dot on bright states, light dot on dark states)
  // via the data-bright attribute below — no canvas blend mode involved. Derived
  // from the authored background class (bg === 'bright') so all legacy CSS keeps
  // working while the new data-bg adds the third 'noisy' channel.
  const isBright = placement.bg === 'bright';

  // Richer-card copy, with the documented fallbacks so a marker that only carries
  // the legacy title/subtitle still renders a complete-looking panel:
  //   eyebrow  → title       headline → title       body → subtitle
  //   tags     → omitted when absent/empty
  //   cta      → the legacy '[ OPEN ]' affordance text when absent
  const eyebrow = placement.eyebrow ?? placement.title;
  const headline = placement.headline ?? placement.title;
  const body = placement.body ?? placement.subtitle;
  const tags = placement.tags && placement.tags.length > 0 ? placement.tags : null;
  const cta = placement.cta ? `${placement.cta} →` : '[ OPEN ]';

  // The per-destination-type inner glyph, painted with the marker's adaptive
  // currentColor via CSS mask (same mechanism as the HUD rail's --glyph-mask).
  // Resolved through the same BASE_URL helper the link href uses.
  const glyphMask = `url(${resolveHref(base, placement.glyph)})`;
  // The always-near micro-label: the eyebrow when present, else the title.
  const microLabel = placement.eyebrow ?? placement.title;

  // The DOM element that receives inline left/top updates every rAF. Mutated
  // directly (no React state) to avoid per-frame re-renders.
  const elRef = useRef<HTMLAnchorElement>(null);

  // Live pointer position, tracked via a ref (NOT state) so the rAF loop can
  // measure distance to the marker every frame without re-rendering.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  // The marker's CURRENT screen position (CSS px), stashed by the rAF loop each frame
  // (the SAME x/y written to el.style.left/top). The dive click reads it to aim the
  // plunge at where the marker actually is — so an off-centre marker is dived INTO,
  // not lurched-to-centre. Ref (not state) so the per-frame write never re-renders.
  const screenRef = useRef<{ x: number; y: number } | null>(null);
  // Whether the link currently holds keyboard focus — also forces the lock so
  // non-mouse users get the card. Ref so the rAF loop reads it without a render.
  const focusedRef = useRef(false);

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
    let lastLocked = false;
    let lastSide: 'right' | 'left' = 'right';

    // This marker's lock-ownership token (the placement id). Only the marker that
    // currently owns the single global __bhMarkerLock may clear it — see below.
    const owner = placement.id;
    const anchored = placement.anchored === true;

    function tick() {
      rafId = requestAnimationFrame(tick);
      const frame = markerFrameRef.current;
      if (!frame) return;

      // Is THIS marker's state the settled one on screen? The stage decides which
      // state is settled; we additionally require it to be ours. Anchored markers
      // ride the star origin, so they use `visible` (which includes the origin's
      // on-screen test). Fixed-spot markers sit at their own viewport fraction —
      // always on-screen — so they use `gateOk` (settled + no-nova, WITHOUT the
      // origin on-screen test) and stay visible even when the camera-parked star's
      // centre projects off the narrow/mobile viewport.
      const gate = anchored ? frame.visible : frame.gateOk;
      const nextVisible = gate && settledIdForStage(frame.stage) === placement.state;

      // Screen position. Fixed-spot markers ignore the projected x/y and sit at a
      // viewport fraction (recomputed each frame so a resize tracks). The anchored
      // pale-blue-dot marker rides the projected star origin instead.
      const x = anchored ? frame.x : placement.vx * window.innerWidth;
      const y = anchored ? frame.y : placement.vy * window.innerHeight;

      // Stash the live screen position so the dive click can aim at THIS marker (the
      // onClick reads screenRef, converts to NDC, and passes it as the dive aim point).
      screenRef.current = { x, y };

      // Update position directly on the DOM element (no setState, no re-render).
      const el = elRef.current;
      if (el) {
        el.style.left = `${x.toFixed(1)}px`;
        el.style.top = `${y.toFixed(1)}px`;
      }

      // Proximity / focus lock. Computed against this marker's CURRENT x/y, with
      // hysteresis so it doesn't chatter at the boundary. Keyboard focus forces the
      // lock so non-pointer users still get the card.
      let nextLocked = lastLocked;
      if (!nextVisible) {
        nextLocked = false;
      } else if (focusedRef.current) {
        nextLocked = true;
      } else {
        const p = pointerRef.current;
        if (p) {
          const dx = p.x - x;
          const dy = p.y - y;
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
        nextSide = x > window.innerWidth * CARD_FLIP_FRACTION ? 'left' : 'right';
      }

      // Publish the lock to the sitewide cursor every frame it's locked so the
      // cursor docks to THIS marker's centre. Half the marker box is the hexRadius
      // the cursor uses to size its gold inner hex inside the white one. On release,
      // clear the global ONLY if we still own it — never stomp another marker's lock
      // (markers' peak-radius hitboxes never overlap, so a stale owner can only
      // appear if a far marker's release frame runs after a near one engaged; the
      // ownership compare keeps that correct anyway).
      const w = markerLockWindow();
      if (nextLocked) {
        const hexRadius = el ? el.getBoundingClientRect().width / 2 : 0; // px
        w.__bhMarkerLock = { active: true, x, y, hexRadius, owner };
      } else if (lastLocked) {
        const current = w.__bhMarkerLock;
        if (!current || current.owner === owner) {
          w.__bhMarkerLock = { active: false, x, y, hexRadius: 0, owner };
        }
      }

      // Only trigger React re-renders when a render-relevant value actually flips.
      if (nextVisible !== lastVisible) {
        lastVisible = nextVisible;
        setVisible(nextVisible);
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
      // Undock the cursor if this marker unmounts while it owns the lock.
      const w = markerLockWindow();
      const current = w.__bhMarkerLock;
      if (current && current.owner === placement.id) w.__bhMarkerLock = null;
    };
  }, [markerFrameRef, placement]);

  return (
    <a
      ref={elRef}
      className="star-marker"
      href={resolveHref(base, placement.href)}
      aria-label={`${headline} ${body}`}
      data-visible={visible}
      data-reduced={reduced}
      data-locked={locked}
      data-bright={isBright}
      data-bg={placement.bg}
      data-side={cardSide}
      onClick={(e) => {
        if (!placement.dive || !actions.beginDive) return;  // non-dive markers / engine not ready → normal nav
        // let modified clicks (new tab, etc.) and non-left clicks fall through to the <a>
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        // Aim the dive at THIS marker's current on-screen position (so an off-centre
        // nebula speck is dived INTO, not lurched-to-centre). screenRef holds the same
        // CSS-px x/y the rAF loop writes to the element; convert to NDC (x in [-1,1],
        // y up). Fall back to the click coords, then dead-centre, if the loop hasn't
        // run yet. `state` selects the bloom's per-lifecycle-state tint.
        const screen = screenRef.current ?? { x: e.clientX, y: e.clientY };
        const ndcX = (screen.x / window.innerWidth) * 2 - 1;
        const ndcY = -((screen.y / window.innerHeight) * 2 - 1);
        actions.beginDive({
          href: resolveHref(base, placement.href),
          targetNdc: { x: ndcX, y: ndcY },
          state: placement.state,
        });
      }}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
      }}
    >
      {/* Adaptive backing plate — a restrained blurred disc behind the reticle,
          tuned per data-bg so the marker separates from black / bright / noisy
          surfaces. Position:absolute + z-index:-1 in CSS so it never grows the
          anchor box. Decorative. */}
      <span className="star-marker-plate" aria-hidden="true" />

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

      {/* The per-type inner glyph — owns the resting centre. Painted with the
          marker's adaptive currentColor via CSS mask (the --glyph-mask custom prop
          carries the resolved SVG url). Position:absolute in CSS. Decorative. */}
      <span
        className="star-marker-glyph"
        aria-hidden="true"
        style={{ '--glyph-mask': glyphMask } as CSSProperties}
      />

      {/* The gold centre dot — hidden at rest (the glyph owns the centre), shown
          ONLY on lock as the Voyager-gold accent that docks with the cursor. */}
      <span className="star-marker-dot" aria-hidden="true" />

      {/* Always-near micro-label — a tiny mono caption under the marker so each
          hotspot reads even at rest; fades out on lock when the full card opens.
          Decorative (the <a> carries the real accessible name). */}
      <span className="star-marker-microlabel" aria-hidden="true">{microLabel}</span>

      {/* The tethered terminal-style card — revealed with the locked state. The
          richer panel: eyebrow → headline → desc → tags → CTA, with a reserved
          media slot for the future orbital diagram. Decorative (aria-hidden); the
          <a> carries the real accessible name (headline + body) above. */}
      <span className="star-marker-card" aria-hidden="true">
        <span className="star-marker-connector" />
        <span className="star-marker-card-body">
          <span className="star-marker-card-text">
            <span className="star-marker-card-eyebrow">{eyebrow}</span>
            <span className="star-marker-card-headline">{headline}</span>
            <span className="star-marker-card-desc">{body}</span>
            {tags ? (
              <span className="star-marker-card-tags">{tags.join(' · ')}</span>
            ) : null}
            <span className="star-marker-card-cta">{cta}</span>
          </span>
          {/* placeholder: orbital diagram + icons go here */}
          <span className="star-marker-card-media" />
        </span>
      </span>
    </a>
  );
}
