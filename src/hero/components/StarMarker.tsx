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
// Interaction model — a HUD "target lock" that escalates across FOUR states. The
// visible reticle is keyed off `data-state` (idle → hover → active → locked); the
// LOCK contract (the card, the custom-cursor dock, window.__bhMarkerLock) is keyed
// off the unchanged binary `data-locked`. `locked === true` always implies
// data-state='locked'; the other three are pure proximity tiers OUTSIDE the lock
// radius, so they escalate the LOOK without ever changing WHEN the lock fires.
//   1. IDLE   — pointer far / none: a faint dotted hex, faint crosshair arms, a dim
//      centre core. Quiet.
//   2. HOVER  — pointer inside the OUTER ring: the hex turns solid, the four
//      crosshair arms brighten + segment, the gold core glows, and a light LEADER
//      LINE appears to one side. Targetable.
//   3. ACTIVE — pointer inside the engage ring: + a concentric inner double-hex, a
//      brighter glowing core, stronger arms. Ready for selection.
//   4. LOCKED — the pointer reaches the lock radius (or the link is keyboard-focused,
//      or a touch tap on a coarse pointer): + an inner ring around the brightest gold
//      core, the tick "tripod", the rotating/breathing gold inner hex, and the
//      tethered terminal-style info card. Confirmed selection.
//   The whole thing is a real <a href>, so a click (on the marker OR the card's OPEN
//   affordance) navigates to the destination.
//
// The position AND the lock state are both computed inside the rAF loop, comparing
// the live pointer position (tracked via a ref, not state) to the marker's current
// screen x/y. React only re-renders when the visible/locked/side state flips —
// never per frame (mirrors how lastVisible/lastLocked are handled).
//
// TOUCH (coarse pointer) — a tap-to-reveal analog of desktop hover-lock. On a phone
// `mousemove` never fires, so the proximity path above can never engage; a touch
// user would only ever NAVIGATE the <a> and never see the info card. So on a coarse
// pointer the lock becomes EVENT-driven instead of proximity-driven:
//   • First tap on an UNLOCKED marker → preventDefault (no navigation) and LOCK it
//     (reveal the card). This is the touch analog of the desktop proximity lock.
//   • Second tap on the SAME locked marker → on a `dive` marker fires the cinematic
//     DIVE (the same plunge desktop gets); on any other marker the <a> navigates
//     natively. So touch confirms with the full experience, not a lesser one.
//   • A tap ELSEWHERE (another marker or empty space) → unlock (dismiss the card);
//     tapping another marker locks that one. Only ONE marker is locked at a time.
// The touch lock lives in `touchLockedRef`; the rAF loop RESPECTS it (it never
// clears a touch-set lock from "no pointer is near") so the tap doesn't race the
// next frame. Desktop's mouse-proximity + keyboard-focus path is untouched — the
// touch branch only runs when `window.matchMedia('(pointer: coarse)')` matches.
import { useEffect, useRef, useState } from 'react';
import {
  settledIdForStage,
  type MarkerPlacement,
} from '../HudNavigation';
import { HUD_ACTIVE_BODY_CLASS, LOADER_GONE_BODY_CLASS } from '../lib/constants';
import { resolveHref } from '../lib/url';
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

// --- The four crosshair states -------------------------------------------------
// The visible reticle escalates across FOUR tiers as the pointer approaches, on top
// of the unchanged binary `data-locked` (which still solely drives the card + the
// custom-cursor dock + window.__bhMarkerLock). `data-state` is the richer signal CSS
// reads to layer geometry: idle → hover → active → locked, low→high contrast.
//
//   idle    pointer far away / no pointer            — dotted hex + faint arms + dim core
//   hover   pointer inside the OUTER ring             — solid hex + segmented arms + leader line
//   active  pointer inside the engage ring            — + inner double-hex + brighter core
//   locked  the existing lock (engage / focus / tap)  — + inner ring + brightest core + card
//
// LOCKED is identical to today's lock — same radius, same `data-locked`, same
// __bhMarkerLock publish. ACTIVE/HOVER are NEW tiers strictly OUTSIDE the lock
// radius, so they never change WHEN the lock fires; they only add escalation before
// it. Each ring boundary has its own hysteresis margin so the state never chatters.
type MarkerState = 'idle' | 'hover' | 'active' | 'locked';

// Ring radii are derived per-frame from the lock's engage radius (boxWidth *
// HEX_PEAK_RATIO). ACTIVE sits just outside the lock circle; HOVER sits outside
// ACTIVE. The factors are multipliers ON the engage radius; the margins add the
// same flicker-proofing hysteresis the lock uses, on each new boundary.
const ACTIVE_RADIUS_FACTOR = 1.55; // active band = lock radius → 1.55× the engage radius
const HOVER_RADIUS_FACTOR = 2.7; // hover band  = active edge → 2.7× the engage radius
const TIER_RELEASE_MARGIN = 10; // px past a tier edge before it relaxes

// Card-flip threshold: when the marker sits in the right ~30% of the viewport the
// card + connector flip to the LEFT so the card stays on-screen.
const CARD_FLIP_FRACTION = 0.7;

// Touch detection. A coarse pointer (finger/stylus) has no hover, so the marker
// switches to the tap-to-lock model. Evaluated lazily inside event handlers (not
// cached at module load) so it stays correct if a device's primary pointer changes
// — e.g. a 2-in-1 toggling between trackpad and touchscreen. Guarded for SSR.
function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

// Flat-top regular hexagon points for a 100x100 viewBox (the SVG scales to the
// CSS box). Matches the cursor's flat-top orientation: vertices left/right are
// the pointy sides, top/bottom are flat edges.
const HEX_POINTS = '25,6.7 75,6.7 100,50 75,93.3 25,93.3 0,50';

// The four CROSSHAIR ARMS — what makes the reticle read as a crosshair, not just a
// hexagon. One SHORT tick at each of N / E / S / W, FLOATING just outside the hexagon
// with a clear gap from the silhouette (reference proportions: clean short ticks, NOT
// long arms that span the frame). The hexagon centre is (50,50); its flat-top apothem
// is ≈ 43 (the top/bottom edge midpoints) and its circumradius is 50 (the left/right
// vertices). ARM_START sits a small gap PAST the silhouette so the tick reads as a
// detached crosshair mark; ARM_END is a modest length beyond that. The viewBox is
// "-8 -8 116 116" with overflow:visible, but the ticks deliberately stay short and do
// NOT reach the box edge — at the 6rem box, ~58→80 (of 116) is a tidy ~18px tick.
const ARM_START = 58; // units from centre where the floating tick begins (just past the hex)
const ARM_END = 80; // units from centre where the tick ends — a short, clean reach
// Four ticks in N / E / S / W order. Built from the radii above so the geometry stays
// in one place; dx/dy is the unit direction.
const ARM_DIRS: ReadonlyArray<{ id: string; dx: number; dy: number }> = [
  { id: 'n', dx: 0, dy: -1 },
  { id: 'e', dx: 1, dy: 0 },
  { id: 's', dx: 0, dy: 1 },
  { id: 'w', dx: -1, dy: 0 },
];
const C = 50; // hexagon centre in viewBox units
interface ArmSegment {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
const ARM_SEGMENTS: ReadonlyArray<ArmSegment> = ARM_DIRS.map((d) => ({
  key: d.id,
  x1: C + d.dx * ARM_START,
  y1: C + d.dy * ARM_START,
  x2: C + d.dx * ARM_END,
  y2: C + d.dy * ARM_END,
}));

// The INNER (double-)hexagon shown from ACTIVE upward — a smaller concentric hex
// scaled toward the centre. We reuse the flat-top hexagon shape via a transform in
// CSS (scale about the fill-box centre), so no second point set is needed; the
// element just reuses HEX_POINTS. (Defined as the same string for clarity.)
const INNER_HEX_POINTS = HEX_POINTS;
// The LOCKED inner ring (concentric circle inside the inner hex, around the core).
// Centre (50,50); radius chosen to sit comfortably inside the inner hex.
const INNER_RING_RADIUS = 17;

// LOCKED tick marks — the three-point "tripod" confirm cue: top edge midpoint plus
// the two lower slanted edges. Each is a short stroke whose inner end sits on an
// edge midpoint and whose outer end sticks out radially. Computed for the same
// 100x100 hexagon. One tick points up and two splay down. Kept as part of the
// fullest LOCKED structure, coexisting with the four N/E/S/W arms above.
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
  // TOUCH lock: set true by a first tap on a coarse pointer, cleared by a tap
  // elsewhere (or navigation). Like focusedRef it FORCES the lock, but it is set
  // by an event rather than by per-frame proximity. The rAF loop respects it: when
  // true it holds the lock (so the tap doesn't lose to the next "no pointer near"
  // frame) and SKIPS the proximity branch entirely. A ref so toggling it never
  // re-renders — the rAF loop reads it and drives the visible `locked` state.
  const touchLockedRef = useRef(false);

  // Whether the marker is currently in the visible window (gates opacity CSS class).
  const [visible, setVisible] = useState(false);
  // Whether the marker is locked (pointer near / focused). Flips at most a handful
  // of times as the pointer crosses the proximity boundary — never per frame.
  const [locked, setLocked] = useState(false);
  // The richer 4-way escalation tier, layered ON TOP of `locked`. Drives the CSS
  // geometry matrix (data-state). Flips only when the pointer crosses a tier
  // boundary (each with its own hysteresis) — never per frame. `locked === true`
  // always implies state === 'locked'; the other three are pure proximity tiers
  // OUTSIDE the lock radius, so changing them never affects the lock contract.
  const [state, setState] = useState<MarkerState>('idle');
  // Side the card tethers to ('right' default, 'left' when the marker is near the
  // right edge). Recomputed only when the lock engages so it stays stable while held.
  const [cardSide, setCardSide] = useState<'right' | 'left'>('right');

  // Whether the intro loader is FULLY gone (body.loader-gone — set on the loader's
  // dark-background fade-out; see index.astro). Until then the marker sits UNDER the
  // loader, so it must be INERT: not clickable/hoverable (CSS pointer-events gate in
  // hud.css) AND not Tab-focusable. pointer-events does NOT remove an <a> from the tab
  // order, so we drive tabIndex from this flag (and short-circuit onFocus so a stray
  // programmatic focus can't force-lock the card early). Initialised by reading the
  // body class on mount (a returning visitor's loader may already be gone), then kept
  // in sync via a MutationObserver on the body's class attribute. Mirrors a real flip
  // the same way visible/locked do — re-renders only when it changes.
  const [loaderGone, setLoaderGone] = useState(false);

  useEffect(() => {
    const sync = (): boolean => {
      const gone = document.body.classList.contains(LOADER_GONE_BODY_CLASS);
      setLoaderGone(gone);
      return gone;
    };
    // Already gone before this marker mounted (returning visitor)? Stop here.
    if (sync()) return;
    const observer = new MutationObserver(() => {
      if (sync()) observer.disconnect();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // HUD-armed flag (body.hud-active), mirrored to React so it drives the marker's
  // `data-hud` attribute. The reticle's IDLE baseline differs by HUD state: HUD-off =
  // the quietest resting look (dotted hex only); HUD-on = a touch more present (dotted
  // hex + faint crosshair ticks). The full hover/active/locked escalation (and its
  // lock-in animation) works in BOTH HUD states — only the resting tier changes. The
  // class is toggled by the boot FSM, so we observe body.class and re-render on flip.
  const [hudActive, setHudActive] = useState(false);
  useEffect(() => {
    const sync = (): void => {
      setHudActive(document.body.classList.contains(HUD_ACTIVE_BODY_CLASS));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onMove = (event: MouseEvent): void => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    document.addEventListener('mousemove', onMove, { passive: true });
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  // TOUCH: outside-tap dismissal + cross-marker single-lock. A document-level
  // pointerdown listener (touch only) clears THIS marker's touch lock whenever the
  // tap lands outside its element. That single rule gives us both behaviours for
  // free: tapping empty space dismisses the open card, and tapping ANOTHER marker
  // fires this listener (the tap is outside us) so we release while the other
  // marker's own click handler locks itself — only one marker is ever locked.
  // Listen in the CAPTURE phase so we settle before the target marker's own click
  // handler runs (pointerdown precedes click), avoiding a release-then-relock race
  // on the marker being tapped: the tapped marker is INSIDE itself, so its own
  // listener's `el.contains(target)` check leaves it alone. The rAF loop reads
  // touchLockedRef next frame and drops the `locked` state, so no setState here.
  useEffect(() => {
    const onDocPointerDown = (event: PointerEvent): void => {
      if (event.pointerType !== 'touch') return;
      if (!touchLockedRef.current) return;
      const el = elRef.current;
      const target = event.target;
      // Keep the lock only if the tap is within this marker (its <a> or its card).
      if (el && target instanceof Node && el.contains(target)) return;
      touchLockedRef.current = false;
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true);
  }, []);

  useEffect(() => {
    let rafId = 0;
    let lastVisible = false;
    let lastLocked = false;
    let lastState: MarkerState = 'idle';
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
        // Publish the marker's viewport x in px as a CSS var so the TOUCH card can
        // anchor itself to the VIEWPORT (centre it horizontally) instead of to the
        // marker's side. The card is position:fixed but its containing block is this
        // transformed <a> (translate -50% -50% makes it the fixed CB), so its left:0
        // maps to the marker box's on-screen left edge, NOT the viewport's. Knowing
        // x lets the coarse-pointer CSS offset the card back to the viewport origin
        // (see hud.css `--marker-x`). Desktop never reads this var. Written every
        // frame alongside left/top (no setState). `--marker-y` is the twin for the
        // vertical axis so the touch sheet can pin to the viewport BOTTOM (not the
        // marker's mid-line) the same way.
        el.style.setProperty('--marker-x', `${x.toFixed(1)}px`);
        el.style.setProperty('--marker-y', `${y.toFixed(1)}px`);
      }

      // Proximity / focus / touch lock. Computed against this marker's CURRENT
      // x/y, with hysteresis so it doesn't chatter at the boundary. Keyboard focus
      // OR a touch tap forces the lock so non-pointer users still get the card.
      //
      // Touch precedence matters for the race: a coarse-pointer tap sets
      // touchLockedRef synchronously in the click handler, but the next rAF frame
      // has no nearby pointer (touch fires no mousemove), so the proximity branch
      // below would compute nextLocked=false and instantly drop the just-set lock.
      // We prevent that by checking touchLockedRef BEFORE the proximity branch and
      // skipping proximity entirely while it holds — the touch lock is purely
      // event-driven (set by tap, cleared by an outside tap / navigation). The only
      // thing that still overrides it is `!nextVisible` (the marker scrolled away),
      // which also resets touchLockedRef so a re-entry starts clean.
      // Geometry shared by the lock AND the new hover/active tiers: the engage
      // radius is the hexagon's on-screen peak (circumradius); the tier radii fan
      // out from it. Measured once per frame so both the lock and the tier logic
      // read the same numbers (and the tier work below never re-measures).
      const boxWidth = el ? el.getBoundingClientRect().width : 0;
      const engageRadius = boxWidth * HEX_PEAK_RATIO;
      // Live pointer distance (squared) to this marker, or -1 when no pointer.
      const p = pointerRef.current;
      const distSq = p ? (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) : -1;

      let nextLocked = lastLocked;
      if (!nextVisible) {
        nextLocked = false;
        touchLockedRef.current = false;
      } else if (touchLockedRef.current) {
        nextLocked = true;
      } else if (focusedRef.current) {
        nextLocked = true;
      } else {
        if (p) {
          // Lock circle touches each vertex (engage radius), with hysteresis.
          const releaseRadius = engageRadius + LOCK_RELEASE_MARGIN;
          const engageSq = engageRadius * engageRadius;
          const releaseSq = releaseRadius * releaseRadius;
          if (!lastLocked && distSq <= engageSq) nextLocked = true;
          else if (lastLocked && distSq > releaseSq) nextLocked = false;
        } else if (!focusedRef.current) {
          nextLocked = false;
        }
      }

      // Four-state escalation tier (data-state), layered on top of `nextLocked`.
      // LOCKED always wins (focus / touch / proximity-lock reach the top tier). When
      // NOT locked, the pointer's distance picks ACTIVE (inside the active ring),
      // HOVER (inside the wider hover ring), or IDLE (beyond it / no pointer). Each
      // boundary uses TIER_RELEASE_MARGIN of hysteresis vs the PREVIOUS tier so the
      // state can't chatter as the pointer hovers a boundary. The tiers sit strictly
      // OUTSIDE the lock radius, so this never changes WHEN the lock fires.
      let nextState: MarkerState = lastState;
      if (!nextVisible) {
        nextState = 'idle';
      } else if (nextLocked) {
        nextState = 'locked';
      } else if (focusedRef.current) {
        // Keyboard focus engages the lock above already, but guard so a focused
        // marker is never left below ACTIVE even if the lock branch is bypassed.
        nextState = 'active';
      } else if (distSq < 0) {
        nextState = 'idle';
      } else {
        const activeR = engageRadius * ACTIVE_RADIUS_FACTOR;
        const hoverR = engageRadius * HOVER_RADIUS_FACTOR;
        // Hysteresis: to ENTER a tighter tier use its raw radius; to LEAVE it, the
        // pointer must pass the radius PLUS the margin. Compare against the tier the
        // marker is currently in (lastState) so each boundary is sticky.
        const m = TIER_RELEASE_MARGIN;
        const inActive =
          lastState === 'active' || lastState === 'locked'
            ? distSq <= (activeR + m) * (activeR + m)
            : distSq <= activeR * activeR;
        const inHover =
          lastState === 'hover' || lastState === 'active' || lastState === 'locked'
            ? distSq <= (hoverR + m) * (hoverR + m)
            : distSq <= hoverR * hoverR;
        if (inActive) nextState = 'active';
        else if (inHover) nextState = 'hover';
        else nextState = 'idle';
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
      // Tier flip — the same disciplined compare-then-setState the other flips use,
      // so React re-renders only when the escalation tier actually changes.
      if (nextState !== lastState) {
        lastState = nextState;
        setState(nextState);
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      // Drop any held touch lock so a re-mount (Strict-Mode double-invoke, route
      // change) starts unlocked rather than inheriting a stale tap.
      touchLockedRef.current = false;
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
      data-state={state}
      data-hud={hudActive ? 'on' : 'off'}
      data-bright={isBright}
      data-bg={placement.bg}
      data-side={cardSide}
      // Which placement this reticle frames — lets CSS special-case a marker (the
      // 'beginning' one suppresses its gold core so the REAL pale blue dot shows).
      data-marker={placement.id}
      // Until the intro loader is fully gone the marker is INERT — remove it from
      // the tab order (CSS pointer-events:none already blocks click/hover). Once
      // loader-gone fires we restore default focusability (undefined → the <a>'s
      // natural tab order). After that the behaviour is exactly as before.
      tabIndex={loaderGone ? undefined : -1}
      onClick={(event) => {
        // ONE handler composing BOTH interactions. Order matters: the TOUCH
        // tap-to-lock two-step runs FIRST (coarse pointers can't hover, so they need
        // the reveal step before any navigation), then the DESKTOP dive, then natural
        // <a href> fall-through. There must be exactly one onClick on this element —
        // two onClick props would silently keep only the last and kill the other.

        // (0) LOADER GATE. While the intro loader is up the marker is INERT — CSS
        // pointer-events:none and tabIndex=-1 already keep a real activation from
        // reaching it, but guard here too so no path (a synthetic/programmatic click)
        // can lock or dive a marker before body.loader-gone. Nothing runs (no
        // preventDefault) until the loader is truly gone.
        if (!loaderGone) return;

        // (1) TOUCH tap-to-lock (coarse pointer only). Mouse/keyboard activation is
        // left entirely alone (the early return), so the desktop path below still
        // runs for fine pointers. We branch on the COARSE-POINTER check, not on
        // event.detail, so a hybrid device's mouse click never hits this path.
        if (isCoarsePointer()) {
          // First tap on an unlocked marker: reveal the card, do NOT navigate or
          // dive yet. touchLockedRef is the source of truth (the rAF loop derives
          // `locked` from it); checking the ref — not the possibly-one-frame-stale
          // `locked` state — makes a double-tap deterministic. Setting it here, then
          // letting the rAF loop hold it, is the race-proofing described on
          // touchLockedRef.
          if (!touchLockedRef.current) {
            event.preventDefault();
            touchLockedRef.current = true;
            return;
          }
          // Second (confirming) tap on the already-locked marker. We want touch users
          // to get the SAME cinematic dive desktop users get, so on a `dive` marker
          // (with the dive action available) we fire the dive here rather than a plain
          // href navigation. On any other marker we fall through WITHOUT
          // preventDefault so the real <a href> navigates natively (the marker is
          // unmounting on navigation, so there is no lock state left to clear).
          if (placement.dive && actions.beginDive) {
            event.preventDefault();
            const screen = screenRef.current ?? { x: event.clientX, y: event.clientY };
            const ndcX = (screen.x / window.innerWidth) * 2 - 1;
            const ndcY = -((screen.y / window.innerHeight) * 2 - 1);
            actions.beginDive({
              href: resolveHref(base, placement.href),
              targetNdc: { x: ndcX, y: ndcY },
              state: placement.state,
            });
          }
          return;
        }

        // (2) DESKTOP dive (fine pointer). main's behaviour, unchanged.
        if (!placement.dive || !actions.beginDive) return;  // non-dive markers / engine not ready → normal nav
        // let modified clicks (new tab, etc.) and non-left clicks fall through to the <a>
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        // Aim the dive at THIS marker's current on-screen position (so an off-centre
        // nebula speck is dived INTO, not lurched-to-centre). screenRef holds the same
        // CSS-px x/y the rAF loop writes to the element; convert to NDC (x in [-1,1],
        // y up). Fall back to the click coords, then dead-centre, if the loop hasn't
        // run yet. `state` selects the bloom's per-lifecycle-state tint.
        const screen = screenRef.current ?? { x: event.clientX, y: event.clientY };
        const ndcX = (screen.x / window.innerWidth) * 2 - 1;
        const ndcY = -((screen.y / window.innerHeight) * 2 - 1);
        actions.beginDive({
          href: resolveHref(base, placement.href),
          targetNdc: { x: ndcX, y: ndcY },
          state: placement.state,
        });
        // (3) Otherwise: no preventDefault — the <a href> navigates natively.
      }}
      onFocus={() => {
        // Guard against a programmatic/stray focus forcing the card open before the
        // loader is gone; once gone, this is the normal keyboard-focus lock.
        if (!loaderGone) return;
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
      }}
      onKeyDown={(event) => {
        // Escape dismisses the info card without navigating and without blurring
        // the element, so the keyboard user stays in place (next Tab continues from
        // this marker). The rAF loop reads focusedRef next frame and drops the lock.
        // Respect the same loader gate that onFocus/onClick use.
        if (event.key !== 'Escape') return;
        if (!loaderGone) return;
        focusedRef.current = false;
        touchLockedRef.current = false;
      }}
    >
      {/* Adaptive backing plate — a restrained blurred disc behind the reticle,
          tuned per data-bg so the marker separates from black / bright / noisy
          surfaces. Position:absolute + z-index:-1 in CSS so it never grows the
          anchor box. Decorative. */}
      <span className="star-marker-plate" aria-hidden="true" />

      {/* The target reticle — ONE crosshair that escalates across four states
          (data-state, layered atop data-locked). All elements live in one SVG so
          they scale crisply together; CSS keys each element's opacity / weight /
          glow off data-state. The viewBox is padded (-8..108) and the reticle CSS
          sets overflow:visible so the four crosshair arms can reach past the hex. */}
      <svg
        className="star-marker-reticle"
        viewBox="-8 -8 116 116"
        aria-hidden="true"
      >
        {/* CROSSHAIR TICKS — four short N/E/S/W ticks FLOATING just outside the hex.
            This is what makes the reticle read as a crosshair, present in EVERY state
            (faint at idle, brighter + a touch heavier on escalation). One clean tick
            per direction (reference proportions), NOT long arms across the frame.
            Stroke colour is currentColor; weight/opacity come from CSS. */}
        <g className="star-marker-arms">
          {ARM_SEGMENTS.map((s) => (
            <line
              key={s.key}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        {/* IDLE: finely-dotted hexagon — even round dots (round caps + a near-zero
            dash so each segment renders as a crisp dot), tightly spaced for the
            refined "minimal presence" look from the reference (the old 2.5/4 dash read
            coarse/cheap). Cross-faded to the solid hex from hover up. */}
        <polygon
          className="star-marker-hex-dotted"
          points={HEX_POINTS}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeDasharray="0.01 3.4"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* HOVER and up: solid outline hexagon. */}
        <polygon
          className="star-marker-hex-solid"
          points={HEX_POINTS}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
        />
        {/* ACTIVE and up: a second concentric INNER hexagon (the double-hex). Reuses
            the hex shape, scaled toward the centre via CSS. Off-white, like the
            outer hex — the gold is reserved for the rotating inner hex + core. */}
        <polygon
          className="star-marker-hex-inner"
          points={INNER_HEX_POINTS}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          vectorEffect="non-scaling-stroke"
        />
        {/* LOCKED: tick marks on three edge midpoints — the "tripod" confirm cue,
            kept as part of the fullest locked structure (it now coexists with the
            four arms above rather than standing in for them). */}
        <g className="star-marker-ticks">
          {HEX_TICKS.map((t) => (
            <line
              key={`tick-${t.x1}-${t.y1}`}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke="currentColor"
              strokeWidth="1.45"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        {/* LOCKED: an inner RING around the gold core (concentric circle inside the
            inner hex) — the confirmed-selection flourish. Gold. */}
        <circle
          className="star-marker-ring"
          cx={C}
          cy={C}
          r={INNER_RING_RADIUS}
          fill="none"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
        />
        {/* LOCKED: gold inner hexagon — rotates + breathes (CSS). Also the element
            the custom cursor docks to / hides when docked. */}
        <polygon
          className="star-marker-hex-gold"
          points={HEX_POINTS}
          fill="none"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* The gold CORE — the glowing centre, present in EVERY state per the reference
          (a warm gold dot at the heart of the reticle). Small + dim at idle
          ("resting · minimal presence"), brightens to a glowing core from HOVER up,
          a small photosphere at ACTIVE, and the brightest core at LOCKED. This is the
          single gold-core source of truth the custom cursor docks against. (There is
          no inner glyph: the chapter is named by the micro-label + info card.) */}
      <span className="star-marker-dot" aria-hidden="true" />

      {/* LEADER LINE — a thin connector + endpoint dot extending out to one side,
          appearing from HOVER (per the reference). It is lighter than the full
          locked card connector and reads as the "this hotspot is targetable" cue
          before the card opens. Sits on the card side (respects data-side). */}
      <span className="star-marker-leader" aria-hidden="true">
        <span className="star-marker-leader-line" />
        <span className="star-marker-leader-dot" />
      </span>

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
