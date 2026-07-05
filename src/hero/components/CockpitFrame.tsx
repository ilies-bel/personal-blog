// The cockpit canopy's REDUCED-MOTION fallback — a static SVG line drawing of
// the same geometry the live WebGL rig renders (buildCockpit.ts; the single
// design-space source is cockpitGeometry.ts, corners pre-rounded there).
//
// The live path does NOT mount this: the canopy is part of the scene itself
// (per-pixel star lighting, bloom, the clip-space unzoom). Under reduced motion
// there is no scene and no light to track, so this renders the frame with a
// fixed light resting at the star's home position — the poster-slideshow
// equivalent of the lit cockpit. Visibility is a plain CSS crossfade off the
// same power FSM body classes (see hud.css → "COCKPIT CANOPY", the
// prefers-reduced-motion branch).
import {
  COCKPIT_LINES,
  CANOPY_OUTER,
  CANOPY_INNER,
  PANEL_CEILING,
  PANEL_DASH,
  COCKPIT_W,
  COCKPIT_H,
  toPathD,
} from '../cockpitGeometry';

// Where the light rests: the star's home position, centre-screen, a touch high.
const LIGHT_HOME_X = 960;
const LIGHT_HOME_Y = 460;

/** One full pass of the line set; `className` picks the pass's stroke colour,
 *  per-path opacity applies the facing weight over the pass's floor, and each
 *  member carries its authored piping width (non-scaling-stroke ⇒ CSS px). */
function LinePass({ className, weightFloor }: { className: string; weightFloor: number }) {
  return (
    <g className={className}>
      {COCKPIT_LINES.map((line, i) => (
        <path
          key={i}
          d={toPathD(line.pts, line.closed)}
          strokeOpacity={weightFloor + (1 - weightFloor) * line.w}
          strokeWidth={line.px}
        />
      ))}
    </g>
  );
}

export default function CockpitFrame() {
  return (
    <svg
      className="bh-cockpit"
      viewBox={`0 0 ${COCKPIT_W} ${COCKPIT_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* Wide falloff: the resting star's ambient reach across the frame. */}
        <radialGradient
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
        <mask id="ckpt-lit-mask">
          <rect x="0" y="0" width={COCKPIT_W} height={COCKPIT_H} fill="url(#ckpt-lit-grad)" />
        </mask>
      </defs>

      {/* The opaque interior: ceiling + dashboard masses, then the canopy strut
          band between the windshield's edge pair (evenodd fills the ring gap). */}
      <path className="bh-cockpit-panel" d={toPathD(PANEL_CEILING, true)} />
      <path className="bh-cockpit-panel" d={toPathD(PANEL_DASH, true)} />
      <path
        className="bh-cockpit-band"
        d={`${toPathD(CANOPY_OUTER.pts, true)} ${toPathD(CANOPY_INNER.pts, true)}`}
        fillRule="evenodd"
      />

      {/* Two passes: a flat dim base and a lit pass under the resting gradient. */}
      <LinePass className="bh-cockpit-base" weightFloor={0.55} />
      <g mask="url(#ckpt-lit-mask)">
        <LinePass className="bh-cockpit-lit" weightFloor={0.15} />
      </g>
    </svg>
  );
}
