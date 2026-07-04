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
// Interaction model — a minimal "target lock" that escalates across FOUR states. The
// marker's LOOK is keyed off `data-state` (idle → hover → active → locked); the LOCK
// contract (the card, the custom-cursor dock, window.__bhMarkerLock) is keyed off the
// unchanged binary `data-locked`. `locked === true` always implies data-state='locked';
// the other three are pure proximity tiers OUTSIDE the lock radius, so they escalate the
// LOOK without ever changing WHEN the lock fires. The marker draws NO shape of its own —
// just a warm gold core (the dot). The hexagon is the site's design language and belongs
// to the CURSOR: it appears only when the cursor DOCKS on a lock (CustomCursor.astro).
//   1. IDLE   — pointer far / none: a quiet gold dot. Nothing around it.
//   2. HOVER  — pointer inside the OUTER ring: the dot grows + glows, and a light
//      LEADER LINE appears to one side. Targetable.
//   3. ACTIVE — pointer inside the engage ring: a bigger, brighter photosphere dot.
//      Ready for selection.
//   4. LOCKED — the pointer reaches the lock radius (or the link is keyboard-focused,
//      or a touch tap on a coarse pointer): the brightest dot + the tethered
//      terminal-style info card, and — on a fine pointer — the docked cursor becomes
//      the gold hexagon selector around the dot. Confirmed selection.
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

// The lock hitbox is a circle sized as a fraction of the marker box. The box maps
// to a 116-unit reference frame and the engage circle has a 50-unit radius in it,
// so the lock radius in CSS px is boxWidth * (50 / 116). HEX_PEAK_RATIO is that
// factor; the engage radius is computed per-frame from the marker's measured width
// (below). (The value predates the minimal reticle — it used to be the hexagon's
// peak radius — but the hitbox geometry is unchanged, so the factor stays.)
const HEX_PEAK_RATIO = 50 / 116;
// Hysteresis: release a touch farther than engage so the lock never flickers at the
// boundary. RELEASE_MARGIN is added to the geometry-derived engage radius.
const LOCK_RELEASE_MARGIN = 14; // px past the peak before the lock drops

// --- The four marker states -----------------------------------------------------
// The marker escalates across FOUR tiers as the pointer approaches, on top of the
// binary `data-locked` (which drives the card + the custom-cursor dock +
// window.__bhMarkerLock). `data-state` is the signal CSS reads to escalate the gold
// CORE (the dot): idle → hover → active → locked, the dot growing and brightening.
//
//   idle    pointer far away / no pointer            — a quiet gold dot
//   hover   pointer inside the OUTER ring             — a bigger, glowing dot + leader line
//   active  pointer inside the engage ring            — a brighter photosphere dot
//   locked  the existing lock (engage / focus / tap)  — brightest dot + card; on a
//                                                        fine pointer the docked cursor
//                                                        becomes the gold hex selector
//
// LOCKED is the same lock as before — same radius, same `data-locked`, same
// __bhMarkerLock publish. ACTIVE/HOVER are tiers strictly OUTSIDE the lock radius,
// so they never change WHEN the lock fires; they only escalate the dot before it.
// Each ring boundary has its own hysteresis margin so the state never chatters.
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
  // NOTE: the card carries NO CTA link. The card is aria-hidden/decorative and
  // its hit area is only the small reticle dot, so a "Read the story →" line
  // looked clickable while clicks on it did nothing. The whole reticle <a> is the
  // real link (a click anywhere on it navigates / dives); placement.cta is left
  // unused on purpose rather than rendered as a dead affordance.
  const eyebrow = placement.eyebrow ?? placement.title;
  const headline = placement.headline ?? placement.title;
  const body = placement.body ?? placement.subtitle;
  const tags = placement.tags && placement.tags.length > 0 ? placement.tags : null;

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

      // Is THIS marker's beat the one on screen? frame.beatId is computed by the
      // scene from the SAME text bands + raw scroll the manifesto overlay renders
      // with, so the marker appears/disappears on the same frame as its copy.
      // Anchored markers ride the star origin, so they use `visible` (which
      // includes the origin's on-screen test). Fixed-spot markers sit at their own
      // viewport fraction — always on-screen — so they use `gateOk` (beat-band +
      // no-nova, WITHOUT the origin on-screen test) and stay visible even when the
      // camera-parked star's centre projects off the narrow/mobile viewport.
      const gate = anchored ? frame.visible : frame.gateOk;
      const nextVisible = gate && frame.beatId === placement.state;

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
          else if (lastLocked && distSq > releaseSq) {
            // Past the release radius — but DON'T drop the lock if the pointer is
            // travelling through the corridor toward the open card, or is over the
            // card itself. The card sits ~2× the release radius from the dot, so a
            // plain radius release would fire in the gap between dot and card and
            // make the card unreachable (pointer-events flips off mid-travel). While
            // locked, treat the card's rect (padded to bridge the connector gap) as
            // part of the keep-alive region: the lock only truly drops once the
            // pointer leaves BOTH the release circle AND that padded card region.
            const cardEl = el?.querySelector<HTMLElement>('.star-marker-card-body');
            const cr = cardEl?.getBoundingClientRect();
            const KEEP_ALIVE_PAD = 28; // px — bridges the dot→card connector gap
            const overCardRegion =
              !!cr &&
              p.x >= cr.left - KEEP_ALIVE_PAD &&
              p.x <= cr.right + KEEP_ALIVE_PAD &&
              p.y >= cr.top - KEEP_ALIVE_PAD &&
              p.y <= cr.bottom + KEEP_ALIVE_PAD;
            nextLocked = overCardRegion;
          }
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
      {/* Adaptive backing plate — a restrained blurred disc behind the dot, tuned
          per data-bg so the marker separates from black / bright / noisy surfaces.
          Position:absolute + z-index:-1 in CSS so it never grows the anchor box.
          Decorative. */}
      <span className="star-marker-plate" aria-hidden="true" />

      {/* No reticle SVG. The minimal marker is JUST the gold core (below): a warm
          dot that GROWS and brightens as the pointer approaches. The hexagon — the
          site's design language — is drawn only when the custom cursor DOCKS on a
          lock and itself becomes the gold hex selector around the dot (see
          CustomCursor.astro). Nothing is ever drawn around the dot before that. */}

      {/* The gold CORE — the glowing centre, present in EVERY state. A quiet dot at
          idle, growing + brightening through hover → active → the biggest, brightest
          dot at locked. This is the single gold-core source of truth the custom
          cursor docks against; the chapter is named by the micro-label + info card. */}
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

      {/* The tethered instrument card — revealed with the locked state. A single
          CHAMFERED HUD panel: cold-black fill + a crisp 1px white outline that
          traces the whole angular silhouette (top-left + bottom-right corners cut
          at 45°), drawn by the .star-marker-card-frame layer via stacked clip-paths.
          Inside: eyebrow → header rule → headline → desc → tags → CTA. Decorative
          (aria-hidden); the <a> carries the real accessible name (headline + body)
          above. */}
      <span className="star-marker-card" aria-hidden="true">
        <span className="star-marker-connector" />
        <span className="star-marker-card-body">
          {/* The angular white outline that follows the chamfered silhouette.
              Absolutely positioned behind the copy; drawn with clip-paths so the
              border traces the cut corners, not a plain rectangle. Decorative. */}
          <span className="star-marker-card-frame" />
          <span className="star-marker-card-text">
            <span className="star-marker-card-eyebrow">{eyebrow}</span>
            {/* Thin header rule — separates the chapter label from the headline
                the way the reference HUD readouts do. */}
            <span className="star-marker-card-rule" />
            <span className="star-marker-card-headline">{headline}</span>
            <span className="star-marker-card-desc">{body}</span>
            {/* No CTA line — the card is decorative; the reticle <a> is the link. */}
            {tags ? (
              <span className="star-marker-card-tags">{tags.join(' · ')}</span>
            ) : null}
          </span>
        </span>
      </span>
    </a>
  );
}
