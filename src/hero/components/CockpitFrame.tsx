// The cockpit canopy's REDUCED-MOTION fallback — a static SVG schematic of the
// same solid-metal canopy the live WebGL rig renders (buildCockpit.ts; the
// single design-space source is cockpitGeometry.ts). Under reduced motion there
// is no scene and no light to track, so this draws the hull as a filled dark
// mass with the glass panes cut out, the struts + console as strokes, and the
// HUD reticle omitted (kept calm). Visibility is a plain CSS crossfade off the
// power FSM body classes (see hud.css → "COCKPIT CANOPY").
import {
  GLASS_PANES,
  HULL_OUTER,
  CONSOLE_FILL,
  CONSOLE_SCREEN,
  FALLBACK_LINES,
  COCKPIT_W,
  COCKPIT_H,
  toPathD,
} from '../cockpitGeometry';

export default function CockpitFrame() {
  // The hull fill: the outer rect with every pane as an evenodd hole.
  const hullD = `${toPathD(HULL_OUTER, true)} ${GLASS_PANES.map((p) => toPathD(p, true)).join(' ')}`;

  return (
    <svg
      className="bh-cockpit"
      viewBox={`0 0 ${COCKPIT_W} ${COCKPIT_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Solid metal hull (panes cut out with evenodd), then the console mass. */}
      <path className="bh-cockpit-panel" d={hullD} fillRule="evenodd" />
      <path className="bh-cockpit-panel" d={toPathD(CONSOLE_FILL, true)} />
      <path className="bh-cockpit-screen" d={toPathD(CONSOLE_SCREEN, true)} />

      {/* Struts + pane outlines as edge-lit strokes. */}
      <g className="bh-cockpit-strut">
        {FALLBACK_LINES.map((line, i) => (
          <path key={i} d={toPathD(line.pts, line.closed)} strokeWidth={line.px} fill="none" />
        ))}
      </g>
    </svg>
  );
}
