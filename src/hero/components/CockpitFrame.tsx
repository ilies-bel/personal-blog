// Reduced-motion cockpit fallback. The live WebGL overlay and this static DOM
// image consume the exact same precomposed RGBA plate; there is no second SVG
// renderer and therefore no alternate junction topology to drift or overlap.
import { COCKPIT_H, COCKPIT_PLATE_URL, COCKPIT_W } from '../cockpitPlate';

export default function CockpitFrame() {
  return (
    <img
      className="bh-cockpit"
      src={COCKPIT_PLATE_URL}
      width={COCKPIT_W}
      height={COCKPIT_H}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
    />
  );
}
