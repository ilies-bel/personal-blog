// The cockpit HUD geometry — white holographic instruments projected on the
// glass (the tasteful subset recovered from the solid-canopy experiment):
//   • a SCANNER RETICLE — outer ring, inner tick ring, hex reticle, corner
//     bracket arcs and crosshair stubs — that TRACKS THE STAR: its lines are
//     authored around the origin and the vertex shader re-centres them on
//     uLight every frame, so the reticle rides the body on screen like a
//     target lock instead of floating at a fixed point;
//   • a fixed COMPASS strip of ticks under the canopy's top beam.
//
// Built as line ribbons (the struts' extrusion, hairline), consumed by
// buildCockpit's HUD mesh with cockpitHudVertexShader/FragmentShader. Each
// vertex carries aFollow: 1 = star-anchored (authored origin-relative),
// 0 = fixed (authored in absolute design px).
import * as THREE from 'three';
import { COCKPIT_W } from '../cockpitPlate';

type Pt = [number, number];
interface HudLine {
  pts: Pt[];
  /** CSS half-px width (the HUD is hairline holography). */
  hw: number;
  /** 1 = re-centred on the star per frame, 0 = fixed design position. */
  follow: number;
  closed?: boolean;
}

const CX = COCKPIT_W / 2; // 960

function circle(cx: number, cy: number, r: number, segs = 72): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

function hex(cx: number, cy: number, r: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

function hudLines(): HudLine[] {
  const lines: HudLine[] = [];

  // ── The scanner reticle (star-anchored, authored around the origin) ──────
  // The reference's rectilinear lock: a main ring with its tick ring just
  // inside, a fainter inner disc, a hex lock on the body, a full thin
  // CROSSHAIR passing through (gapped at the hex), and four L-shaped corner
  // brackets on the enclosing square — a camera viewfinder, not arc jewellery.
  const R = 132;
  // Main ring + the fainter inner disc.
  lines.push({ pts: circle(0, 0, R), hw: 0.55, follow: 1, closed: true });
  lines.push({ pts: circle(0, 0, R * 0.62), hw: 0.35, follow: 1, closed: true });
  // Radial tick ring just inside the main ring; every 4th tick runs long.
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const long = i % 4 === 0;
    const r0 = R - 4;
    const r1 = r0 - (long ? 12 : 6);
    lines.push({
      pts: [
        [Math.cos(a) * r0, Math.sin(a) * r0],
        [Math.cos(a) * r1, Math.sin(a) * r1],
      ],
      hw: long ? 0.55 : 0.4,
      follow: 1,
    });
  }
  // Hex lock — the mark on the body itself.
  lines.push({ pts: hex(0, 0, 24), hw: 0.65, follow: 1, closed: true });
  // Full crosshair, gapped at the hex: thin lines running well past the ring.
  const reach = R * 1.75;
  const gap = 36;
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ] as const) {
    lines.push({
      pts: [
        [dx * gap, dy * gap],
        [dx * reach, dy * reach],
      ],
      hw: 0.4,
      follow: 1,
    });
  }
  // L-shaped corner brackets on the enclosing square.
  const s = R * 1.35;
  const arm = 36;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    lines.push({
      pts: [
        [sx * s - sx * arm, sy * s],
        [sx * s, sy * s],
        [sx * s, sy * s - sy * arm],
      ],
      hw: 0.7,
      follow: 1,
    });
  }

  // ── The compass strip (fixed, just inside the canopy's top beam;
  //    measured y≈183-192 in the reference, numerals riding above) ──────────
  const compY = 182;
  const compHalf = 300;
  for (let i = -6; i <= 6; i++) {
    const x = CX + (i / 6) * compHalf;
    const long = i % 3 === 0;
    lines.push({
      pts: [
        [x, compY],
        [x, compY + (long ? 16 : 9)],
      ],
      hw: long ? 0.7 : 0.5,
      follow: 0,
    });
  }
  lines.push({
    pts: [
      [CX - compHalf, compY],
      [CX + compHalf, compY],
    ],
    hw: 0.5,
    follow: 0,
  });

  return lines;
}

/** Extrude the HUD lines into a ribbon geometry (aPos/aNorm/aSide/aHalf/
 *  aFollow) for buildCockpit's HUD mesh. Same miter scheme as the struts. */
export function buildHudGeometry(): THREE.BufferGeometry {
  const lines = hudLines();
  const pos: number[] = [];
  const norm: number[] = [];
  const side: number[] = [];
  const half: number[] = [];
  const follow: number[] = [];
  const idx: number[] = [];

  for (const line of lines) {
    const pts = line.closed ? [...line.pts, line.pts[0]] : [...line.pts];
    const n = pts.length;
    if (n < 2) continue;
    const first = pos.length / 2;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const prev = i > 0 ? pts[i - 1] : line.closed ? pts[n - 2] : pts[0];
      const next = i < n - 1 ? pts[i + 1] : line.closed ? pts[1] : pts[n - 1];
      let d1x = p[0] - prev[0];
      let d1y = p[1] - prev[1];
      let d2x = next[0] - p[0];
      let d2y = next[1] - p[1];
      const l1 = Math.hypot(d1x, d1y) || 1;
      const l2 = Math.hypot(d2x, d2y) || 1;
      d1x /= l1;
      d1y /= l1;
      d2x /= l2;
      d2y /= l2;
      let tx = d1x + d2x;
      let ty = d1y + d2y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const nx = -ty;
      const ny = tx;
      const miter = 1 / Math.max(0.4, nx * -d1y + ny * d1x);
      for (const s of [-1, 1]) {
        pos.push(p[0], p[1]);
        norm.push(nx * miter, ny * miter);
        side.push(s);
        half.push(line.hw);
        follow.push(line.follow);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a = first + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('aPos', new THREE.BufferAttribute(new Float32Array(pos), 2));
  geo.setAttribute('aNorm', new THREE.BufferAttribute(new Float32Array(norm), 2));
  geo.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(side), 1));
  geo.setAttribute('aHalf', new THREE.BufferAttribute(new Float32Array(half), 1));
  geo.setAttribute('aFollow', new THREE.BufferAttribute(new Float32Array(follow), 1));
  geo.setAttribute('position', geo.getAttribute('aPos'));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(960, 540, 0), 4000);
  return geo;
}
