// The cockpit canopy — the SVG line drawing the HUD power-on "unzooms" into.
// A fixed, full-viewport, pointer-events-none layer of hairline struts (front
// windshield, A-pillars, side windows, dashboard cowl, centre console, right
// instrument arc) sitting between the scene canvas (z 0) and the text overlay
// (z 10), so the spectacle reads as seen FROM a ship, not printed OVER one.
//
// LIGHT-SOURCE AWARENESS — the reason this is a component and not a static SVG:
// the same line set renders THREE times.
//   • base — a dim, flat pass so every strut stays faintly present (structure
//     is never invisible, matching the rest of the ghost/ambient chrome).
//   • lit  — a brighter pass masked by a wide radial gradient whose centre is
//     the STAR's projected screen position (markerFrameRef, written per frame
//     by the scene). Struts near the body catch its light; far corners fall
//     back to the base pass.
//   • hot  — a tight, near-white pass under a second, smaller gradient: the
//     specular kiss on edges closest to the photosphere.
// Each path carries a facing weight `w` (0..1): members whose faces point AT
// the world origin (the canopy's inner lip, the cowl's top edge) take the full
// lit pass; members edge-on to the light (outer edges, ceiling seams) only
// ever reach a fraction of it. Falloff (gradient) × facing (weight) is the
// whole lighting model — cheap enough to leave running.
//
// The per-frame work is TWO gradient centre updates, and only when the star
// has actually moved (>0.4px in viewBox space) — a parked scroll position
// costs zero paints. Colours ride the existing per-scene HUD tokens
// (--hud-main / --hud-line via data-scene on .bh-root) so the light warms to
// ember over the red giant and cools to signal-blue over the nebula without
// any JS colour code, and the bright-zone graphite flip works unchanged.
//
// Visibility/unzoom is pure CSS off the power FSM's body classes (hud-active /
// hud-booting / hud-shutting-down) — see hud.css → "COCKPIT CANOPY". This
// component never reads those classes.
import { useEffect, useRef } from 'react';
import type { MarkerFrame } from '../scene/types';
import { useSceneState } from './SceneStateContext';

interface CockpitFrameProps {
  /** The scene's per-frame marker frame (the star's projected screen x/y),
   *  owned by HeroIsland — the same ref the compass reads. */
  markerFrameRef: React.RefObject<MarkerFrame | null>;
}

// All geometry is authored in one fixed 1920×1080 design space and stretched
// to the viewport (preserveAspectRatio="none"); vector-effect:
// non-scaling-stroke keeps every hairline 1-device-px crisp under the
// non-uniform scale, so the drawing behaves like a cockpit moulded to the
// glass, not a letterboxed image.
const VB_W = 1920;
const VB_H = 1080;

/** One cockpit member: its path and its facing weight (how squarely its face
 *  points at the world origin — the multiplier on the lit/hot passes). */
interface CockpitPath {
  d: string;
  w: number;
}

// ─── The line set ───────────────────────────────────────────────────────────
// Hand-authored against the canopy reference: a hexagonal front windshield
// with cut top corners, inward-slanting A-pillars, triangular side windows,
// a swept dashboard cowl and a centre console plateau. Struts are drawn as
// PAIRS of parallel edges (outer + inner) so each member has believable
// thickness; the dark band between the canopy pair is filled separately.
const CANOPY_OUTER =
  'M 398 86 L 1522 86 L 1714 248 L 1516 742 Q 960 950 404 742 L 206 248 Z';
const CANOPY_INNER =
  'M 420 104 L 1500 104 L 1668 266 L 1482 714 Q 960 908 438 714 L 252 266 Z';

const PATHS: CockpitPath[] = [
  // Front windshield frame — outer edge (faces away from the star).
  { d: CANOPY_OUTER, w: 0.5 },
  // Front windshield frame — inner lip (faces the star head-on).
  { d: CANOPY_INNER, w: 1 },

  // Ceiling seams — the top-corner cuts continued up to the roof line.
  { d: 'M 398 86 L 340 0', w: 0.35 },
  { d: 'M 1522 86 L 1580 0', w: 0.35 },

  // Left side window: top rake to the screen edge + lower sill pair.
  { d: 'M 0 168 L 206 248', w: 0.55 },
  { d: 'M 404 742 L 0 872', w: 0.7 },
  { d: 'M 396 764 L 0 898', w: 0.45 },

  // Right side window, mirrored.
  { d: 'M 1920 168 L 1714 248', w: 0.55 },
  { d: 'M 1516 742 L 1920 872', w: 0.7 },
  { d: 'M 1524 764 L 1920 898', w: 0.45 },

  // Dashboard cowl echo — the second sweep under the windshield's bottom edge.
  { d: 'M 368 782 Q 960 1005 1552 782', w: 0.75 },

  // Centre console: plateau + shoulders, with a parallel inner echo.
  { d: 'M 556 1080 L 572 1016 L 712 886 L 1208 886 L 1348 1016 L 1364 1080', w: 0.9 },
  { d: 'M 598 1080 L 610 1030 L 730 904 L 1190 904 L 1310 1030 L 1322 1080', w: 0.55 },

  // Lower wing diagonals — the dash edges running out to the corners.
  { d: 'M 0 940 L 360 1035', w: 0.4 },
  { d: 'M 1920 940 L 1560 1035', w: 0.4 },

  // Right instrument arc: a large circle mostly off-screen, bulging into the
  // frame (the left flank's half-circle gauge is the LIVE .hud-arc instrument;
  // this is its silent structural twin).
  { d: 'M 1978 242 A 344 344 0 0 0 1978 838', w: 0.5 },
  { d: 'M 1962 300 A 316 316 0 0 0 1962 780', w: 0.3 },
];

// The strut band between the canopy's outer and inner edges — filled dark so
// the frame reads as a solid member the scene sits BEHIND, not two floating
// hairlines. evenodd on the two closed hexagons yields exactly the band.
const CANOPY_BAND = `${CANOPY_OUTER} ${CANOPY_INNER}`;

// The cockpit's OPAQUE interior — what turns floating hairlines into a ship.
// Two masses: the ceiling band above the canopy (following the top-corner
// cuts out to the side-window rakes) and the dashboard, whose top edge IS the
// windshield's bottom curve continued down the side sills. The scene stays
// visible only through glass; the corners go dark exactly like the reference.
const PANELS: string[] = [
  // Ceiling: viewport top edge down to the canopy top + side rakes.
  'M 0 0 L 1920 0 L 1920 168 L 1714 248 L 1522 86 L 398 86 L 206 248 L 0 168 Z',
  // Dashboard: up the left sill, along the canopy's bottom curve, down the
  // right sill, closed across the viewport bottom.
  'M 0 872 L 404 742 Q 960 950 1516 742 L 1920 872 L 1920 1080 L 0 1080 Z',
];

// Where the light rests before the first marker frame arrives (and for the
// reduced-motion poster path, which has no live scene): the star's home
// position, centre-screen and a touch high.
const LIGHT_HOME_X = 960;
const LIGHT_HOME_Y = 460;
// Lerp factor per frame — the light glides after the star rather than
// twitching with it (the scene's own camera is smoothed the same way).
const LIGHT_EASE = 0.09;
// Skip the DOM write (and the repaint it forces) when the light is parked.
const LIGHT_EPSILON = 0.4;

/** Render one full pass of the line set. `className` picks the pass's stroke
 *  colour in CSS; per-path opacity applies the facing weight, scaled so the
 *  base pass stays readable even at w=0.3. */
function LinePass({ className, weightFloor }: { className: string; weightFloor: number }) {
  return (
    <g className={className}>
      {PATHS.map((p, i) => (
        <path key={i} d={p.d} strokeOpacity={weightFloor + (1 - weightFloor) * p.w} />
      ))}
    </g>
  );
}

export default function CockpitFrame({ markerFrameRef }: CockpitFrameProps) {
  const { reduced } = useSceneState();
  const litGradRef = useRef<SVGRadialGradientElement>(null);
  const hotGradRef = useRef<SVGRadialGradientElement>(null);

  // The light-tracking loop. Reads the star's projected position from the
  // frame-cadence ref and eases both gradient centres toward it. No React
  // state — this is exactly the StarMarker/compass rAF idiom.
  useEffect(() => {
    if (reduced) return; // poster mode: no live scene, the light stays home
    const lit = litGradRef.current;
    const hot = hotGradRef.current;
    if (!lit || !hot) return;

    let x = LIGHT_HOME_X;
    let y = LIGHT_HOME_Y;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      // Ghost mode: the canopy is invisibility-gated in CSS while the HUD is
      // dark, so tracking the light would only force wasted SVG repaints. The
      // lerp resumes at ignition and converges during the unzoom.
      if (!document.body.classList.contains('hud-active')) return;
      const m = markerFrameRef.current;
      // Clamp just past the frame so an off-screen star still rakes the near
      // edge instead of dragging the light into nowhere.
      const tx = m ? Math.max(-200, Math.min(VB_W + 200, (m.x / window.innerWidth) * VB_W)) : LIGHT_HOME_X;
      const ty = m ? Math.max(-200, Math.min(VB_H + 200, (m.y / window.innerHeight) * VB_H)) : LIGHT_HOME_Y;
      const nx = x + (tx - x) * LIGHT_EASE;
      const ny = y + (ty - y) * LIGHT_EASE;
      if (Math.abs(nx - x) < LIGHT_EPSILON && Math.abs(ny - y) < LIGHT_EPSILON) return;
      x = nx;
      y = ny;
      lit.setAttribute('cx', String(x));
      lit.setAttribute('cy', String(y));
      hot.setAttribute('cx', String(x));
      hot.setAttribute('cy', String(y));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, markerFrameRef]);

  return (
    <svg
      className="bh-cockpit"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* Wide falloff: the star's ambient reach across the frame. */}
        <radialGradient
          ref={litGradRef}
          id="ckpt-lit-grad"
          gradientUnits="userSpaceOnUse"
          cx={LIGHT_HOME_X}
          cy={LIGHT_HOME_Y}
          r="1050"
        >
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.62" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {/* Tight core: the specular kiss nearest the photosphere. */}
        <radialGradient
          ref={hotGradRef}
          id="ckpt-hot-grad"
          gradientUnits="userSpaceOnUse"
          cx={LIGHT_HOME_X}
          cy={LIGHT_HOME_Y}
          r="430"
        >
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="ckpt-lit-mask">
          <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#ckpt-lit-grad)" />
        </mask>
        <mask id="ckpt-hot-mask">
          <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#ckpt-hot-grad)" />
        </mask>
      </defs>

      {/* The opaque interior first: ceiling + dashboard masses, then the canopy
          strut band between the windshield's edge pair. */}
      {PANELS.map((d, i) => (
        <path key={i} className="bh-cockpit-panel" d={d} />
      ))}
      <path className="bh-cockpit-band" d={CANOPY_BAND} fillRule="evenodd" />

      {/* Panel sheen — the interior surfaces themselves catch the star's light:
          the same masses re-filled with the lit colour under the tight specular
          gradient, so the dash glows faintly warm when the body hangs low. */}
      <g mask="url(#ckpt-hot-mask)">
        {PANELS.map((d, i) => (
          <path key={i} className="bh-cockpit-sheen" d={d} />
        ))}
        <path className="bh-cockpit-sheen" d={CANOPY_BAND} fillRule="evenodd" />
      </g>

      {/* The three lighting passes over one line set (see header comment). */}
      <LinePass className="bh-cockpit-base" weightFloor={0.55} />
      <g mask="url(#ckpt-lit-mask)">
        <LinePass className="bh-cockpit-lit" weightFloor={0.15} />
      </g>
      <g mask="url(#ckpt-hot-mask)">
        <LinePass className="bh-cockpit-hot" weightFloor={0} />
      </g>
    </svg>
  );
}
