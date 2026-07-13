// The cockpit canopy's REDUCED-MOTION fallback — a static SVG drawing of the
// same geometry the live WebGL rig renders (buildCockpit.ts; the single
// design-space source is cockpitGeometry.ts, corners pre-rounded there).
//
// The live path does NOT mount this: the canopy is part of the scene itself
// (per-pixel star lighting and the beam shader's crisp milled metal). Under
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
// "COCKPIT CANOPY", the reduced-motion branch).
import {
  CANOPY_CORE,
  COCKPIT_BEAMS,
  COCKPIT_BEAMS_ABOVE_SCREEN_SHELLS,
  COCKPIT_ARM_CORE_BEAMS,
  COCKPIT_BEAMS_BELOW_SCREEN,
  COCKPIT_Y_EXTERIOR_BEAMS,
  HULL_OUTER,
  HULL_HOLES,
  PANEL_SCREEN,
  COCKPIT_W,
  COCKPIT_H,
  Y_JUNCTION_PATCHES,
  toPathD,
} from '../cockpitGeometry';

// Where the light rests: the star's home position, centre-screen, a touch high.
const LIGHT_HOME_X = 960;
const LIGHT_HOME_Y = 460;

/** One pass of beam underlays; `className` picks the stroke colour. */
function BeamEdgePass({ className, beams = COCKPIT_BEAMS }: { className: string; beams?: typeof COCKPIT_BEAMS }) {
  return (
    <g className={className}>
      {beams.map((beam, i) => (
        <path key={i} d={toPathD(beam.pts, beam.closed)} strokeWidth={beam.dw} strokeOpacity={0.4 + 0.6 * beam.w} />
      ))}
    </g>
  );
}

function BeamMetalPass({ beams }: { beams: typeof COCKPIT_BEAMS }) {
  return (
    <g>
      {beams.map((beam, i) => (
        <path
          key={i}
          className="bh-cockpit-beam-metal"
          d={toPathD(beam.pts, beam.closed)}
          strokeWidth={Math.max(2, beam.dw - 3)}
        />
      ))}
    </g>
  );
}

function BeamLayers({ beams }: { beams: typeof COCKPIT_BEAMS }) {
  return (
    <g>
      <BeamEdgePass className="bh-cockpit-beam-base" beams={beams} />
      <g mask="url(#ckpt-lit-mask)">
        <BeamEdgePass className="bh-cockpit-beam-lit" beams={beams} />
      </g>
      <BeamMetalPass beams={beams} />
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

      {/* The opaque interior: one hull shell with every glass pane as a hole
          (even-odd — outer rect + the central gem + the corner and flank
          side windows as subpaths). */}
      <path
        className="bh-cockpit-panel"
        d={`${toPathD(HULL_OUTER, true)} ${HULL_HOLES.map((hole) => toPathD(hole, true)).join(' ')}`}
        fillRule="evenodd"
      />
      {/* Deck plates first: the physical screen glass occludes any ridge that
          passes behind the console, matching the live renderer's layer split. */}
      <BeamEdgePass className="bh-cockpit-beam-base" beams={COCKPIT_BEAMS_BELOW_SCREEN} />
      <g mask="url(#ckpt-lit-mask)">
        <BeamEdgePass className="bh-cockpit-beam-lit" beams={COCKPIT_BEAMS_BELOW_SCREEN} />
      </g>
      <BeamMetalPass beams={COCKPIT_BEAMS_BELOW_SCREEN} />
      <path className="bh-cockpit-panel" d={toPathD(PANEL_SCREEN, true)} />
      <BeamEdgePass className="bh-cockpit-beam-base" beams={COCKPIT_BEAMS_ABOVE_SCREEN_SHELLS} />
      <g mask="url(#ckpt-lit-mask)">
        <BeamEdgePass className="bh-cockpit-beam-lit" beams={COCKPIT_BEAMS_ABOVE_SCREEN_SHELLS} />
      </g>

      {/* Shell metal first, then a flat casting over the arm/canopy overlap.
          The continuous core laminations paint last, so both branches flow
          through one uninterrupted Y-shaped mass rather than two ribbons. */}
      <BeamMetalPass beams={COCKPIT_BEAMS_ABOVE_SCREEN_SHELLS} />
      {Y_JUNCTION_PATCHES.map((patch, i) => (
        <path key={i} className="bh-cockpit-junction" d={toPathD(patch, true)} />
      ))}
      <BeamLayers beams={COCKPIT_Y_EXTERIOR_BEAMS} />
      <BeamLayers beams={COCKPIT_ARM_CORE_BEAMS} />
      <BeamLayers beams={[CANOPY_CORE]} />
    </svg>
  );
}
