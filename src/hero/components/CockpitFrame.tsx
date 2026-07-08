// The cockpit canopy's REDUCED-MOTION fallback — a static SVG drawing of the
// same geometry the live WebGL rig renders (buildCockpit.ts; the single
// design-space source is cockpitGeometry.ts, corners pre-rounded there).
//
// The live path does NOT mount this: the canopy is part of the scene itself
// (per-pixel star lighting, bloom, the beam shader's milled metal). Under
// reduced motion there is no scene and no light to track, so this renders the
// frame with a fixed light resting at the star's home position.
//
// BEAMS are drawn as two layered strokes per member: a wide amber stroke
// UNDER a slightly narrower dark-metal stroke — the exposed sliver each side
// is the edge-lit hairline pair, the poster equivalent of the beam shader's
// cross-section. GROOVES (narrow beams) get the same treatment and read as
// seams. A masked lit pass re-strokes the amber under the resting light's
// radial falloff so the frame still reads as LIT, not flat. Visibility is a
// plain CSS crossfade off the power FSM body classes (see hud.css →
// "COCKPIT CANOPY", the prefers-reduced-motion branch).
import {
  COCKPIT_BEAMS,
  HULL_OUTER,
  HULL_HOLE,
  PANEL_SCREEN,
  COCKPIT_W,
  COCKPIT_H,
  toPathD,
} from '../cockpitGeometry';

// Where the light rests: the star's home position, centre-screen, a touch high.
const LIGHT_HOME_X = 960;
const LIGHT_HOME_Y = 460;

/** One pass of beam underlays; `className` picks the stroke colour. */
function BeamEdgePass({ className }: { className: string }) {
  return (
    <g className={className}>
      {COCKPIT_BEAMS.map((beam, i) => (
        <path key={i} d={toPathD(beam.pts, beam.closed)} strokeWidth={beam.dw} strokeOpacity={0.4 + 0.6 * beam.w} />
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

      {/* The opaque interior: one hull shell with the glass as a hole
          (even-odd — outer rect + the canopy ring as subpaths). */}
      <path
        className="bh-cockpit-panel"
        d={`${toPathD(HULL_OUTER, true)} ${toPathD(HULL_HOLE, true)}`}
        fillRule="evenodd"
      />
      {/* The recessed console screen glass. */}
      <path className="bh-cockpit-panel" d={toPathD(PANEL_SCREEN, true)} />

      {/* Beam underlays: dim base, then the lit pass under the resting light. */}
      <BeamEdgePass className="bh-cockpit-beam-base" />
      <g mask="url(#ckpt-lit-mask)">
        <BeamEdgePass className="bh-cockpit-beam-lit" />
      </g>

      {/* Metal overlay: the dark band that leaves only the edge slivers lit. */}
      <g>
        {COCKPIT_BEAMS.map((beam, i) => (
          <path
            key={i}
            className="bh-cockpit-beam-metal"
            d={toPathD(beam.pts, beam.closed)}
            strokeWidth={Math.max(2, beam.dw - 3)}
          />
        ))}
      </g>
    </svg>
  );
}
