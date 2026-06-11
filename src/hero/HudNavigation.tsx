import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  HUD_NAV_ITEMS,
  MARKER_PLACEMENTS,
  sceneForProgress,
  settledIdForStage,
  type HudNavItem,
  type HudTargetId,
  type MarkerPlacement,
} from './sceneTable';
import { hudIdForStage } from './lifecycleMachine';
import type { MarkerFrame } from './scene/types';
import { progressForLegacyStage } from './timeline';
import {
  SCROLL_HINT_DISMISS_AT,
  SCENE_READY_EVENT,
  SCENE_READY_BODY_CLASS,
} from './lib/constants';

// The HUD nav rows, on-screen markers, the settled-window gate and their shared
// types now live in sceneTable.ts (the pure data layer); the scroll-spy
// `hudIdForStage` now lives in lifecycleMachine.ts (the single lifecycle
// selector). They are re-exported here so the existing import paths
// ('../HudNavigation') resolve UNCHANGED. The duplicated literals, the
// byte-identical settled-window body, and the former local hudIdForStage copy
// that used to sit here are gone (the table + the machine are the single sources).
export { HUD_NAV_ITEMS, MARKER_PLACEMENTS, settledIdForStage, hudIdForStage };
export type { HudNavItem, HudTargetId, MarkerPlacement };

export const HUD_NAV_BY_ID = HUD_NAV_ITEMS.reduce<Record<HudTargetId, HudNavItem>>((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {} as Record<HudTargetId, HudNavItem>);

interface HudNavigationProps {
  visible: boolean;
  /** prefers-reduced-motion: travel jumps instead of smooth-scrolling. */
  reduced: boolean;
  /** The target the current scroll position maps to (scroll-spy "you are here").
   *  Drives a quiet ambient marker so the rail reflects scroll position. */
  currentId: HudTargetId | null;
  /** 0..1 scroll progress. Splits the compass idle copy: at/near a settled beat it
   *  is merely SCANNING; in a transition band past the opening hold it prompts the
   *  visitor to scroll back onto a beat. */
  progress: number;
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
//   3. Idle fallback: no interactive markers AND no rail hover -> the idle scan copy
//      (SEEKING SIGNAL, or SCROLL BACK TO THE POINT in a mid-transition band).
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
 *  no rail hover, swapping the readout to the idle scan placeholder. */
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
const WAYPOINT_MIN_OFFSET = 4; // px — closest the ┼ gets to the ▲ (essentially on it)
const WAYPOINT_MAX_OFFSET = 22; // px — farthest the ┼ rides out from the ▲
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

// --- Boot-to-HUD intro choreography ----------------------------------------
// The bottom-centre slot is the SAME element across the whole intro: while the
// engine chunk loads it is a boot readout (LOADING STATE → READY STATE → the
// REVERSE COLLAPSE / scroll-down cue), then on first scroll it hands the slot to
// the live aiming compass. One continuous element morphing — not a crossfade
// between two — so the boot readout reuses the .hud-compass* classes verbatim.
//
//   'loading' — body:NOT(.scene-ready): the engine chunk is still downloading /
//               compiling. Shows LOADING STATE. The pale pulsing loader dot stays.
//   'ready'   — the scene dispatched scene:ready (first composited WebGL frame,
//               body.scene-ready). Shows READY STATE. Held ~0.6s.
//   'cue'     — the standing intro tagline: REVERSE COLLAPSE / scroll down. A
//               FIXED cue (it does not track scroll) that holds until first scroll.
//   'live'    — the visitor has scrolled off the top: the boot readout dismisses
//               and the live compass (scene-named scroll readouts) owns the slot.
type BootPhase = 'loading' | 'ready' | 'cue' | 'live';

/** How long the READY STATE beat holds before the standing scroll cue swaps in.
 *  Long enough to register as a deliberate "systems online" confirmation, short
 *  enough not to stall the visitor. Skipped under reduced motion (straight to cue). */
const READY_HOLD_MS = 600;

/** Delay after READY before we ARM the glide. Three jobs: (1) hold the glide until AFTER the
 *  dot+name have faded OUT — they fade on their own early 0→0.3s window (see
 *  .scene-loader-mark in scene.css), so the readout must not start travelling until they are
 *  gone (~0.3s). This value (320ms) sits just past that fade so the sequence reads dot+name
 *  fade → glide → bg fade. (2) keep the data-glide flip in its OWN React commit DURING the
 *  'ready' beat — comfortably before READY_HOLD_MS swaps the readout text to the 'cue' branch.
 *  That separation matters: if data-glide flipped in the SAME commit as the cue children swap,
 *  the browser coalesces the recalc and the transition never starts (it snaps). So
 *  GLIDE_START_MS < READY_HOLD_MS (320 < 600 ✓). (3) Leave a beat after READY for the scene's
 *  heavy first paint to begin clearing. The PRECISE start is then deferred onto a clean
 *  compositor frame by the double-rAF below — the timer alone is not enough because its
 *  callback can fire DURING the jank frame (the timer queue drains the instant the main thread
 *  unblocks, while the heavy frame may still be in flight), and a transition started then is
 *  wall-clock driven and snaps. The double-rAF guarantees the flip lands on a frame AFTER the
 *  jank, where the promoted layer (will-change: transform) lets the travel run on the
 *  compositor. Keep --boot-glide-start in tokens.css IN STEP with this (0.32s) so the
 *  loader-background fade still begins exactly at glide end. */
const GLIDE_START_MS = 320;

/** True once the scene has dispatched scene:ready (body carries the ready class).
 *  Read at mount so a scene that became ready BEFORE this island hydrated still
 *  advances the boot phase (the event would already have fired and been missed). */
function sceneIsReady(): boolean {
  return typeof document !== 'undefined' && document.body.classList.contains(SCENE_READY_BODY_CLASS);
}

export default function HudNavigation({
  visible,
  reduced,
  currentId,
  progress,
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

  // The boot-to-HUD intro phase. Starts 'loading' (or 'ready' if the scene was
  // already ready before this island hydrated) and advances LOADING → READY →
  // cue (a standing scroll prompt) → live (hand the slot to the aiming compass).
  // The slot is one continuous element: boot readout while !== 'live', compass at
  // 'live'. See the BootPhase doc above for what drives each transition.
  const [bootPhase, setBootPhase] = useState<BootPhase>(() =>
    sceneIsReady() ? 'ready' : 'loading',
  );

  // Whether the boot readout has begun its GLIDE from the loader-centre stack down to the
  // bottom HUD slot. data-glide='false' LIFTS it into the loader (above the dot+name) via a
  // CSS transform; flipping it true removes the lift so the transform transition glides it
  // down (the transition lives on the [data-glide='true'] target state, so the readout just
  // APPEARS lifted on mount and only the downward travel animates). We DON'T flip it straight
  // on scene:ready (the loader's fade trigger) because that instant is the scene's heaviest
  // frame — shader compile + ~40 MB of buffer uploads jank the main thread, and a CSS
  // transition started mid-jank is wall-clock driven, so it "completes" unseen during the
  // block and the travel SNAPS. The effect below flips it a short beat after READY (past the
  // jank) and only AFTER the dot+name have already faded out (their own early 0→0.3s window in
  // scene.css), so the readout starts travelling into a stack the dot+name have already left —
  // the sequence reads dot+name fade → glide → bg fade. The dark background still holds solid
  // across the whole travel and fades only at glide end (--boot-glide-start + --boot-glide-dur).
  // If the scene was already ready before this island hydrated (no loader to glide out of),
  // start already-glided so the readout just appears in its bottom slot rather than flying
  // down over the live scene. Idempotent.
  const [gliding, setGliding] = useState(() => sceneIsReady());

  // The boot readout element. Held so the glide effect can promote it to its OWN
  // compositor layer (will-change: transform) BEFORE the travel starts — so the
  // transform animates on the GPU/compositor thread, immune to the main-thread jank
  // of the scene's first paint — then drop the hint once the glide has finished so
  // we don't keep a wasted layer alive for the rest of the page.
  const bootReadoutRef = useRef<HTMLDivElement>(null);

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

  // LOADING → READY: advance off the scene's first composited frame. We listen for the
  // SAME scene:ready event the loader script keys its fade to (so the boot readout swaps
  // to READY STATE in lockstep with the loader dissolving), and we also check the body
  // class up front in case the event already fired before this effect attached. A short
  // interval backstop catches the narrow race where scene:ready fires in the gap BETWEEN
  // that up-front check and addEventListener (the `once` listener would miss it, leaving
  // the readout stuck on LOADING): it polls the reliable body.scene-ready class so the text
  // always advances even on a missed event. Only meaningful while still 'loading'; later
  // phases ignore it.
  useEffect(() => {
    if (bootPhase !== 'loading') return;
    if (sceneIsReady()) {
      setBootPhase('ready');
      return;
    }
    const advance = (): void => setBootPhase((prev) => (prev === 'loading' ? 'ready' : prev));
    window.addEventListener(SCENE_READY_EVENT, advance, { once: true });
    const poll = window.setInterval(() => {
      if (sceneIsReady()) {
        advance();
        window.clearInterval(poll);
      }
    }, 100);
    return () => {
      window.removeEventListener(SCENE_READY_EVENT, advance);
      window.clearInterval(poll);
    };
  }, [bootPhase]);

  // START THE GLIDE a short beat after READY, but commit the flip ON A CLEAN COMPOSITOR FRAME
  // so the travel never starts mid-jank. The scene's first paint (shader compile + ~40 MB of
  // buffer uploads) blocks the main thread; a transform transition started during that block is
  // wall-clock driven, so it "completes" unseen during the block and the travel SNAPS. Even a
  // bare setTimeout isn't enough — its callback can fire the instant the main thread unblocks,
  // still inside/adjacent to the jank frame. So we (1) promote the readout to its OWN compositor
  // layer up front (will-change: transform) so the eventual transform runs on the GPU thread,
  // then (2) wait GLIDE_START_MS (keeps the flip in its own commit, well before the cue swap —
  // see GLIDE_START_MS), then (3) defer the actual data-glide flip across a DOUBLE rAF: the
  // first rAF runs after the heavy frame yields, the second lands on a genuinely clean frame
  // where the compositor can pick up the transition start. The result animates on the
  // compositor, past the jank. Under reduced motion we flip immediately (the CSS drops the
  // transition there, so there's no travel to defer — the readout just sits at the bottom while
  // the loader fades). Idempotent; fully torn down on cleanup.
  useEffect(() => {
    if (gliding) return;
    if (bootPhase === 'loading') return; // still loading: stay lifted in the loader
    if (reduced) {
      setGliding(true);
      return;
    }
    // Promote the layer BEFORE the travel so the compositor already owns it when the glide
    // starts (asking for the layer at the same instant the transform changes can miss the
    // first frame). The post-glide cleanup drops it again.
    if (bootReadoutRef.current) bootReadoutRef.current.style.willChange = 'transform';

    let innerRaf = 0;
    const timer = window.setTimeout(() => {
      // Double rAF: start the transition on a frame AFTER the jank has cleared.
      const outerRaf = requestAnimationFrame(() => {
        innerRaf = requestAnimationFrame(() => setGliding(true));
      });
      innerRaf = outerRaf;
    }, GLIDE_START_MS);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(innerRaf);
    };
  }, [bootPhase, gliding, reduced]);

  // Drop the compositor-layer hint once the glide has finished (will-change kept alive for the
  // rest of the page would waste a layer). transitionend on `transform` fires when the travel
  // lands; a timeout backstops it (transitionend can be missed if the element is interrupted).
  // Only meaningful once gliding under non-reduced motion (the only path that promoted a layer).
  useEffect(() => {
    if (!gliding || reduced) return;
    const el = bootReadoutRef.current;
    if (!el) return;
    const clear = (): void => {
      el.style.willChange = '';
    };
    const onEnd = (event: TransitionEvent): void => {
      if (event.propertyName === 'transform') clear();
    };
    el.addEventListener('transitionend', onEnd);
    // Backstop slightly past the glide duration (--boot-glide-dur is 0.7s) in case the
    // transitionend never lands (e.g. the element unmounts to 'live' first, or the value was
    // already at rest so no transition ran).
    const backstop = window.setTimeout(clear, 1000);
    return () => {
      el.removeEventListener('transitionend', onEnd);
      window.clearTimeout(backstop);
    };
  }, [gliding, reduced]);

  // READY → CUE: hold READY STATE briefly as a "systems online" confirmation, then
  // swap in the standing scroll cue. Under reduced motion we skip the timed beat and
  // settle straight onto the cue (no flashed READY STATE), mirroring how the loader's
  // pulse is dropped under reduced motion — the intro stays calm, not staged.
  useEffect(() => {
    if (bootPhase !== 'ready') return;
    if (reduced) {
      setBootPhase('cue');
      return;
    }
    const id = window.setTimeout(() => {
      setBootPhase((prev) => (prev === 'ready' ? 'cue' : prev));
    }, READY_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [bootPhase, reduced]);

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
  // Idle = nothing to aim at AND no rail hover. The compass then shows its idle copy
  // and the needle is hidden/centred (CSS off the data-idle attribute).
  const idle = copy === null;
  // Whether the ┼ is actively aiming at a real marker (gold) vs. idle (dim).
  const aiming = nearestPlacement !== null;
  // Idle copy split: at/near a settled beat the instrument is merely SCANNING
  // ("SEEKING SIGNAL"); in a transition band between beats there is no settled
  // marker to find AND we are past the opening hold, so the cue is to scroll back
  // onto a beat ("SCROLL BACK TO THE POINT").
  const phase = sceneForProgress(progress).phase;
  const atTop = progress <= SCROLL_HINT_DISMISS_AT;
  const recovery = idle && phase === 'transition' && !atTop;

  // CUE → LIVE: the standing scroll cue dismisses on the FIRST real scroll. It
  // reuses the existing scroll-hint dismiss seam — once progress passes
  // SCROLL_HINT_DISMISS_AT (the opening hold is over, !atTop), the boot readout
  // hands the slot to the live aiming compass, which already owns the scene-named
  // scroll readouts from here on. One-way: the slot never reverts to the cue.
  useEffect(() => {
    if (bootPhase === 'live') return;
    // Only the standing cue is dismissable by scroll; while still loading/ready the
    // visitor scrolling early should not skip the boot beats — but if the scene is
    // already ready (cue is imminent) and they've scrolled, go live regardless.
    if (!atTop && (bootPhase === 'cue' || sceneIsReady())) {
      setBootPhase('live');
    }
  }, [atTop, bootPhase]);

  // The boot readout owns the bottom-centre slot until 'live'. While it does, the
  // live compass is suppressed (data-booting) so the two never both occupy the slot.
  const booting = bootPhase !== 'live';

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
          hovered it falls IDLE (a dim scan placeholder, the ┼ parked & faded).
          aria-hidden because the rail buttons + markers already announce their own
          labels (the old mobile readout had the same rationale — this replaces it,
          now visible on desktop too). The markup is always rendered (its frame
          never pops in/out); data-idle swaps the copy + fades the ┼.

          IMPORTANT: rendered as a SIBLING of .hud-system, not a child. .hud-system
          carries a transform (translate(...,-50%) for vertical centring), and a CSS
          transform on an ancestor makes position:fixed resolve against that ancestor
          instead of the viewport — which trapped the compass mid-rail. As a sibling
          its position:fixed bottom-centre resolves against the viewport correctly. */}
      {/* The boot readout — the SAME bottom-centre slot + visual language as the
          live compass below, owning it through the LOADING → READY → cue intro and
          then handing it over on first scroll (bootPhase reaches 'live'). It reuses
          the .hud-compass* classes so the slot is one continuous element morphing,
          not a crossfade between two instruments. data-boot keeps it visible while
          body:not(.scene-ready) (where the live compass is gated dark), and the live
          compass's data-booting (set from the same `booting` flag) keeps IT dark
          until the hand-off so the two never both occupy the slot. aria-hidden: the
          loader + manifesto already own the announced copy — this is decoration.

          Phases:
            loading → LOADING STATE (engine chunk still downloading / compiling)
            ready   → READY STATE (scene:ready fired; held ~0.6s)
            cue     → REVERSE COLLAPSE / scroll down (the standing intro tagline;
                      FIXED — it does not change as the user scrolls). */}
      {booting && (
        <div
          ref={bootReadoutRef}
          className="hud-compass hud-compass--boot"
          data-boot={bootPhase}
          data-glide={gliding}
          data-reduced={reduced}
          aria-hidden="true"
        >
          {bootPhase === 'cue' ? (
            <>
              <p className="hud-compass-read">
                <span className="hud-compass-prompt">[ </span>
                <span className="hud-compass-label">REVERSE COLLAPSE</span>
                <span className="hud-compass-prompt"> ]</span>
              </p>
              <p className="hud-compass-dest">
                <span className="hud-compass-arrow">↓</span>
                <span>scroll down</span>
              </p>
            </>
          ) : (
            <>
              <p className="hud-compass-read hud-compass-read--idle">
                <span className="hud-compass-prompt">[ </span>
                <span className="hud-compass-label">
                  {bootPhase === 'ready' ? 'READY STATE' : 'LOADING STATE'}
                </span>
                <span className="hud-compass-prompt"> ]</span>
              </p>
              {/* Height-reserving twin of the destination line (same trick the live
                  idle branch uses) so the slot is the SAME height across LOADING /
                  READY / cue and the readout never shifts vertically on swap. */}
              <p className="hud-compass-dest hud-compass-dest--spacer" aria-hidden="true">
                &nbsp;
              </p>
            </>
          )}
        </div>
      )}

      <div
        className="hud-compass"
        data-visible={visible}
        data-aiming={aiming}
        data-locked={locked}
        data-idle={idle}
        data-recovery={recovery}
        data-reduced={reduced}
        data-booting={booting}
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
              <span className="hud-compass-label">{recovery ? 'SCROLL BACK TO THE POINT' : 'SEEKING SIGNAL'}</span>
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
