// YellowStarRing — ITEM 4's one designed detail: a faint orbital / measurement ring
// + a few tick marks + a short caliper arc, centred on the viewport, that fades in
// ONLY during the yellow-star hold. The yellow star sits centred at the world origin
// during its hold (YELLOW_HOLD_POS aims at 0,0,0), so a viewport-centred SVG ring sits
// concentric with the photosphere. It is barely visible (low opacity) and reads as a
// designed chapter annotation, NOT sci-fi clutter — a single thin ring, a handful of
// ticks, and one caliper arc. Pure DOM/SVG (no canvas cost); pointer-events:none.
import { fadeInOut } from '../scroll';
import { lifecycleProgress } from '../timeline';
import { useSceneState } from './SceneStateContext';

// The yellow-star hold band (lifecycle space). The headline now sits in 0.58-0.61 (the
// holds shifted +0.08 when the nebula collapse span widened — same LOOK, later scroll); we
// fade the ring in slightly before the hold settles and out as the red-giant grow begins, so
// it only annotates the still yellow beat. Mirrors the yellow beat's text band feel. All four
// shift +0.08 in lockstep with STAR_IGNITION_START/YELLOW_SETTLE_END/YELLOW_HOLD_END.
const RING_IN_START = 0.54;
const RING_IN_END = 0.58;
const RING_OUT_START = 0.605;
const RING_OUT_END = 0.64;

export default function YellowStarRing() {
  const { progress, reduced, sceneId } = useSceneState();
  // Only the yellow scene ever shows it; cheap early-out everywhere else.
  if (sceneId !== 'yellow') return null;
  const lifecycleP = lifecycleProgress(progress);
  // Reduced motion: show it steadily across the hold (no fade choreography).
  const opacity = reduced
    ? 1
    : fadeInOut(lifecycleP, RING_IN_START, RING_IN_END, RING_OUT_START, RING_OUT_END);
  if (opacity <= 0.02) return null;

  return (
    <div className="yellow-ring" aria-hidden="true" style={{ opacity }}>
      {/* viewBox is a square centred on 0; the ring radius (78) crosses the disc as a
          designed measurement annotation (the photosphere fills the frame at the yellow
          hold, so a clean outside-halo isn't possible — the ring instead reads as an
          instrument graticule over the star). The cardinal ticks sit just outside it. A
          dark drop-shadow (CSS) keeps the thin gold strokes legible on the bright disc. */}
      <svg className="yellow-ring-svg" viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid meet">
        {/* the orbital ring itself — one thin, faint circle */}
        <circle className="yellow-ring-orbit" cx="0" cy="0" r="78" />
        {/* four cardinal tick marks (measurement caliper feel) just outside the ring */}
        <line className="yellow-ring-tick" x1="0" y1="-78" x2="0" y2="-86" />
        <line className="yellow-ring-tick" x1="0" y1="78" x2="0" y2="86" />
        <line className="yellow-ring-tick" x1="-78" y1="0" x2="-86" y2="0" />
        <line className="yellow-ring-tick" x1="78" y1="0" x2="86" y2="0" />
        {/* one short caliper arc on the upper-right, a touch stronger, so the ring
            reads as a designed annotation rather than a plain circle */}
        <path className="yellow-ring-arc" d="M 55.15 -55.15 A 78 78 0 0 1 78 0" fill="none" />
      </svg>
    </div>
  );
}
