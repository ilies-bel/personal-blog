import { type CSSProperties, useEffect, useRef, useState } from 'react';
import {
  HUD_NAV_ITEMS,
  MARKER_PLACEMENTS,
  formatLifecycleTime,
  legacyStageForProgressFromTable,
  lifecycleTimeGyr,
  sceneForProgress,
  settledIdForStage,
  stationForStage,
  type HudNavItem,
  type HudTargetId,
  type MarkerPlacement,
} from './sceneTable';
import type { MarkerFrame } from './scene/types';
import { hudIdForStage, lifecycleProgress, progressForLegacyStage } from './timeline';
import {
  SCROLL_HINT_DISMISS_AT,
  SCENE_READY_BODY_CLASS,
} from './lib/constants';

// The HUD nav rows, on-screen markers, the settled-window gate and their shared
// types now live in sceneTable.ts (the pure data layer); the scroll-spy
// `hudIdForStage` now lives in timeline.ts (the choreography facade, alongside
// resolve()). They are re-exported here so the existing import paths
// ('../HudNavigation') resolve UNCHANGED. The duplicated literals, the
// byte-identical settled-window body, and the former local hudIdForStage copy
// that used to sit here are gone (the table + the facade are the single sources).
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
  /** Deploy base path (e.g. `/` or `/personal-blog/`). Retained on the props for
   *  caller compatibility (ExplorationHud still passes it); the rail no longer uses
   *  it now that the rows render bare numbers instead of base-resolved mask glyphs. */
  base?: string;
  /** The scene's per-frame marker frame (stage/visible + projected x/y for the
   *  anchored marker), owned by HeroIsland. The compass reads it to find the
   *  on-screen marker nearest the cursor and aim its needle at it. */
  markerFrameRef: React.RefObject<MarkerFrame | null>;
}

/**
 * Travel to a lifecycle stage: map the stage to its scroll progress and scroll the
 * page there. Honours reduced-motion (jumps instead of smooth-scrolling). Used by
 * the HUD rail so clicking a glyph flies the visitor to that star rather than
 * navigating away to a page. RETURNS the target raw scroll-Y (px) it scrolled to,
 * so the caller can poll window.scrollY against it to detect when the smooth-scroll
 * has settled (and clear the click-lock highlight).
 */
function scrollToStage(stage: number, reduced: boolean): number {
  // progressForLegacyStage returns LIFECYCLE-space progress (the inverse of the
  // progress->stage table). The page maps RAW scroll -> stage by first running raw
  // scroll through lifecycleProgress() (the LIFECYCLE_DIRECTION seam, = 1 - p under
  // 'reverse'). So to scroll to a stage we must undo that flip: convert lifecycle
  // progress back to raw scroll progress via lifecycleProgress() (its own inverse).
  const raw = lifecycleProgress(progressForLegacyStage(stage));
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const top = raw * max;
  window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
  return top;
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

/** A rail-hovered scene names by its HUD row — destination-first, the same
 *  flip every nav surface applies (the marker copy is already destination-
 *  titled, e.g. 'PROJECTS' / 'Things I build', so this matches it). */
function copyForHudId(id: HudTargetId): CompassCopy {
  const item = HUD_NAV_BY_ID[id];
  return { label: item.destination, dest: item.label };
}

/** The current aiming result, committed to React state only when it changes.
 *  `markerId` is the nearest placement id (null when no markers are in range),
 *  driving the named copy; `idle` is true when there is nothing to aim at and
 *  no rail hover, swapping the readout to the idle scan placeholder. */
interface AimState {
  markerId: string | null;
  idle: boolean;
}

// --- Click-travel highlight lock tuning ------------------------------------
// How close (px) window.scrollY must be to the target top — and how little it may
// move between frames — to count as "settled" on the destination. A few px of
// slack absorbs sub-pixel rounding and the smooth-scroll's easing tail.
const TRAVEL_SETTLE_EPSILON_PX = 3;
// Hard fallback (ms): the click-lock ALWAYS releases by now even if the scroll never
// lands exactly on target. Comfortably longer than the browser's smooth-scroll.
const TRAVEL_LOCK_TIMEOUT_MS = 1500;

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

  // PROGRESSIVE DISCOVERY (while the HUD is still OFF — the quiet icon rail before
  // the black-hole power-on). A rail row's number is hidden until its scene first
  // becomes the current (scroll-spy) one; once revealed it STAYS revealed for the
  // session — the Set only ever grows (monotonic, never reverts on scroll-up). Since
  // the lifecycle is scrolled in one order, the rail fills top→bottom. Seeded with
  // the initial currentId so a row that is already current at mount counts as
  // discovered. The slot/height is always reserved in CSS (the connector-line mask
  // assumes 5 fixed row positions); only the number's OPACITY is gated, so the rail
  // never reflows. Once body.hud-active, the powered-on menu shows ALL rows (the CSS
  // forces every number visible under hud-active), so this gating only matters while OFF.
  const [discovered, setDiscovered] = useState<Set<HudTargetId>>(() =>
    currentId ? new Set<HudTargetId>([currentId]) : new Set<HudTargetId>(),
  );
  useEffect(() => {
    if (currentId === null) return;
    setDiscovered((prev) => {
      if (prev.has(currentId)) return prev; // already discovered — no state churn
      const next = new Set(prev);
      next.add(currentId);
      return next;
    });
  }, [currentId]);

  // CLICK-TRAVEL HIGHLIGHT LOCK. Clicking a rail row fires a multi-second SMOOTH
  // scroll; during that travel the scroll-spy currentId sweeps through every
  // intervening scene, which would strobe the gold data-current glow across all the
  // rows between start and target. So on click we PIN the displayed-current row to
  // the clicked one (travelId) and ignore the scroll-spy sweep until the smooth
  // scroll lands on the target, then clear travelId so normal scroll-spy resumes.
  // null = not travelling (scroll-spy drives the highlight as usual).
  const [travelId, setTravelId] = useState<HudTargetId | null>(null);

  // Teardown handles for the in-flight settle-watcher (rAF + hard-timeout fallback)
  // and the manual-scroll listeners that yield the lock to real user input. Held in
  // a ref so a fresh click (or unmount) can cancel the previous watcher cleanly —
  // no overlapping watchers, no leaked rAF/timeout/listeners.
  const travelWatchRef = useRef<(() => void) | null>(null);

  // Cancel any in-flight settle-watcher on unmount so no rAF/timeout/listener leaks
  // past the component's life.
  useEffect(() => {
    return () => {
      travelWatchRef.current?.();
      travelWatchRef.current = null;
    };
  }, []);

  // Begin a click-travel: pin the highlight to `id`, scroll there, and watch for the
  // smooth-scroll to SETTLE (then release the lock). Robust settle detection: poll
  // window.scrollY each frame and clear once it is within a few px of the target top
  // AND has stopped changing for ~2 consecutive frames. A hard-timeout fallback
  // (TRAVEL_LOCK_TIMEOUT_MS) always clears the lock even if the scroll math is a hair
  // off or the page can't reach the exact top. Manual user scroll (wheel/touch/
  // keydown) during travel clears the lock immediately so grabbing the scrollbar mid
  // travel isn't left with a stale pin. Any prior watcher is torn down first.
  function beginTravel(id: HudTargetId, stage: number): void {
    // Tear down a previous in-flight watcher before starting a new one.
    travelWatchRef.current?.();
    travelWatchRef.current = null;

    // Pin the highlight to the clicked row immediately, and reveal its number at once
    // (a click-to-travel discovers the destination even before the spy reaches it).
    setTravelId(id);
    setDiscovered((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    const targetTop = scrollToStage(stage, reduced);

    let rafId = 0;
    let timeoutId = 0;
    let stableFrames = 0;
    let lastY = window.scrollY;
    let done = false;

    const release = (): void => {
      if (done) return;
      done = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (timeoutId) window.clearTimeout(timeoutId);
      window.removeEventListener('wheel', onUserScroll);
      window.removeEventListener('touchmove', onUserScroll);
      window.removeEventListener('keydown', onUserScroll);
      travelWatchRef.current = null;
      setTravelId(null);
    };

    // Real user input mid-travel yields the lock at once (don't fight the user).
    function onUserScroll(): void {
      release();
    }
    window.addEventListener('wheel', onUserScroll, { passive: true });
    window.addEventListener('touchmove', onUserScroll, { passive: true });
    window.addEventListener('keydown', onUserScroll);

    function poll(): void {
      const y = window.scrollY;
      const atTarget = Math.abs(y - targetTop) <= TRAVEL_SETTLE_EPSILON_PX;
      const stillNow = Math.abs(y - lastY) <= TRAVEL_SETTLE_EPSILON_PX;
      lastY = y;
      // Settled = parked on (≈)the target AND not moving for ~2 frames running.
      stableFrames = atTarget && stillNow ? stableFrames + 1 : 0;
      if (stableFrames >= 2) {
        release();
        return;
      }
      rafId = requestAnimationFrame(poll);
    }
    rafId = requestAnimationFrame(poll);

    // Hard fallback so the lock ALWAYS clears even if the target/scroll math is a hair
    // off (or under reduced motion where the jump is instant but the poll's 2-frame
    // settle still needs a tick). Generous enough for the longest smooth-scroll.
    timeoutId = window.setTimeout(release, TRAVEL_LOCK_TIMEOUT_MS);

    travelWatchRef.current = release;
  }

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

  // Live cursor position tracked via a ref (NOT state) so the rAF loop can find
  // the nearest marker each frame without re-rendering — mirrors StarMarker.pointerRef.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onMove = (event: MouseEvent): void => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    document.addEventListener('mousemove', onMove, { passive: true });
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  // LOADING → READY: advance off the loader's REVEAL, i.e. the body.scene-ready CLASS —
  // NOT the raw scene:ready event. The two are different instants: the event fires on the
  // scene's first composited frame, but the loader script adds the class at
  // max(scene:ready, LOADER_MIN_MS) — on a fast first load the class lands seconds AFTER
  // the event. The glide effect below is armed by this phase change, and the loader's
  // dot+name fade is keyed to the CLASS (scene.css), so advancing on the raw event sent
  // the readout gliding straight THROUGH the still-visible wordmark (its dark scrim
  // blacking the name out mid-travel). Polling the class keeps the whole dissolve — mark
  // fade → glide → background fade — sequenced against the loader's actual reveal. The
  // ≤80ms poll granularity is invisible during a loading screen. Only meaningful while
  // still 'loading'; later phases ignore it.
  useEffect(() => {
    if (bootPhase !== 'loading') return;
    if (sceneIsReady()) {
      setBootPhase('ready');
      return;
    }
    const poll = window.setInterval(() => {
      if (sceneIsReady()) {
        setBootPhase((prev) => (prev === 'loading' ? 'ready' : prev));
        window.clearInterval(poll);
      }
    }, 80);
    return () => {
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

      // Candidate markers: those whose beat is on screen RIGHT NOW (frame.beatId —
      // the same gate StarMarker uses for its own visibility/interactivity).
      let nearest: MarkerPlacement | null = null;
      if (frame && frame.visible && cursor) {
        const settled = frame.beatId;
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
          }
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
  // FINALE: deep inside the closing dot hold (raw scroll ≥ 96%) the journey is
  // over — "SCROLL TO EXPLORE" would point at nothing. The idle readout flips to
  // an arrival: the beat's name, plus the one true fact about scrolling back up
  // (going up from the bottom plays the stellar lifecycle in its natural order).
  const atEnd = progress >= 0.96;

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

  // The DISPLAYED current row: the click-travel target while a click-travel is in
  // flight (travelId), else the live scroll-spy currentId. Only the highlight readout
  // is overridden — discovery + the currentId prop stay keyed off the real spy value.
  // travelId (click-travel destination) pins the highlight during a click-fly;
  // otherwise the live scroll-spy currentId drives it directly. currentId is the
  // clean sceneForProgress resolver, so exactly one row is current at any settled
  // position — the highlight tracks the scene with no lag and never sticks on the
  // previous row.
  const effectiveCurrentId = travelId ?? currentId;

  // Deepest DISCOVERED render-order index (1-based).  HUD_NAV_ITEMS is in
  // top→bottom order, so array index + 1 is the row number.  We iterate all
  // items using the same isDiscovered predicate applied per-row in the map
  // below (isCurrent || discovered.has(item.id)) and take the maximum — NOT
  // the Set size, so non-contiguous discovery (e.g. only rows 1 and 3) is
  // handled correctly.  Clamped to ≥ 1 because the current row is always
  // discovered, ensuring the line never collapses entirely.
  const revealed = Math.max(
    1,
    HUD_NAV_ITEMS.reduce((max, item, i) => {
      const itemDiscovered =
        effectiveCurrentId === item.id || discovered.has(item.id);
      return itemDiscovered ? i + 1 : max;
    }, 0),
  );

  // MOBILE scene-name readout copy. On the desktop the always-on bottom .hud-compass
  // names the current scene; on mobile that compass is display:none (hud.css compact-HUD
  // block) and the horizontal number rail's per-button labels only reveal on hover —
  // which never fires on touch. So a phone visitor would otherwise see bare digits
  // (1 2 3 4 5) with no idea what they are. This resolves the SAME scene the highlight
  // tracks (effectiveCurrentId = the click-travel target while a travel is in flight,
  // else the live scroll-spy currentId) so the readout follows both scroll and taps.
  // currentId can be null at the very top of the scroll before the spy resolves, so
  // guard the lookup and render the readout only once there is a scene to name.
  const mobileReadout = effectiveCurrentId ? HUD_NAV_BY_ID[effectiveCurrentId] : null;

  // INSTRUMENT FRAME — sitewide on the hero (the black-hole section mock was
  // approved). Four hairline corner ticks framing the viewport + a live readout
  // bottom-left: the star's AGE on the lifecycle clock (billions of years —
  // falling as you scroll, since the story plays in reverse) and the nearest
  // station. CSS shows it only while the HUD is armed (body.hud-active) and
  // hides it on compact layouts. (`frameStage` still drives the station lookup
  // and the age readout; it is no longer surfaced as a raw STAGE number.)
  const frameStage = legacyStageForProgressFromTable(progress);
  const frameStation = stationForStage(frameStage);
  const frameTime = formatLifecycleTime(lifecycleTimeGyr(frameStage));

  // ---- HALF-CIRCLE TICK GAUGE (fixed-lubber heading card) -------------------
  // The lateral map as a true compass card: the ARROW IS FIXED on the horizontal
  // centreline (the lubber line) and the tick QUADRANT rotates under it with
  // scroll — the instrument answers "you are here" the way a heading indicator
  // does, instead of sliding a caret along a static scale. Minimalist face: no
  // arc stroke, no box — ticks only, fading with angular distance from the
  // lubber line so the card emerges ahead and dissolves behind. Geometry is in
  // fixed SVG units (1 unit = 1px at the 190×600 box) so the HTML hit-area
  // buttons and the label share coordinates. The old vertical rail markup stays
  // for the compact (≤60rem) layout; CSS swaps which one renders per breakpoint.
  const ARC_R = 300;
  const ARC_SWEEP = 55; // degrees each side of the horizontal centreline
  // QUANTIZED to 2 decimals (fx): SSR (Node) and the browser disagree on trig
  // results in the last ulps, and React flags every such coordinate as a
  // hydration mismatch. Two decimals of an SVG unit are far below visual
  // precision and identical on both sides. ARC_CX is quantized too — it rides
  // into every transform string.
  const fx = (v: number): number => Number(v.toFixed(2));
  const ARC_CX = fx(-(ARC_R * Math.cos((ARC_SWEEP * Math.PI) / 180)) + 12);
  const thetaOf = (p: number): number => (p * 2 - 1) * ARC_SWEEP; // p 0 (top) → 1 (bottom)
  const arcAt = (deg: number, radius: number) => ({
    x: fx(ARC_CX + radius * Math.cos((deg * Math.PI) / 180)),
    y: fx(radius * Math.sin((deg * Math.PI) / 180)),
  });
  // The card's rotation: bring the CURRENT progress angle onto the lubber line.
  const caretDeg = fx(thetaOf(Math.min(1, Math.max(0, progress))));
  // Angular fade around the lubber line — full presence within ~10°, gone past
  // ~65°. Ticks are static geometry inside the rotating group; only this opacity
  // (and the group rotation) changes per frame.
  const arcFade = (deg: number): number => {
    const d = Math.abs(deg - caretDeg);
    return fx(Math.pow(Math.max(0, Math.min(1, 1.18 - d / 55)), 1.6));
  };
  const ARC_MINOR_TICKS = 44;
  // Station angles in RAW scroll space — the same stage→scroll conversion the
  // click-travel uses (progressForLegacyStage is lifecycle-space; the direction
  // seam flips it to raw).
  const arcStations = HUD_NAV_ITEMS.map((item, i) => ({
    item,
    number: i + 1,
    theta: fx(thetaOf(lifecycleProgress(progressForLegacyStage(item.stage)))),
  }));
  // The label sits FIXED beside the lubber line (the current station is always
  // there) and names the pointed station (hover/focus), else the current one.
  const arcShownItem = (pointedId && HUD_NAV_BY_ID[pointedId]) ||
    (effectiveCurrentId ? HUD_NAV_BY_ID[effectiveCurrentId] : null);
  const ARC_LABEL_X = fx(ARC_CX + ARC_R + 16);

  return (
    <>
    {/* Sibling of .hud-system, NOT a child (the rail hides itself at the opening
        frame, and .hud-system's transform would trap position:fixed). Gated by
        body.hud-active in CSS. */}
    <div className="hud-frame" aria-hidden="true">
      <span className="hud-frame-tick" data-corner="tl" />
      <span className="hud-frame-tick" data-corner="tr" />
      <span className="hud-frame-tick" data-corner="bl" />
      <span className="hud-frame-tick" data-corner="br" />
      <span className="hud-frame-readout">
        <span className="hud-frame-readout-stage">{frameTime}</span>
        <span className="hud-frame-readout-station">{frameStation.label}</span>
      </span>
    </div>
    {/* The arc gauge — also a sibling (position:fixed vs .hud-system's transform).
        Mirrors the rail's data-visible gating; buttons drive the SAME beginTravel
        click-jump + pointedId aiming the rail rows used. */}
    <div className="hud-arc" data-visible={visible} aria-hidden={!visible}>
      <svg className="hud-arc-svg" viewBox="0 -300 190 600" width="190" height="600" aria-hidden="true">
        {/* THE CARD — everything inside rotates so the current progress angle
            sits on the fixed lubber line (theta 0, screen-horizontal). */}
        <g className="hud-arc-rot" transform={`rotate(${-caretDeg} ${ARC_CX} 0)`}>
          {Array.from({ length: ARC_MINOR_TICKS + 1 }, (_, k) => {
            const deg = fx(thetaOf(k / ARC_MINOR_TICKS));
            const a = arcAt(deg, ARC_R - 7);
            const b = arcAt(deg, ARC_R - 2);
            return (
              <line
                key={k}
                className="hud-arc-tick"
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                opacity={arcFade(deg)}
              />
            );
          })}
          {arcStations.map(({ item, number, theta }) => {
            const a = arcAt(theta, ARC_R - 16);
            const b = arcAt(theta, ARC_R - 2);
            const n = arcAt(theta, ARC_R - 30);
            return (
              <g
                key={item.id}
                className="hud-arc-station"
                data-current={effectiveCurrentId === item.id}
                opacity={arcFade(theta)}
              >
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                {/* Digits are set along their own radius (local rotate = own
                    theta), so the station AT the lubber line always reads
                    upright — compass-card behaviour, not a tilted sticker. */}
                <text
                  transform={`translate(${n.x} ${n.y}) rotate(${theta})`}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {String(number).padStart(2, '0')}
                </text>
              </g>
            );
          })}
        </g>
        {/* FIXED lubber line + arrow — the "you are here" datum the card turns
            under. Never moves. The chevron sits INSIDE the station numbers'
            radius (R−30) so the current station's digits park between arrow and
            hairline instead of underneath the arrow. */}
        <g className="hud-arc-lubber">
          <line x1={fx(ARC_CX + ARC_R - 18)} y1={0} x2={fx(ARC_CX + ARC_R + 4)} y2={0} />
          <path
            d={`M ${fx(ARC_CX + ARC_R - 50)} -4.5 L ${fx(ARC_CX + ARC_R - 41)} 0 L ${fx(ARC_CX + ARC_R - 50)} 4.5`}
          />
        </g>
      </svg>
      {arcStations.map(({ item, theta }) => {
        // Hit areas live in SCREEN space, so counter-derive each station's screen
        // angle under the current rotation. Past ~52° the point's x goes negative
        // (off the left screen edge — cos(52°)·(R−9) barely clears ARC_CX), so a
        // station rotated beyond that is hidden rather than left as an invisible
        // or unclickable zone floating in the void.
        const rel = fx(theta - caretDeg);
        const pt = arcAt(rel, ARC_R - 9);
        const reachable = Math.abs(rel) <= 52;
        return (
          <button
            key={item.id}
            type="button"
            className="hud-arc-btn"
            style={{
              left: `${pt.x}px`,
              top: `${fx(300 + pt.y)}px`,
              visibility: reachable ? undefined : 'hidden',
            }}
            aria-label={`Travel to ${item.label}`}
            aria-current={effectiveCurrentId === item.id ? 'location' : undefined}
            tabIndex={visible && reachable ? 0 : -1}
            onClick={() => beginTravel(item.id, item.stage)}
            onMouseEnter={() => setPointedId(item.id)}
            onMouseLeave={() => setPointedId((prev) => (prev === item.id ? null : prev))}
            onFocus={() => setPointedId(item.id)}
            onBlur={() => setPointedId((prev) => (prev === item.id ? null : prev))}
          />
        );
      })}
      {arcShownItem && (
        <span
          className="hud-arc-label"
          style={{ left: `${ARC_LABEL_X}px`, top: '300px' }}
        >
          <span className="hud-arc-label-title">{arcShownItem.label}</span>
          <span className="hud-arc-label-dest">{arcShownItem.destination}</span>
        </span>
      )}
    </div>
    <div className="hud-system" data-visible={visible}>
      {/* MOBILE-ONLY scene-name readout — replaces the desktop bottom .hud-compass on
          the compact phone layout. It is the FIRST child of .hud-system (a display:grid
          column that stacks top→bottom in DOM order) so it sits ABOVE the number rail's
          row. Wired to the long-dead .hud-nav-mobile-readout CSS (hud.css line 533
          default display:none → the 46rem block flips it to flex, mono, --text-micro,
          with span:first-child brighter) — so it is hidden on desktop and shown only on
          mobile by EXISTING CSS, no extra visibility logic. It lives inside .hud-system,
          so it inherits the rail's [data-visible] / body.at-opening gating for free. The
          two spans match the markup the CSS expects (scene name brighter, destination
          dimmer). aria-hidden: pure decorative duplication of the rail buttons' own
          labels (mirrors the .hud-compass aria-hidden rationale). */}
      {mobileReadout && (
        <div className="hud-nav-mobile-readout" aria-hidden="true">
          {/* Destination-first, same flip as the rail rows below. */}
          <span>{mobileReadout.destination}</span>
          <span>{mobileReadout.label}</span>
        </div>
      )}
      <nav
        className="hud-nav"
        aria-label="Explore portfolio stages"
        aria-hidden={!visible}
        style={{ '--rail-revealed': revealed } as CSSProperties}
      >
        <ol className="hud-nav-list">
          {HUD_NAV_ITEMS.map((item, i) => {
            // While a click-travel is in flight, the CLICKED row owns the highlight
            // (travelId); otherwise the scroll-spy currentId does. Overriding only the
            // DISPLAYED current row here keeps the highlight pinned to the destination
            // through the smooth-scroll, so the gold glow can't strobe through the
            // intermediate rows the spy sweeps past during travel. The currentId prop
            // and the discovery effect still key off the REAL scroll-spy value.
            const isCurrent = effectiveCurrentId === item.id;
            // SCROLL-ORDER number, top→bottom: HUD_NAV_ITEMS is already in render /
            // scroll order (black hole = row 1 at the top, the beginning = row 5 at
            // the bottom), so the array index + 1 IS the row's number. Deriving it here
            // keeps it correct if the order ever changes — never hardcode per-scene.
            const number = i + 1;
            // The CURRENT row is discovered by definition; otherwise check the
            // accumulating Set. Drives data-discovered, which the CSS reads to fade the
            // number in IN PLACE (the slot/height is always reserved). Under hud-active
            // the CSS forces every number visible regardless, so this only gates the OFF rail.
            //
            // ONE-WAY by construction (no opacity bounce): the moment a row first becomes
            // current, `isCurrent` is already true in THIS render (→ data-discovered='true'),
            // and the discovery effect adds its id to the Set on the same commit. The Set
            // only ever grows, so when the row LATER stops being current (`isCurrent` →
            // false) `discovered.has(item.id)` is already true — isDiscovered stays true.
            // data-discovered therefore flips false→true exactly once and never back, so the
            // CSS opacity transition runs a single time. With the scroll-spy now driven by
            // the SAME scene resolver as everything else (see scrollHudId in HeroIsland), the
            // currentId no longer churns through wrong rows, so nothing seeds the Set early /
            // out of order — the number reveals once and cannot blink.
            const isDiscovered = isCurrent || discovered.has(item.id);

            return (
              <li className="hud-nav-row" key={item.id}>
                {/* A HUD number TRAVELS to its lifecycle stage rather than navigating
                    away — clicking it smooth-scrolls the page to that star. So it is a
                    real <button>, not a link (keyboard-accessible, no page load). The
                    on-screen StarMarker still owns the page navigation via item.href. */}
                <button
                  type="button"
                  className="hud-nav-button"
                  data-motion={item.motion}
                  data-current={isCurrent}
                  data-discovered={isDiscovered}
                  aria-label={`Travel to ${item.label}`}
                  tabIndex={visible ? 0 : -1}
                  aria-current={isCurrent ? 'location' : undefined}
                  onClick={() => beginTravel(item.id, item.stage)}
                  // Feed the ASCII compass: hovering or focusing a row points at it.
                  onMouseEnter={() => setPointedId(item.id)}
                  onMouseLeave={() => setPointedId((prev) => (prev === item.id ? null : prev))}
                  onFocus={() => setPointedId(item.id)}
                  onBlur={() => setPointedId((prev) => (prev === item.id ? null : prev))}
                >
                  {/* Bare scroll-order NUMBER in the glyph column (replacing the masked
                      SVG glyph): same box/centering as the mask used so the connector-line
                      mask geometry + row pitch are UNCHANGED. currentColor inherits the
                      rail's faint→gold→current colour transitions exactly like the mask did. */}
                  <span className="hud-nav-glyph hud-nav-number" aria-hidden="true">
                    {number}
                  </span>
                  {/* Destination-first, matching every other nav surface (SiteNav):
                      the bright title answers "where does this go", the celestial
                      body is the dim caption. The rail keeps its physical scroll
                      ORDER (it is a scene instrument); only the pair is flipped. */}
                  <span className="hud-nav-copy">
                    <span className="hud-nav-title" data-decode>{item.destination}</span>
                    <span className="hud-nav-destination">{item.label}</span>
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
        {idle ? (
          atEnd ? (
            <>
              {/* FINALE readout — the arrival beat at the bottom of the journey. */}
              <p className="hud-compass-read hud-compass-read--idle">
                <span className="hud-compass-prompt">[ </span>
                <span className="hud-compass-label">THE BEGINNING</span>
                <span className="hud-compass-prompt"> ]</span>
              </p>
              <p className="hud-compass-dest">
                <span className="hud-compass-arrow">↑</span>
                <span>play it forward</span>
              </p>
            </>
          ) : (
          <>
            <p className="hud-compass-read hud-compass-read--idle">
              <span className="hud-compass-prompt">[ </span>
              <span className="hud-compass-label">{recovery ? 'JUMP TO WORK' : 'SCROLL TO EXPLORE'}</span>
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
          )
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
